import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';
import {compileDirectedCameras} from '../shared/directed-cameras.mjs';
import {evaluate} from '../renderer/engine.mjs';
import {localToWorld} from '../shared/math.mjs';
import {canonicalizePlan,storyIRToPlan} from '../shared/canonical-story-ir.mjs';
import {fitDynamicCameras} from '../shared/dynamic-framing.mjs';
import {compileStylePerformance} from '../shared/style-performance.mjs';

for(const format of ['landscape','shorts','square'])test(`directed full body and face cuts use actual native rig extents in ${format}`,()=>{
 const p=dynamicFixture(),s=p.scenes[0];p.format=format;p.referenceStyle='elastic-meme';
 const direction={shots:[{start:0,end:4,intent:'establishing',framing:'full-body',actorIds:['hero']},{start:4,end:10,intent:'reaction',framing:'close-up',actorIds:['hero']}]};
 s.shots=compileDirectedCameras(s,direction,p.characters,p.propDesigns,format);
 assert.deepEqual(s.shots.map(q=>[q.start,q.end]),[[0,4],[4,10]]);
 assert.ok(s.shots[1].zoom>s.shots[0].zoom*1.25);
 const land=format==='landscape',height=land||format==='square'?540:960,width=land?960:540,factor=land?.73:format==='square'?.72:1;
 const shot=s.shots[0],state=evaluate(s,2,p.propDesigns).states.hero;
 for(const bone of ['head','leftFoot','rightFoot']){
  const point=localToWorld(state,state[bone]),x=width/2+(point[0]-shot.focus[0])*shot.zoom*factor,y=height*(land?.51:.52)+(point[1]-shot.focus[1])*shot.zoom*factor;
  assert.ok(x>16&&x<width-16&&y>16&&y<height-16,`${bone} must remain inside establishing shot`);
 }
 const processed=fitDynamicCameras(compileStylePerformance(p));
 assert.deepEqual(processed.scenes[0].shots[1].focus,s.shots[1].focus);
 const replay=storyIRToPlan(canonicalizePlan(processed).ir);
 assert.equal(replay.scenes[0].shots[1].framing,'close-up');
 assert.deepEqual(compileDirectedCameras(s,direction,p.characters,p.propDesigns,format),s.shots);
});

test('custom artwork retains its authored camera instead of assuming a human silhouette',()=>{
 const p=dynamicFixture(),s=p.scenes[0];p.characters[0].visualSpec={renderMode:'replace'};
 const shot=s.shots[0],result=compileDirectedCameras(s,{shots:[{start:0,end:10,intent:'establishing',framing:'full-body',actorIds:['hero']}]},p.characters,p.propDesigns)[0];
 assert.deepEqual(result.focus,shot.focus);assert.equal(result.zoom,shot.zoom);
});
