import test from 'node:test';
import assert from 'node:assert/strict';
import {locomotionPose} from '../shared/locomotion.mjs';
import {segmentAnchor,SEGMENT_BONES} from '../shared/rig.mjs';
import {transformMatrix,transformPoint} from '../shared/part-motion.mjs';
import {VisualSpecSchema} from '../shared/schema.mjs';
import {actor,nodes} from '../renderer/draw.mjs';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';
import {evaluate} from '../renderer/engine.mjs';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const direction of [-1,1])test(`world-space feet remain planted and transitions continuous facing ${direction}`,()=>{
 const options={from:[100,780],to:[100+direction*200,780],duration:3,scale:.6};
 let previous,contacts=0;
 for(let i=0;i<=3000;i++){
  const current=locomotionPose({...options,time:i/1000});
  for(const foot of ['leftFoot','rightFoot']){
   assert.ok(Math.hypot(current[foot][0],current[foot][1]+160)<172,'reachable leg');
   if(previous){
    assert.ok(Math.hypot(...current[foot].map((v,k)=>v-previous[foot][k]))<1,'no pose jump');
    if(current[foot][1]===0&&previous[foot][1]===0){near(current.position[0]+current[foot][0]*.6,previous.position[0]+previous[foot][0]*.6);contacts++;}
   }
  }
  previous=current;
 }
 assert.ok(contacts>1000);assert.deepEqual(previous.leftFoot,[-30,0]);assert.deepEqual(previous.rightFoot,[35,0]);
});
test('zero-distance walk does not march or change its resting feet',()=>{
 const pose=locomotionPose({from:[10,20],to:[10,20],duration:3,time:1});assert.equal(pose.gait,0);assert.deepEqual(pose.leftFoot,[-30,0]);
});
test('skin segments join exactly at elbows and knees and remain valid drawable geometry',()=>{
 const p=dynamicFixture(),s=evaluate(p.scenes[0],2,p.propDesigns).states.hero;
 const ends={};
 for(const bone of SEGMENT_BONES){
  const a=segmentAnchor(bone,s),matrix=transformMatrix(a.position,a.rotation,a.scale);
  ends[bone]=[transformPoint(matrix,[0,0]),transformPoint(matrix,[0,100])];
  const spec=VisualSpecSchema.parse({geometryRecipe:[{kind:'group',bone,children:[{kind:'line',from:[0,0],to:[0,100],width:10}]}]});
  const svg=nodes(spec.geometryRecipe,0,{}, {pose:s});assert.doesNotMatch(svg,/NaN|undefined/);
 }
 for(const side of ['left','right'])for(const [a,b] of [['UpperArm','Forearm'],['Thigh','Shin']])for(let k=0;k<2;k++)near(ends[side+a][1][k],ends[side+b][0][k]);
});
test('woman ponytail differs from tuft in pencil style and suit is respected',()=>{
 const p=dynamicFixture(),s=evaluate(p.scenes[0],0,p.propDesigns).states.hero;
 const design={...p.characters[0],kind:'woman',costume:'everyday',artStyle:'pencil',hairStyle:'ponytail'};
 assert.notEqual(actor(design,s,0),actor({...design,hairStyle:'tuft'},s,0));
 assert.notEqual(actor({...design,wardrobe:'suit'},s,0),actor({...design,wardrobe:'default'},s,0));
});
test('seconds-authored performance keys lower to normalized time without changing poses',async()=>{
 const {normalizeDirectedScene}=await import('../shared/normalize-directed-scene.mjs');
 const original={scene:{beats:[{kind:'perform',duration:4,keyframes:[{at:1,pose:{headAngle:20}},{at:3,pose:{headAngle:0}}]}]}};
 const out=normalizeDirectedScene(original).scene.beats[0].keyframes;
 assert.deepEqual(out.map(k=>k.at),[0,.25,.75,1]);assert.equal(out[1].pose.headAngle,20);assert.equal(original.scene.beats[0].keyframes[0].at,1);
});
test('generated reactions with executable keys become performances, empty metadata is removed and execution IDs are compiled later',async()=>{
 const {normalizeDirectedScene}=await import('../shared/normalize-directed-scene.mjs');
 const raw={scene:{cast:[{id:'man',characterId:'man'}],props:[],beats:[{id:'beat',kind:'react',duration:2,keyframes:[{at:0,pose:{eyeOpen:1.2}},{at:1,pose:{eyeOpen:.5}}]},{kind:'idle',constraints:[],keyframes:[]}],sounds:[]}};
 const scene=normalizeDirectedScene(raw).scene;
 assert.equal(scene.cast[0].id,undefined);assert.equal(scene.beats[0].kind,'perform');assert.equal(scene.beats[0].keyframes[0].pose.eyeOpen,1);assert.equal(scene.beats[1].keyframes,undefined);assert.equal(scene.beats[1].constraints,undefined);assert.equal(raw.scene.beats[0].kind,'react');
});
test('dynamic camera fitting keeps native heads inside the frame while preserving shot timing and focus',async()=>{
 const {fitDynamicCameras}=await import('../shared/dynamic-framing.mjs');
 const p=dynamicFixture();p.scenes[0].cast[0].scale=1;p.scenes[0].shots=[{start:0,end:10,focus:[60,720],zoom:1}];
 const fixed=fitDynamicCameras(p),shot=fixed.scenes[0].shots[0];assert.ok(shot.zoom<1);assert.deepEqual(shot.focus,[60,720]);assert.equal(shot.start,0);assert.equal(shot.end,10);assert.equal(p.scenes[0].shots[0].zoom,1);
 const s=evaluate(fixed.scenes[0],0,fixed.propDesigns).states.hero;const top=540*.51+(s.position[1]+s.head[1]-120-720)*shot.zoom*.73;assert.ok(top>=15.9);
});
test('generated zero-offset initial roots use cast placement and valid absolute roots lower without changing their location',async()=>{
 const {normalizeDirectedScene}=await import('../shared/normalize-directed-scene.mjs');
 const zero=normalizeDirectedScene({scene:{cast:[{characterId:'a',x:220,y:780,initialPose:{position:[0,0],headAngle:5}}]}}).scene.cast[0];
 assert.equal(zero.x,220);assert.equal(zero.y,780);assert.equal(zero.initialPose.position,undefined);assert.equal(zero.initialPose.headAngle,5);
 const absolute=normalizeDirectedScene({scene:{cast:[{characterId:'a',x:220,y:780,initialPose:{position:[250,700]}}]}}).scene.cast[0];assert.equal(absolute.x,250);assert.equal(absolute.y,700);assert.equal(absolute.initialPose.position,undefined);
});
