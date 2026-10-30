import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {blinkOpenness,elasticFace,pencilFace,toonFace} from '../renderer/draw.mjs';
import {svgFrame} from '../renderer/engine.mjs';

test('blink envelopes are continuous, identity-specific and seek-independent',()=>{
 const first=[],second=[];
 for(let frame=0;frame<600;frame++){
  const t=frame/60,value=blinkOpenness('maya',t);
  assert.ok(value>=.025&&value<=1);
  assert.equal(value,blinkOpenness('maya',t));
  if(first.length)assert.ok(Math.abs(value-first.at(-1))<.4);
  first.push(value);second.push(blinkOpenness('ravi',t));
 }
 assert.ok(Math.min(...first)<.1);
 assert.notDeepEqual(first,second);
});

test('elastic sweating is visible, finite and leaves authored face state intact',()=>{
 const a={id:'maya',kind:'woman',skin:'#eee8cc',hair:'#333333',hairStyle:'ponytail',headWidth:1,headHeight:1};
 const pose={face:'strain',facing:1,sweat:.8};
 const before=structuredClone(pose),svg=elasticFace(a,pose,1.7);
 assert.match(svg,/data-elastic-sweat/);
 assert.doesNotMatch(svg,/NaN|Infinity/);
 assert.deepEqual(pose,before);
});

test('a neutral mouth curve preserves a round shocked mouth instead of producing a smile',()=>{
 const actor={id:'hero',kind:'man',skin:'#eee8cc',hair:'#333333',hairStyle:'bald'};
 const pose={face:'shock',mouthAperture:.8,mouthWidth:1.2};
 assert.equal(elasticFace(actor,{...pose,mouthCurve:0},2),elasticFace(actor,pose,2));
 assert.notEqual(elasticFace(actor,{...pose,mouthCurve:.5},2),elasticFace(actor,pose,2));
});

test('directed fast hands produce elastic trails without mutating the scene',async()=>{
 const plan=JSON.parse(await readFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),'utf8'));
 plan.referenceStyle='elastic-meme';
 const scene=plan.scenes[0],id=scene.cast[0].characterId;
 scene.beats=[{kind:'perform',actorId:id,start:0,duration:1,keyframes:[
  {at:0,pose:{rightHand:[-80,-200]}},{at:1,pose:{rightHand:[110,-200]}}
 ]}];
 delete scene.motionIR;
 const before=structuredClone(plan);
 // A short directed segment yields clearly measurable world-space velocity.
 scene.beats[0].duration=.1;
 before.scenes[0].beats[0].duration=.1;
 const svg=svgFrame(plan,.05);
 assert.match(svg,/data-elastic-motion-trail="rightHand"/);
 assert.doesNotMatch(svg,/NaN|Infinity/);
 assert.equal(svg,svgFrame(plan,.05));
 assert.deepEqual(plan,before);
 plan.referenceStyle='silent-slapstick';
 assert.doesNotMatch(svgFrame(plan,.05),/data-elastic-motion-trail/);
});

test('senior age remains visibly encoded across all three face renderers',()=>{
 const actor={id:'observer',kind:'man',ageYears:73,skin:'#ead9ba',hair:'#aaaaaa',headWidth:1,headHeight:1};
 const pose={face:'curious',facing:1,gaze:[0,0]};
 for(const render of [pencilFace,toonFace,elasticFace]){
  assert.match(render(actor,pose,1),/data-age-cues="senior"/);
  assert.doesNotMatch(render({...actor,ageYears:8,kind:'child'},pose,1),/data-age-cues="senior"/);
 }
});

test('elastic style preserves hair and face identities and readable effort teeth',()=>{
 const actor={id:'actor',kind:'man',skin:'#ead9ba',hair:'#333333',headWidth:1,headHeight:1};
 const pose={face:'neutral',facing:1};
 const styles=['sidepart','curly','bob','tuft','bald'].map(hairStyle=>elasticFace({...actor,hairStyle},pose,1));
 assert.equal(new Set(styles).size,5);
 assert.notEqual(elasticFace({...actor,faceShape:'square'},pose,1),elasticFace({...actor,faceShape:'long'},pose,1));
 assert.match(elasticFace(actor,{...pose,face:'strain'},1),/data-elastic-teeth/);
 assert.doesNotMatch(elasticFace(actor,{...pose,face:'strain',mouthAperture:.8},1),/data-elastic-teeth/);
});
