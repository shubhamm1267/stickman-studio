import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MOTION_CAPABILITIES,validatePlan} from '../shared/schema.mjs';
import {evaluate,svgFrame} from '../renderer/engine.mjs';
import {migrateMotionIR,performanceTrack} from '../shared/motion-ir.mjs';
import {canonicalizePlan,planToStoryIR,storyIRToPlan} from '../shared/canonical-story-ir.mjs';
import {inspectPlan} from '../server/inspect.mjs';
const legacy=validatePlan(JSON.parse(await readFile(new URL('../examples/simple-slap.json',import.meta.url),'utf8')));
const fixture=validatePlan(JSON.parse(await readFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),'utf8')));
const animalPlan=()=>{const p=structuredClone(fixture);p.characters[0].kind='dog';p.scenes[0].cast[0].species='dog';for(const track of p.scenes[0].motionIR.tracks){track.constraints=[];for(const key of track.keyframes)for(const control of ['rightHand','leftHand','rightFoot','leftFoot','hip','head'])delete key.pose[control];}return p;};
test('legacy migration preserves poses, coverage and inputs while keyframes have one canonical owner',()=>{
 const original=structuredClone(legacy),p=validatePlan(migrateMotionIR(legacy,{seed:1}));
 assert.deepEqual(legacy,original);assert.deepEqual(p.coverage,legacy.coverage);
 for(const [i,s] of p.scenes.entries())for(const t of [0,.19,.7,1.5,2.486,5.1,s.duration])assert.deepEqual(evaluate(s,t,p.propDesigns),evaluate(legacy.scenes[i],t,legacy.propDesigns));
 for(const s of p.scenes)for(const b of s.beats.filter(b=>b.kind==='perform')){assert.equal(b.keyframes,undefined);assert.ok(performanceTrack(s,b).keyframes);}
 assert.deepEqual(migrateMotionIR(p),p);
});
test('Plan v1 and saved Motion IR fixtures upgrade and round-trip without changing evaluated legacy motion',()=>{
 for(const source of [legacy,fixture]){
  const upgraded=validatePlan(migrateMotionIR(source,{seed:93}));
  const ir=planToStoryIR(upgraded),canonical=canonicalizePlan(upgraded);
  const roundTrip=validatePlan(storyIRToPlan(ir));
  assert.deepEqual(roundTrip,canonical.plan);
  assert.equal(ir.compatibility.schemaVersion,1);
  for(const [sceneIndex,scene] of upgraded.scenes.entries()){
   for(const time of [0,.2,.7,1.5,2.4,scene.duration]){
    assert.deepEqual(
     evaluate(roundTrip.scenes[sceneIndex],time,roundTrip.propDesigns),
     evaluate(source.scenes[sceneIndex],time,source.propDesigns),
    );
   }
  }
 }
});
test('versioned tracks reject missing references, IDs, controls, bounds and excessive output',()=>{
 for(const [mutate,pattern] of [
  [p=>p.scenes[0].beats[0].motionTrackId='missing',/missing motion track/],
  [p=>p.scenes[0].motionIR.tracks[0].actorId='missing',/actor.*missing/],
  [p=>p.scenes[0].motionIR.tracks[0].keyframes[1].pose.hack=1,/Unrecognized/],
  [p=>p.scenes[0].motionIR.tracks[0].keyframes[1].pose.bodyAngle=Infinity,/Invalid/],
  [p=>p.scenes[0].motionIR.tracks[0].keyframes[1].at=0,/Performance keys/],
  [p=>p.scenes[0].motionIR.tracks[0].duration=10,/timing exceeds scene/],
  [p=>p.scenes[0].motionIR.tracks[0].constraints[0].points=['head'],/Invalid/],
  [p=>p.scenes[0].motionIR.tracks.push(structuredClone(p.scenes[0].motionIR.tracks[0])),/duplicate motion track/],
  [p=>p.scenes[0].beats[0].keyframes=[{at:0,pose:{}},{at:1,pose:{}}],/only performance source/],
  [p=>p.scenes[0].motionIR.schemaVersion=99,/Invalid/],
  [p=>p.scenes[0].motionIR.tracks=Array(101).fill(p.scenes[0].motionIR.tracks[0]),/Too big/],
 ]){const p=structuredClone(fixture);mutate(p);assert.throws(()=>validatePlan(p),pattern);}
});
test('conflicting active control ownership fails instead of depending on hidden blend order',()=>{
 const p=structuredClone(fixture),s=p.scenes[0],t=s.motionIR.tracks[1];t.start=1;s.beats[1].start=1;
 assert.throws(()=>validatePlan(p),/overlapping control ownership/);
});
test('absolute-time seeking and 60/120fps agree; the novel geometry reaches the shared SVG renderer',()=>{
 const s=fixture.scenes[0],before=structuredClone(fixture),times=[0,.25,.7,1,1.5,2,2.5,3,4];
 const expected=new Map(times.map(t=>[t,evaluate(s,t,fixture.propDesigns)]));
 for(const t of [...times].reverse())assert.deepEqual(evaluate(s,t,fixture.propDesigns),expected.get(t));
 for(let frame=0;frame<=240;frame++){const seconds=frame/60;assert.deepEqual(evaluate(s,seconds,fixture.propDesigns),evaluate(s,(frame*2)/120,fixture.propDesigns));}
 assert.deepEqual(fixture,before);assert.match(svgFrame(fixture,.7),/#27a9a2/);assert.match(svgFrame(fixture,.7),/data-scene-group="true"/);assert.ok(inspectPlan(fixture).ok);
});
test('validated world-stage path tracks drive the shared renderer without action-specific branches',()=>{
 const p=structuredClone(fixture),s=p.scenes[0],track=s.motionIR.tracks[0];
 track.constraints=[];
 track.path=[
  {at:0,position:[300,780]},
  {at:.5,position:[360,750],timing:'gentle'},
  {at:1,position:[420,780]},
 ];
 const valid=validatePlan(p),scene=valid.scenes[0];
 assert.deepEqual(evaluate(scene,0,valid.propDesigns).states.man.position,[300,780]);
 assert.deepEqual(evaluate(scene,1,valid.propDesigns).states.man.position,[360,750]);
 assert.deepEqual(evaluate(scene,2,valid.propDesigns).states.man.position,[420,780]);
 const withConflict=structuredClone(valid);
 withConflict.scenes[0].motionIR.tracks[0].keyframes[1].pose.position=[350,750];
 assert.throws(()=>validatePlan(withConflict),/path and position keyframes cannot both own root position/);
});
test('continuous humanoid facial controls interpolate, seek deterministically and reach SVG output',()=>{
 const p=structuredClone(fixture),s=p.scenes[0],track=s.motionIR.tracks[1];
 track.keyframes=[
  {at:0,pose:{eyeOpenLeft:0,eyeOpenRight:1,browHeight:[-10,10],browTilt:[-20,20],mouthWidth:.75,mouthCurve:-1,mouthAperture:0}},
  {at:1,pose:{eyeOpenLeft:1,eyeOpenRight:0,browHeight:[10,-10],browTilt:[20,-20],mouthWidth:1.25,mouthCurve:1,mouthAperture:1}},
 ];
 const valid=validatePlan(p),scene=valid.scenes[0],atMid=evaluate(scene,3,valid.propDesigns);
 assert.deepEqual(atMid.states.man.eyeOpenLeft,.5);
 assert.deepEqual(atMid.states.man.eyeOpenRight,.5);
 assert.deepEqual(atMid.states.man.browHeight,[0,0]);
 assert.deepEqual(atMid.states.man.browTilt,[0,0]);
 assert.equal(atMid.states.man.mouthWidth,1);
 assert.equal(atMid.states.man.mouthCurve,0);
 assert.equal(atMid.states.man.mouthAperture,.5);
 const expected=evaluate(scene,2.8,valid.propDesigns);
 assert.deepEqual(evaluate(scene,3,valid.propDesigns),atMid);
 assert.deepEqual(evaluate(scene,2.8,valid.propDesigns),expected);
 const frame=svgFrame(valid,3);
 assert.match(frame,/data-dynamic-brows="true"/);
 assert.match(frame,/data-dynamic-mouth="true"/);
});
test('animal rigs reject humanoid-only face controls instead of ignoring them',()=>{
 const p=animalPlan();
 p.scenes[0].motionIR.tracks[1].keyframes[0].pose.mouthWidth=.8;
 assert.throws(()=>validatePlan(p),/Animal rig man does not render motion controls: mouthWidth/);
});
test('rig capability manifest matches animal renderer and rejects ignored limb/contact controls',()=>{
 assert.deepEqual(MOTION_CAPABILITIES.rigControls.animal,['position','bodyAngle','headAngle','eyeOpen','eyeOpenLeft','eyeOpenRight','gaze']);
 assert.deepEqual(MOTION_CAPABILITIES.rigConstraints.animal,[]);
 const unsupportedPose=animalPlan();
 unsupportedPose.scenes[0].motionIR.tracks[0].keyframes[1].pose.rightHand=[90,-255];
 assert.throws(()=>validatePlan(unsupportedPose),/Animal rig man does not render motion controls: rightHand/);
 const unsupportedConstraint=animalPlan();
 unsupportedConstraint.scenes[0].motionIR.tracks[0].constraints=[{kind:'ground',points:['leftFoot'],floorY:780}];
 assert.throws(()=>validatePlan(unsupportedConstraint),/Animal rig man does not support motion constraints: ground/);
});
test('animal tracks accept only controls actually consumed by the animal renderer',()=>{
 const p=animalPlan();
 const track=p.scenes[0].motionIR.tracks[0];
 track.path=[{at:0,position:[250,780]},{at:1,position:[340,780]}];
 const valid=validatePlan(p),scene=valid.scenes[0];
 assert.deepEqual(evaluate(scene,1,valid.propDesigns).states.man.position,[295,780]);
 assert.match(svgFrame(valid,1),/data-ground-shadow="true"/);
});
test('bounded nested scene-graph groups render transforms, pivots, layers and child geometry from data',()=>{
 const p=structuredClone(fixture);
 p.propDesigns[0].nodes=[{
  kind:'group',position:[4,5],pivot:[2,3],rotation:10,scale:[1.2,.8],opacity:.75,
  children:[
   {kind:'path',d:'M-38 -30 L0 -52 L38 -30 Z',fill:'#27a9a2',stroke:'#293329',width:3},
   {kind:'group',position:[0,4],children:[{kind:'ellipse',center:[0,-3],radius:[17,24],fill:'#ffe587',stroke:'#293329',width:2}]},
  ],
 }];
 const valid=validatePlan(p),frame=svgFrame(valid,.7);
 assert.match(frame,/data-scene-group="true"/);
 assert.match(frame,/translate\(4 5\) translate\(2 3\) rotate\(10\) scale\(1\.2 0\.8\) translate\(-2 -3\)/);
 assert.ok(frame.includes('opacity="0.75"'));
 assert.match(frame,/<path d="M-38 -30 L0 -52 L38 -30 Z"/);
 assert.match(frame,/<ellipse cx="0" cy="-3" rx="17" ry="24"/);
});
test('scene-graph nodes reject missing primitive geometry, invalid transforms and excessive nesting',()=>{
 const mutate=(nodes)=>{const p=structuredClone(fixture);p.propDesigns[0].nodes=nodes;return p;};
 assert.throws(()=>validatePlan(mutate([{kind:'group',children:[{kind:'path'}]}])));
 assert.throws(()=>validatePlan(mutate([{kind:'group',scale:[0,1],children:[{kind:'line',from:[0,0],to:[1,1]}]}])));
 const nested=(depth)=>depth===0?{kind:'path',d:'M0 0 L1 1'}:{kind:'group',children:[nested(depth-1)]};
 assert.throws(()=>validatePlan(mutate([nested(5)])));
 assert.throws(()=>validatePlan(mutate([{kind:'group',children:Array.from({length:100},()=>({kind:'line',from:[0,0],to:[1,1]}))}])),/at most 100 geometry nodes/);
});
