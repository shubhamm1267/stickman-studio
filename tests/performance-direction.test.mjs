import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';
import {validatePerformanceDirection,compileDirectedPerformance,auditDirectedPerformance,continuityReceipt,rigCapabilities,directPerformance} from '../server/performance-director.mjs';
import {evaluate} from '../renderer/engine.mjs';
import {performancePose} from '../shared/performance.mjs';
import {blinkOpenness} from '../renderer/draw.mjs';
import {normalizeDirectedScene} from '../shared/normalize-directed-scene.mjs';
import {validatePlan} from '../shared/schema.mjs';
import {canonicalizePlan,storyIRToPlan} from '../shared/canonical-story-ir.mjs';
import {contactFractions} from '../shared/action-time.mjs';
function fixture(){
 const p=dynamicFixture(),s=p.scenes[0];s.beats=[{actorId:'hero',kind:'react',start:0,duration:2,emotion:'curious',intent:'He notices the machine'}];s.sounds=[];
 const direction={sceneId:s.id,transition:{kind:'continuous',reason:'Same continuous place and time'},rigs:rigCapabilities(p.characters),events:[{eventIndex:0,actorId:'hero',action:'react',start:0,end:2,anticipation:0,settle:2,footSupport:'both',result:'pose'}],acting:[{actorId:'hero',start:0,end:2,lookAtId:'excavator',anticipationEmotion:'curious',reactionEmotion:'shock',reactionAt:1,intensity:.8}],shots:[{start:0,end:10,intent:'establishing',actorIds:['hero']}],sounds:[{eventIndex:0,phase:'settle',query:'short cartoon squeak',duration:.2,volume:.2}]};
 const context={summary:{id:s.id,duration:10},events:[{storyEvent:'He notices the machine'}],characters:p.characters,props:p.propDesigns};return {p,s,direction,context};
}
test('performance plan validates actual rig controls, event timing and full camera coverage',()=>{
 const {direction,context}=fixture();assert.ok(validatePerformanceDirection(direction,context));
 for(const change of [d=>d.events[0].settle=12,d=>d.events[0].actorId='ghost',d=>d.rigs[0].controls.push('extraArm'),d=>d.shots[0].end=8,d=>d.events.push({...d.events[0]})]){
  const bad=structuredClone(direction);change(bad);assert.throws(()=>validatePerformanceDirection(bad,context));
 }
});

test('physical contact cannot be planned offscreen or inside a face-only reaction cut',()=>{
 const {direction,context}=fixture();
 direction.events[0]={...direction.events[0],action:'pick',propId:'fridge',result:'grip',contact:1.96};
 direction.shots[0].framing='close-up';
 assert.throws(()=>validatePerformanceDirection(direction,context),/hand\/object contact/);
 direction.shots[0].framing='medium';assert.ok(validatePerformanceDirection(direction,context));
 context.characters.push({...context.characters[0],id:'observer'});direction.shots[0].actorIds=['observer'];
 assert.throws(()=>validatePerformanceDirection(direction,context),/hand\/object contact/);
});

test('native locomotion with a pose result retains its executable action window',()=>{
 const {p,s,direction}=fixture();direction.acting=[];direction.sounds=[];
 direction.events[0]={...direction.events[0],action:'walk',footSupport:'none',result:'pose'};
 s.beats=[{actorId:'hero',kind:'walk',start:0,duration:2,to:[120,780],intent:'Approach the object'}];
 const problems=auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns);
 assert.equal(problems.some(e=>e.code==='action-window'),false);
 s.beats[0].duration=1;
 assert.equal(auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns).some(e=>e.code==='action-window'),true);
});

test('coverage repair identifies an existing unlinked action without silently inventing coverage',()=>{
 const {p,s,direction}=fixture();direction.events[0]={...direction.events[0],action:'walk',footSupport:'none'};
 s.beats=[{actorId:'hero',kind:'walk',start:0,duration:2,to:[120,780],intent:'Approach the machine'},s.beats[0]];
 const coverage=[{beatIndices:[1]}],before=structuredClone(coverage);
 const issue=auditDirectedPerformance(s,direction,coverage,p.propDesigns).find(e=>e.code==='missing-action');
 assert.match(issue.repair,/exists at beatIndices \[0\]/);assert.deepEqual(coverage,before);
 assert.equal(auditDirectedPerformance(s,direction,[{beatIndices:[0,1]}],p.propDesigns).some(e=>e.code==='missing-action'),false);
});

test('an impact accent cannot shift a native slip or swat contact to the middle of the action',()=>{
 assert.deepEqual(contactFractions({kind:'slip',accent:'impact'}),[.68]);
 assert.deepEqual(contactFractions({kind:'swat',accent:'impact'}),[.64]);
 assert.deepEqual(contactFractions({kind:'custom',accent:'impact'}),[.5]);
 const {p,s,direction}=fixture();direction.events[0]={...direction.events[0],action:'slip',start:2,end:4,anticipation:2,contact:3.36,settle:4,result:'impact',footSupport:'airborne'};
 s.beats=[{actorId:'hero',kind:'slip',start:2,duration:2,to:[150,780],accent:'impact',intent:'Slip to the side'}];
 assert.equal(auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns).some(e=>e.code==='contact-clock'),false);
});

test('performance planning cannot select jar-only struggle for balancing or a different target',()=>{
 const {direction,context}=fixture();direction.events[0]={...direction.events[0],action:'struggle',propId:'fridge'};
 assert.throws(()=>validatePerformanceDirection(direction,context),/Native struggle requires an actual jar/);
 context.props.push({id:'jar',type:'jar'});
 assert.throws(()=>validatePerformanceDirection(direction,context),/Native struggle requires an actual jar/);
 direction.events[0].propId='jar';assert.ok(validatePerformanceDirection(direction,context));
});
test('acting compiles visible face changes and phase-locked sound while preserving coverage indices and replay',()=>{
 const {p,s,direction}=fixture();const out=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 assert.equal(out.beats[0].kind,'react');assert.equal(out.beats[1].semanticAction,'direction-acting');
 const a=evaluate(out,.2,p.propDesigns).states.hero,b=evaluate(out,1.2,p.propDesigns).states.hero;
 assert.ok(b.mouthAperture>a.mouthAperture||a.mouthAperture===undefined);assert.equal(b.face,'shock');
 assert.equal(out.sounds[0].start,2);
 const bodyAfter=structuredClone(out);bodyAfter.beats.push({actorId:'hero',kind:'idle',start:.5,duration:1.5,emotion:'curious',intent:'Body remains still during the reaction'});
 assert.equal(evaluate(bodyAfter,1.2,p.propDesigns).states.hero.face,'shock');
 assert.deepEqual(compileDirectedPerformance(out,direction,p.characters,p.propDesigns),out);
 p.scenes[0]=out;p.coverage=[{sceneId:s.id,storyEvent:'He notices the machine',beatIndices:[0]}];delete p.requirements;delete p.hook;delete p.review;
 const valid=validatePlan(p);assert.equal(storyIRToPlan(canonicalizePlan(valid).ir).scenes[0].beats.length,2);
});
test('resolved ownership and continuous cut mismatches produce localized repair records',()=>{
 const {p,s,direction}=fixture();direction.events[0]={...direction.events[0],action:'pick',propId:'fridge',result:'grip',contact:1.96};s.beats[0]={...s.beats[0],kind:'pick',targetId:'excavator'};
 const receipt=continuityReceipt(s,p.propDesigns);receipt.actors[0].position[0]+=100;
 const issues=auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns,receipt);
 assert.ok(issues.some(i=>i.code==='missing-action'));assert.ok(issues.some(i=>i.code==='cut-position'));
 assert.ok(issues.every(i=>i.sceneId===s.id&&typeof i.time==='number'&&i.repair));
});
test('Gemini direction request receives actual state and limited supported rigs',async()=>{
 const {direction,context}=fixture();let called=0;
 const fetcher=async(url,init)=>{called++;const body=JSON.parse(init.body);assert.match(body.contents[0].parts[0].text,/ACTUAL previous end state/);return Response.json({outputs:[{text:JSON.stringify(direction)}]});};
 const result=await directPerformance({...context,previous:{sceneId:'previous'},credentials:{gemini:'test'},fetcher});
 assert.equal(called,1);assert.equal(result.events[0].action,'react');
});
test('declared planted support is measured in world space, not trusted as prose',()=>{
 const {p,s,direction}=fixture();
 direction.events[0].action='custom';s.beats[0]={...s.beats[0],kind:'custom',pose:{position:[400,780]}};
 const issues=auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns);
 assert.ok(issues.some(i=>i.code==='foot-support'));
});
test('continuous cuts retain resolved prop ownership and reject silent reassignment',()=>{
 const {p,s,direction}=fixture();const receipt=continuityReceipt(s,p.propDesigns);
 const prop=receipt.props.find(p=>p.id==='fridge');prop.owner={actorId:'hero',hand:'rightHand'};
 const issues=auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns,receipt);
 assert.ok(issues.some(i=>i.code==='cut-prop'));
});
test('pickup checks the native grip clock and resolved ownership rather than trusting its label',()=>{
 const {p,s,direction}=fixture();
 s.props=s.props.map(p=>({...p,partAttachment:undefined}));
 s.beats=[{actorId:'hero',kind:'pick',targetId:'fridge',start:0,duration:2,hand:'right',intent:'Pick up the object'}];
 direction.events[0]={...direction.events[0],action:'pick',propId:'fridge',result:'grip',contact:.4};
 const result=auditDirectedPerformance(s,direction,[{beatIndices:[0]}],p.propDesigns);
 assert.ok(result.some(i=>i.code==='contact-clock'));
});
test('facial acting cannot bypass physical control ownership with a reserved action label',()=>{
 const {p,s,direction}=fixture();p.scenes[0]=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 p.scenes[0].beats.at(-1).keyframes[1].pose.position=[400,780];
 assert.throws(()=>validatePlan(p),/cannot own body motion/);
});
test('offscreen gaze and a final deadpan recovery compile to visible controls and hold',()=>{
 const {p,s,direction}=fixture();direction.acting[0].gazeDirection=[1,0];direction.acting[0].settleAt=1.6;direction.acting[0].settleEmotion='calm';
 s.beats=[{actorId:'hero',kind:'perform',start:0,duration:2,keyframes:[{at:0,pose:{gaze:[0,0],headAngle:0}},{at:1,pose:{gaze:[0,0],headAngle:5}}],intent:'He looks and reacts'}];
 delete direction.acting[0].lookAtId;
 const out=compileDirectedPerformance(s,direction,p.characters,p.propDesigns),early=evaluate(out,.2,p.propDesigns).states.hero,late=evaluate(out,1.9,p.propDesigns).states.hero;
 assert.equal(early.gaze[0],12);assert.equal(late.face,'calm');assert.equal(late.mouthAperture,0);assert.equal(late.eyeOpen,.65);
 assert.ok(out.beats[0].keyframes.some(k=>k.pose.headAngle===5));assert.ok(out.beats[0].keyframes.every(k=>k.pose.gaze===undefined));
});
test('performance holds stay still until the cue and linear moves retain exact timing',()=>{
 const keys=[{at:0,pose:{headAngle:0}},{at:1,pose:{headAngle:30},timing:'hold'}];
 assert.equal(performancePose({headAngle:0},keys,.99).headAngle,0);
 assert.equal(performancePose({headAngle:0},keys,1).headAngle,30);
 keys[1].timing='linear';assert.equal(performancePose({headAngle:0},keys,.25).headAngle,7.5);
});
test('planned mechanical effect replaces duplicate actor vocal cue and uses its event clock',()=>{
 const {p,s,direction}=fixture();s.sounds=[{query:'short cartoon squeak',start:.1,duration:.2,role:'nonverbal',actorId:'hero'}];
 const out=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 assert.equal(out.sounds.length,1);assert.equal(out.sounds[0].start,2);assert.equal(out.sounds[0].role,'effect');assert.equal(out.sounds[0].actorId,undefined);
});
test('directed anticipation keeps natural deterministic blinks while preserving the reaction',()=>{
 const {p,s,direction}=fixture();direction.acting[0].end=10;direction.acting[0].reactionAt=9;
 const scene=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 const time=Array.from({length:800},(_,i)=>i/100).find(t=>blinkOpenness('hero',t)<.1);
 assert.ok(time!==undefined);assert.ok(evaluate(scene,time,p.propDesigns).states.hero.eyeOpen<.1);
 assert.deepEqual(evaluate(scene,time,p.propDesigns).states.hero,evaluate(scene,time,p.propDesigns).states.hero);
});

test('the shocked mouth stays closed before the reaction cue instead of interpolating early',()=>{
 const {p,s,direction}=fixture();
 const scene=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 for(const time of [0,.2,.5,.8,.95,.999])assert.equal(evaluate(scene,time,p.propDesigns).states.hero.mouthAperture,0);
 assert.equal(evaluate(scene,1.01,p.propDesigns).states.hero.face,'shock');
 assert.ok(evaluate(scene,1.05,p.propDesigns).states.hero.mouthAperture>.4);
});

test('a pose event accepts consecutive coverage beats and rejects an uncovered gap',()=>{
 const {p,s,direction}=fixture();
 s.beats=[{...s.beats[0],duration:1},{...s.beats[0],start:1,duration:1}];
 const audit=()=>auditDirectedPerformance(s,direction,[{beatIndices:[0,1]}],p.propDesigns);
 assert.ok(!audit().some(i=>i.code==='action-window'));
 s.beats[1].start=1.5;s.beats[1].duration=.5;
 assert.ok(audit().some(i=>i.code==='action-window'));
});

test('normalization removes matching baseline ownership but retains contradictory animated values for validation',()=>{
 const beat={kind:'perform',actorId:'hero',start:0,duration:1,pose:{headAngle:0,mouthAperture:.4},keyframes:[{at:0,pose:{headAngle:0,mouthAperture:0}},{at:1,pose:{headAngle:20}}]};
 const result=normalizeDirectedScene({scene:{cast:[],beats:[beat]}}).scene.beats[0];
 assert.equal(result.pose.headAngle,undefined);assert.equal(result.pose.mouthAperture,.4);
 assert.equal(result.keyframes[1].pose.headAngle,20);
});

test('an offscreen gaze moves after its audible cue rather than beginning already turned',()=>{
 const {p,s,direction}=fixture();direction.acting[0].gazeDirection=[1,0];delete direction.acting[0].lookAtId;
 direction.acting[0].reactionAt=1.8;direction.sounds[0].phase='anticipation';direction.events[0].anticipation=.8;
 const out=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 assert.equal(evaluate(out,.5,p.propDesigns).states.hero.gaze[0],0);
 assert.equal(evaluate(out,1.05,p.propDesigns).states.hero.gaze[0],12);
 direction.acting[0].gazeAt=1.3;
 const explicit=compileDirectedPerformance(s,direction,p.characters,p.propDesigns);
 assert.equal(evaluate(explicit,1,p.propDesigns).states.hero.gaze[0],0);
 assert.equal(evaluate(explicit,1.4,p.propDesigns).states.hero.gaze[0],12);
});

test('explicit framing requests reject a close-up that begins after the facial reaction',()=>{
 const {direction,context}=fixture();context.sourceIdea='Show a full-body view followed by a face reaction close-up.';
 direction.shots=[{start:0,end:4,intent:'establishing',framing:'full-body',actorIds:['hero']},{start:4,end:10,intent:'reaction',framing:'close-up',actorIds:['hero']}];
 assert.throws(()=>validatePerformanceDirection(direction,context),/already be visible/);
 direction.shots[0].end=.8;direction.shots[1].start=.8;
 assert.doesNotThrow(()=>validatePerformanceDirection(direction,context));
});

test('performance validation preserves the invalid JSON for targeted provider retries',async()=>{
 const {direction,context}=fixture();direction.events[0].end=20;
 const fetcher=async()=>Response.json({outputs:[{text:JSON.stringify(direction)}]});
 await assert.rejects(()=>directPerformance({...context,credentials:{gemini:'test'},fetcher}),error=>error.generatedValue?.events[0].end===20);
});
