import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMotion} from '../shared/motion-ir.mjs';
import {localToWorld,ik} from '../shared/math.mjs';
import {neckOf} from '../shared/rig.mjs';
import {elasticFace} from '../renderer/draw.mjs';
import {compileStylePerformance} from '../shared/style-performance.mjs';
const initial={rigVersion:2,position:[220,780],scale:.8,hip:[0,-160],head:[0,-405],headAngle:0,bodyAngle:0,leftFoot:[-30,0],rightFoot:[35,0],rightHand:[60,-130]};
test('elastic paper-face correction handles generated ink fill and preserves explicit complexion',()=>{
 const p={referenceStyle:'elastic-meme',sourceIdea:'A stickman reacts to a sound',characters:[{id:'a',kind:'man',skin:'#20251f'}],scenes:[]};
 assert.equal(compileStylePerformance(p).characters[0].skin,'#bfc1a2');assert.equal(p.characters[0].skin,'#20251f');
 p.sourceIdea='A person with dark skin reacts to a sound';assert.equal(compileStylePerformance(p).characters[0].skin,'#20251f');
});
test('standalone perform pose executes while independent channels animate',()=>{
 const result=evaluateMotion(initial,{pose:{mouthOpen:.8},keyframes:[{at:0,pose:{headAngle:0}},{at:1,pose:{headAngle:20}}]},.5);
 assert.equal(result.mouthOpen,.8);assert.equal(result.headAngle,10);
});
test('supported bow articulates spine and retains both world anchors throughout root shifts',()=>{
 let maxDrift=0;
 for(let frame=0;frame<=120;frame++){
  const result=evaluateMotion(initial,{keyframes:[{at:0,pose:{spineAngle:0,position:[220,780]}},{at:.5,pose:{spineAngle:38,position:[224,784]}},{at:1,pose:{spineAngle:0,position:[220,780]}}],constraints:[{kind:'plant',points:['leftFoot','rightFoot'],floorY:780}]},frame/120),state={...initial,...result};
  assert.equal(state.bodyAngle,0);
  for(const foot of ['leftFoot','rightFoot'])maxDrift=Math.max(maxDrift,Math.hypot(...localToWorld(state,state[foot]).map((v,i)=>v-localToWorld(initial,initial[foot])[i])));
  if(frame===60){assert.ok(neckOf(state)[0]>initial.hip[0]+90);assert.ok(result.head[0]>130);}
  const leg=ik(state.hip,state.leftFoot,86,86,1);assert.ok(leg.error<.01);
 }
 assert.ok(maxDrift<1e-9,`world stage drift ${maxDrift}`);
});
test('elastic face preserves identity cues and visibly changes jaw, gaze and mouth',()=>{
 const a={id:'maya',kind:'woman',skin:'#eee8cc',hair:'#333333',hairStyle:'ponytail',headWidth:1,headHeight:1};
 const neutral=elasticFace(a,{face:'neutral',facing:1},0),shock=elasticFace(a,{face:'jawdrop',facing:1,gaze:[-9,2]},0);
 assert.match(neutral,/data-elastic-face/);assert.notEqual(neutral,shock);assert.match(shock,/#333333/);
 assert.notEqual(elasticFace(a,{face:'neutral',facing:1,mouthOpen:0},0),elasticFace(a,{face:'neutral',facing:1,mouthOpen:1},0));
});

test('the actual SVG frame uses a distinct native renderer for each reference style',async()=>{
 const {readFile}=await import('node:fs/promises');const {svgFrame}=await import('../renderer/engine.mjs');
 const p=JSON.parse(await readFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),'utf8'));
 const outputs=[];
 for(const [referenceStyle,artStyle,marker] of [['silent-slapstick','pencil','data-pencil-face'],['coloured-cartoon','toon','data-toon-face'],['elastic-meme','classic','data-elastic-face']]){
  const variant=structuredClone(p);variant.referenceStyle=referenceStyle;variant.characters[0].artStyle=artStyle;
  const svg=svgFrame(variant,1);assert.match(svg,new RegExp(marker));outputs.push(svg);
 }
 assert.equal(new Set(outputs).size,3);
});

test('elastic compilation changes unowned timing and reaction focus, preserving holds and explicit timing',async()=>{
 const {readFile}=await import('node:fs/promises');const {compileStylePerformance}=await import('../shared/style-performance.mjs');
 const p=JSON.parse(await readFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),'utf8'));p.referenceStyle='elastic-meme';
 const shot=p.scenes[0].shots[0];shot.intent='reaction';shot.actorIds=['man'];shot.focus=[0,0];
 const keys=p.scenes[0].motionIR.tracks[0].keyframes;keys[0].timing='gentle';delete keys[1].timing;
 const out=compileStylePerformance(p),actual=out.scenes[0].motionIR.tracks[0].keyframes;
 assert.equal(actual[0].timing,'gentle');assert.equal(actual[1].timing,'snappy');assert.notDeepEqual(out.scenes[0].shots[0].focus,[0,0]);
 assert.deepEqual(actual.map(k=>k.pose),keys.map(k=>k.pose));assert.equal(out.story,p.story);assert.deepEqual(p.scenes[0].shots[0].focus,[0,0]);
 assert.deepEqual(compileStylePerformance(out),out);
});

test('model repair placement IDs cannot collide with semantic actor identities',async()=>{
 const {stripGeneratedPlacementIds}=await import('../shared/normalize-directed-scene.mjs');
 const scene={id:'sceneA',cast:[{id:'maya',characterId:'maya'}],props:[{id:'box',designId:'box'}],beats:[{id:'maya',actorId:'maya'}],shots:[{id:'maya'}],sounds:[]};
 const clean=stripGeneratedPlacementIds(scene);assert.equal(clean.id,'sceneA');assert.equal(clean.cast[0].characterId,'maya');assert.equal(clean.cast[0].id,undefined);assert.equal(clean.shots[0].id,undefined);assert.equal(scene.cast[0].id,'maya');
});
