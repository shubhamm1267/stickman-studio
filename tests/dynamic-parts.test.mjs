import test from 'node:test';
import assert from 'node:assert/strict';
import {samplePart,findPartMatrix,transformPoint} from '../shared/part-motion.mjs';
import {VisualSpecSchema,NodeSchema,validatePlan} from '../shared/schema.mjs';
import {canonicalizePlan,storyIRToPlan} from '../shared/canonical-story-ir.mjs';
import {evaluate,svgFrameForScene} from '../renderer/engine.mjs';
import {nodes} from '../renderer/draw.mjs';
import {applyPartTracks} from '../server/dynamic-director.mjs';
import {dynamicFixture,makeVehicle,makeAppliance} from '../scripts/make-dynamic-fixtures.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
test('part interpolation handles multiple turns, sparse channels, hold, looping and scene scopes',()=>{
  const n={position:[5,6],animation:[{keys:[{at:1,rotation:0,easing:'linear'},{at:3,rotation:720}]}]};
  close(samplePart(n,2).rotation,360);close(samplePart(n,0).rotation,0);close(samplePart(n,8).rotation,720);
  assert.deepEqual(samplePart(n,2).position,[5,6]);n.animation[0].playback='loop';close(samplePart(n,4).rotation,360);
  n.animation[0].playback='pingpong';close(samplePart(n,4).rotation,360);
  n.animation.push({sceneId:'other',keys:[{at:0,rotation:20,easing:'hold'},{at:4,rotation:50}]});close(samplePart(n,2,'other').rotation,20);
});
test('hierarchical transforms rotate a child around the real parent pivot',()=>{
  const tree=[{id:'arm',kind:'group',position:[10,20],rotation:90,children:[{id:'tip',kind:'group',position:[50,0],children:[{kind:'ellipse',center:[0,0],radius:[5,5]}]}]}];
  const p=transformPoint(findPartMatrix(tree,'tip',0),[0,0]);close(p[0],10);close(p[1],70);
});
test('animated nested joints are rendered and repeat deterministically',()=>{
  const p=dynamicFixture(),a=svgFrameForScene(p,0,0),b=svgFrameForScene(p,0,3);
  assert.notEqual(a,b);assert.equal(b,svgFrameForScene(p,0,3));assert.match(b,/rotate\(-85\)/);
  const canonical=canonicalizePlan(p);assert.equal(svgFrameForScene(canonical.plan,0,3),svgFrameForScene(storyIRToPlan(canonical.ir),0,3));
});
test('machine carries a prop through nested joint transforms and releases continuously',()=>{
  const p=dynamicFixture(),s=p.scenes[0];
  const start=evaluate(s,0,p.propDesigns).props.fridge,raised=evaluate(s,3,p.propDesigns).props.fridge;
  assert.ok(Math.hypot(...raised.position.map((v,i)=>v-start.position[i]))>40);
  const before=evaluate(s,7.999999,p.propDesigns).props.fridge,after=evaluate(s,8,p.propDesigns).props.fridge;
  before.position.forEach((x,i)=>close(x,after.position[i]));close(before.angle,after.angle);
  const later=evaluate(s,9,p.propDesigns).props.fridge;later.position.forEach((x,i)=>close(x,after.position[i]));
  s.motions=[{targetId:'fridge',start:8,duration:2,to:[450,750],arc:0,angle:0,timing:'linear'}];
  const moved=evaluate(validatePlan(p).scenes[0],10,p.propDesigns).props.fridge;close(moved.position[0],450);close(moved.position[1],750);
});
test('invalid joints, cycles, multiple ownership, scale shear and key times fail closed',()=>{
  assert.equal(NodeSchema.safeParse({kind:'group',children:[{kind:'ellipse',center:[0,0],radius:[1,1]}],animation:[{keys:[{at:1,rotation:0},{at:1,rotation:90}]}]}).success,false);
  assert.equal(NodeSchema.safeParse({kind:'ellipse',center:[0,0],radius:[1,1],animation:[]}).success,false);
  for(const mutate of [p=>p.scenes[0].props[1].partAttachment.nodeId='missing',p=>p.scenes[0].props[1].partAttachment.targetId='fridge',p=>p.scenes[0].props[1].attachment={actorId:'hero',bone:'rightHand',offset:[0,0]},p=>p.propDesigns[0].visualSpec.geometryRecipe[0].scale=[1,2]]){
    const p=dynamicFixture();mutate(p);assert.throws(()=>validatePlan(p));
  }
});
test('all authored vehicle and appliance examples contain renderable geometry and real changing parts',()=>{
  for(const d of [...['sedan','jeep','thar','tractor','truck','cycle','bike','jcb'].map(k=>makeVehicle(k,k,k)),...['fridge','ac','tv'].map(k=>makeAppliance(k,k,k))]){
    const spec=VisualSpecSchema.parse(d.visualSpec);const a=nodes(spec.geometryRecipe,0),b=nodes(spec.geometryRecipe,.8);assert.notEqual(a,b,d.id);assert.ok(a.length>500);
  }
});
test('scene-scoped planner tracks survive IR and reject unknown entity/part or wrong scope',()=>{
  const p=dynamicFixture(),track={entityId:'excavator',nodeId:'boom',animation:{playback:'once',keys:[{at:0,rotation:0},{at:2,rotation:45}]}};
  const changed=applyPartTracks(p,'lift',[track]);assert.match(svgFrameForScene(canonicalizePlan(changed).plan,0,2),/rotate\(45\)/);
  assert.throws(()=>applyPartTracks(p,'lift',[{...track,nodeId:'missing'}]));assert.throws(()=>applyPartTracks(p,'lift',[track,track]));
  assert.throws(()=>applyPartTracks(p,'lift',[{...track,animation:{...track.animation,sceneId:'wrong'}}]));
});
test('opening review recognizes visible articulated machinery, rejects static and offscreen parts, and preserves links in IR',async()=>{
 const {linkDynamicHook}=await import('../server/dynamic-director.mjs');const {inspectPlan}=await import('../server/inspect.mjs');
 let p=dynamicFixture();p.hook={sceneId:'lift',start:0,end:2,beatIndices:[0],evidence:'The excavator immediately lifts its articulated boom.'};p.scenes[0].beats=[{actorId:'hero',kind:'idle',start:0,duration:10,intent:'Observe the moving excavator'}];
 p=linkDynamicHook(p);const result=inspectPlan(p);assert.equal(result.hook.timingPassed,true);assert.equal(result.hook.visiblePassed,true);
 const canonical=canonicalizePlan(p);assert.deepEqual(canonical.ir.metadata.hook.partRefs,p.hook.partRefs);assert.deepEqual(storyIRToPlan(canonical.ir).hook.partRefs,p.hook.partRefs);
 const off=structuredClone(p);off.scenes[0].props[0].x=1000;off.scenes[0].shots=[{start:0,end:10,focus:[50,585],zoom:2}];assert.equal(inspectPlan(off).hook.visiblePassed,false);
 const stop=nodes=>{for(const n of nodes){delete n.animation;stop(n.children||[]);}};for(const d of p.propDesigns)stop(d.visualSpec.geometryRecipe);
 assert.equal(inspectPlan(p).hook.timingPassed,false);
});
