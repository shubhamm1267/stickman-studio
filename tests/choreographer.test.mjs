import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileDirection} from '../server/choreographer.mjs';
import {evaluate} from '../renderer/engine.mjs';
import {localToWorld} from '../shared/math.mjs';
import {validateEventContracts,resolveEventContracts} from '../server/semantic-director.mjs';
const example=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
function score(events){return{title:'The unexpected object',story:'A man interacts with a strange object and gets a surprising reaction.',comedy:example.comedy,seo:example.seo,characters:[{...example.characters[0],id:'man',name:'Man',slot:'left',scale:.85}],props:[{id:'table',name:'Table',type:'table',color:'#a87d55',slot:'right',height:'floor',scale:.8},{id:'object',name:'Custom purple triangle',type:'drawing',color:'#8b43ad',nodes:[{kind:'path',d:'M-25 20 L0 -30 L25 20 Z',fill:'#8b43ad'}],slot:'right',height:'table',scale:.65,onId:'table'}],scenes:[{id:'scene1',summary:'A man approaches and interacts with a moving object.',background:'room',events}],blockedReasons:[]};}
const approach={id:'walk',actorId:'man',verb:'approach',targetId:'object',description:'He walks beside the object.',duration:1.5};
test('a bouncing prop uses object flight while an actor jump stays a body action',()=>{
 const input=score([approach,{id:'bounce',actorId:'man',verb:'fly',targetId:'object',destination:'floor',description:'The object jumps upward and falls to the floor.',duration:1.5}]);
 resolveEventContracts(input,{events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'bounce',subjectId:'object',verbs:['fly','jump','fall'],silent:false}]});
 const plan=compileDirection(input);assert.equal(plan.scenes[0].motions.length,1);assert.equal(plan.scenes[0].motions[0].targetId,'object');
});
test('a prop described as jumping is normalized to a real object launch',()=>{
 const input=score([approach,{id:'launch',actorId:'man',verb:'jump',description:'The object jumps upward.',duration:1.5}]);
 resolveEventContracts(input,{events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'launch',subjectId:'object',verbs:['jump'],silent:false}]});
 const plan=compileDirection(input);assert.equal(plan.scenes[0].motions[0].targetId,'object');assert.equal(plan.scenes[0].motions[0].to[1],220);
});
test('placing and throwing require an actual preceding pickup',()=>{
 for(const verb of ['place','throw'])assert.throws(()=>compileDirection(score([approach,{id:'release',actorId:'man',verb,targetId:'object',description:'He releases the object.',duration:1.5}])),/requires the actor to grab/);
});
test('an effortful pickup performs a visible strain before transferring ownership',()=>{
 const input=score([approach,{id:'lift',actorId:'man',verb:'grab',targetId:'object',description:'He strains, then picks up the object.',duration:2}]);
 resolveEventContracts(input,{events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'lift',subjectId:'man',verbs:['strain','grab'],silent:false}]});
 const p=compileDirection(input),s=p.scenes[0],effort=s.beats.find(b=>b.kind==='perform'),pick=s.beats.find(b=>b.kind==='pick');
 assert.ok(effort&&pick);assert.ok(effort.start+effort.duration<=pick.start+.0001);
 const before=evaluate(s,effort.start+effort.duration*.6,p.propDesigns),after=evaluate(s,s.duration,p.propDesigns);
 assert.equal(before.props.object.owner,null);assert.equal(before.states.man.face,'strain');assert.equal(after.props.object.owner.actorId,'man');
});
test('a failed lift pulls the body upward while gripping an unmoved, unowned prop',()=>{
 const input=score([approach,{id:'tryLift',actorId:'man',verb:'strain',targetId:'object',description:'He tries to lift the heavy object but cannot.',duration:2}]);
 resolveEventContracts(input,{events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'tryLift',subjectId:'man',verbs:['liftAttempt','strain'],silent:false}]});
 const p=compileDirection(input),s=p.scenes[0],beat=s.beats.find(b=>b.kind==='perform'),rest=evaluate(s,beat.start,p.propDesigns),pull=evaluate(s,beat.start+beat.duration*.55,p.propDesigns);
 assert.deepEqual(pull.props.object.position,rest.props.object.position);assert.equal(pull.props.object.owner,null);
 assert.ok(pull.states.man.head[1]<rest.states.man.head[1]-15);
 const hand=localToWorld(pull.states.man,pull.states.man.rightHand);assert.ok(Math.hypot(...hand.map((v,i)=>v-pull.props.object.position[i]))<1);
});
test('a compound fall and sit is rendered as two distinct physical phases',()=>{
 const input=score([approach,{id:'tumble',actorId:'man',verb:'fall',description:'He falls then sits up holding his head.',duration:2}]);
 resolveEventContracts(input,{events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'tumble',subjectId:'man',verbs:['fall','sit','headHold','react'],silent:false}]});
 const p=compileDirection(input),s=p.scenes[0];
 const fallen=evaluate(s,2.6,p.propDesigns).states.man,seated=evaluate(s,s.duration,p.propDesigns).states.man;
 assert.ok(Math.abs(fallen.bodyAngle)>40);assert.equal(seated.bodyAngle,0);assert.ok(seated.hip[1]>-60);assert.ok(Math.abs(localToWorld(seated,seated.hip)[1]-localToWorld(seated,seated.leftFoot)[1])<2);assert.ok(seated.leftHand[1]<seated.head[1]-30);assert.ok(seated.leftHand[1]>seated.head[1]-70);
});
test('a head-hold puts a carried object back on the table instead of lifting it onto the face',()=>{
 const input=score([approach,{id:'pick',actorId:'man',verb:'grab',targetId:'object',description:'He picks up the object.',duration:1.5},{id:'hold',actorId:'man',verb:'headHold',description:'He holds his head in surprise.',duration:2}]);
 const p=compileDirection(input),s=p.scenes[0],final=evaluate(s,s.duration,p.propDesigns);
 assert.equal(final.props.object.owner,null);assert.ok(final.props.object.position[1]>final.states.man.position[1]-250);
 assert.ok(final.states.man.leftHand[1]<final.states.man.head[1]-30);assert.ok(s.beats.some(b=>b.kind==='place'&&b.targetId==='object'));
});
test('dynamic custom prop gets actual contact and silent events cannot acquire stray SFX',()=>{
  const input=score([approach,{id:'poke',actorId:'man',verb:'press',targetId:'object',description:'He silently pokes the triangle.',duration:1.5,silent:true}]);
  const plan=compileDirection(input,{},{cues:[{eventId:'poke',query:'squeak',when:'contact',role:'effect',duration:.3,volume:.2}]});const s=plan.scenes[0],b=s.beats.find(b=>b.kind==='perform');
  const q=evaluate(s,b.start+b.duration*.42,plan.propDesigns),a=q.states.man,hand=localToWorld(a,a.rightHand),prop=q.props.object.position;
  assert.ok(Math.hypot(hand[0]-prop[0],hand[1]-prop[1])<1);assert.equal(s.sounds.length,0);assert.ok(a.position[0]<s.props.find(p=>p.designId==='table').x-80);
});
test('face impact is a real motion that reaches the evaluated head, then rebounds',()=>{
  const plan=compileDirection(score([approach,{id:'flight',actorId:'man',verb:'fly',targetId:'object',targetActorId:'man',destination:'face',description:'The object flies into his nose and bounces away.',duration:1}]));
  const s=plan.scenes[0],m=s.motions[0],q=evaluate(s,m.start+m.duration,plan.propDesigns),a=q.states.man,face=localToWorld(a,[a.head[0]+a.facing*10,a.head[1]+12]);
  assert.equal(s.motions.length,2);assert.ok(Math.hypot(...q.props.object.position.map((v,i)=>v-face[i]))<1);
});
test('a later release and crown landing override a completed pickup without losing the object',()=>{
  const plan=compileDirection(score([approach,{id:'grab',actorId:'man',verb:'grab',targetId:'object',description:'He picks up the object.',duration:1},{id:'crown',actorId:'man',verb:'fly',targetId:'object',targetActorId:'man',destination:'crown',land:true,description:'The triangle flies from his hand and lands on his head.',duration:1}]));
  const s=plan.scenes[0],during=evaluate(s,2.8,plan.propDesigns),end=evaluate(s,s.duration,plan.propDesigns);
  assert.equal(during.props.object.owner,null);assert.equal(end.props.object.owner.hand,'head');
  const crown=localToWorld(end.states.man,[0,-480]);assert.ok(Math.hypot(...end.props.object.position.map((v,i)=>v-crown[i]))<1);
});
test('fall framing retains the head and feet throughout the motion at both output frame rates',()=>{
  for(const fps of [60,120]){
    const plan=compileDirection(score([approach,{id:'fall',actorId:'man',verb:'fall',description:'The man falls backward in surprise.',duration:1}]),{renderFps:fps});
    const s=plan.scenes[0],shot=s.shots.at(-1);
    for(let f=0;f<=fps;f++){const q=evaluate(s,1.5+f/fps,plan.propDesigns),a=q.states.man,head=localToWorld(a,a.head);const points=[...['leftFoot','rightFoot','leftHand','rightHand'].map(k=>localToWorld(a,a[k])),[head[0]-85*a.scale,head[1]-90*a.scale],[head[0]+85*a.scale,head[1]+90*a.scale]];for(const p of points){const screen=[270+(p[0]-shot.focus[0])*shot.zoom,960*.52+(p[1]-shot.focus[1])*shot.zoom];assert.ok(screen[0]>0&&screen[0]<540&&screen[1]>0&&screen[1]<960);}}
  }
});
test('independent actor contract prevents a human jump being implemented as prop flight',()=>{
  const input=score([approach,{id:'jump',actorId:'man',verb:'fly',targetId:'object',destination:'sky',description:'The man launches into the air.',duration:1}]);
  const contract={events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'jump',subjectId:'man',verbs:['jump'],silent:false}]};
  assert.throws(()=>validateEventContracts(input,contract),/fly moves ONLY a prop/);
  resolveEventContracts(input,contract);assert.equal(input.scenes[0].events[1].verb,'jump');const p=compileDirection(input),s=p.scenes[0],q=evaluate(s,2,p.propDesigns);assert.ok(q.states.man.position[1]<700);assert.equal(s.motions.length,0);
});
test('literal silence, stronger pressing and sitting while holding the head get actual implementations',()=>{
  const input=score([approach,{id:'press',actorId:'man',verb:'press',targetId:'object',description:'He silently presses harder in frustration.',duration:1.5},{id:'recover',actorId:'man',verb:'react',description:'He sits down while holding his head.',duration:1.5}]);
  resolveEventContracts(input,{events:[{eventId:'walk',subjectId:'man',verbs:['approach'],silent:false},{eventId:'press',subjectId:'man',verbs:['press','strain'],silent:true},{eventId:'recover',subjectId:'man',verbs:['sit','headHold'],silent:false}]});
  assert.equal(input.scenes[0].events[1].silent,true);assert.equal(input.scenes[0].events[1].verb,'strain');
  const p=compileDirection(input),a=evaluate(p.scenes[0],4.4,p.propDesigns).states.man;assert.ok(a.hip[1]>-110);assert.ok(a.leftHand[1]<a.head[1]-30);assert.ok(a.rightHand[1]<a.head[1]-30);
});
test('an object may be the semantic flying subject without being treated as a character rig',()=>{
  const input=score([approach,{id:'hit',actorId:'object',targetId:'man',verb:'fly',destination:'face',description:'The triangle flies into the man nose.',duration:1}]);
  const p=compileDirection(input),directed=JSON.parse(p.directionScore).scenes[0].events[1];assert.equal(directed.actorId,'man');assert.equal(directed.targetId,'object');assert.equal(directed.targetActorId,'man');assert.equal(p.scenes[0].motions.length,2);
});
test('manual timing is fitted without dropping events and a later scene preserves a held prop size',()=>{
  const input=score([approach,{id:'grab',actorId:'man',verb:'grab',targetId:'object',description:'He picks up the triangle.',duration:1}]);
  input.scenes.push({id:'scene2',summary:'He holds the same triangle in the next continuous shot.',background:'room',events:[{id:'look',actorId:'man',verb:'react',description:'He admires the triangle in his hand.',duration:1,emotion:'smug'},{id:'wave',actorId:'man',verb:'wave',description:'He greets the viewer with a wave.',duration:1}]});
  const p=compileDirection(input,{duration:10,durationMode:'manual'});assert.ok(Math.abs(p.scenes.reduce((sum,s)=>sum+s.duration,0)-10)<.001);
  const before=evaluate(p.scenes[0],p.scenes[0].duration,p.propDesigns).props.object,after=evaluate(p.scenes[1],0,p.propDesigns).props.object;assert.equal(after.owner.hand,before.owner.hand);assert.ok(Math.abs(after.scale-before.scale)<.00001);assert.ok(Math.hypot(...after.position.map((v,i)=>v-before.position[i]))<.001);
});
