import test from 'node:test';
import assert from 'node:assert/strict';
import {directSceneSounds} from '../server/sound-director.mjs';
import {readFile} from 'node:fs/promises';
import {inspectPlan} from '../server/inspect.mjs';
import {evaluate} from '../renderer/engine.mjs';
import {soundMatchesRole} from '../server/providers.mjs';
test('mechanical effects exclude human grunts and speech metadata while retaining toy squeaks',()=>{
 assert.equal(soundMatchesRole({name:'rubber toy squeak',tags:['toy','rubber']},'effect'),true);
 assert.equal(soundMatchesRole({name:'squeak',tags:['human','grunt']},'effect'),false);
 assert.equal(soundMatchesRole({name:'goblin gibberish',tags:['nonverbal','vocal']},'nonverbal'),true);
 assert.equal(soundMatchesRole({name:'mumble',description:'A spoken sentence'},'nonverbal'),false);
});

test('separate vocal reactions on one actor each get a cue without duplicating on repair',()=>{
  const scene={duration:5,motions:[],sounds:[],beats:[{actorId:'man',kind:'laugh',start:0,duration:1},{actorId:'man',kind:'cry',start:2,duration:1},{actorId:'man',kind:'scold',start:4,duration:.2}]};
  const result=directSceneSounds(scene);assert.equal(result.sounds.length,3);
  for(const cue of result.sounds){assert.equal(cue.role,'nonverbal');assert.equal(cue.actorId,'man');assert.ok(cue.duration>0);assert.ok(cue.start+cue.duration<=5);}
  assert.equal(directSceneSounds(result).sounds.length,3);
});
test('head attachment rejects root coordinates mistakenly used as bone offsets',async()=>{
  const plan=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
  const s=plan.scenes[0],p=s.props[0];p.attachment={actorId:s.cast[0].characterId,bone:'head',offset:[0,-420]};delete p.attachmentEvents;delete p.attachAt;
  assert.ok(inspectPlan(plan).issues.some(i=>i.code==='head-attachment-offset'));
});
test('rant hands follow vocal energy while a held prop retains its authored grip',async()=>{
  const plan=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
  const s=plan.scenes[0],id=s.cast[0].characterId;s.cast=[s.cast[0]];s.motions=[];s.props=[];
  s.beats=[{actorId:id,kind:'scold',start:0,duration:1,amount:1,hand:'right'}];
  s.sounds=[{actorId:id,role:'nonverbal',start:0,duration:1,mouthCues:Array.from({length:21},(_,i)=>({time:i*.05,open:0}))}];
  const quiet=evaluate(s,.5,plan.propDesigns).states[id];
  s.sounds[0].mouthCues.forEach(c=>c.open=1);
  const loud=evaluate(s,.5,plan.propDesigns).states[id];
  assert.ok(Math.hypot(loud.rightHand[0]-quiet.rightHand[0],loud.rightHand[1]-quiet.rightHand[1])>1);
  s.props=[{designId:plan.propDesigns[0].id,x:270,y:500,scale:1,angle:0,attachment:{actorId:id,bone:'rightHand',offset:[0,0]}}];
  const heldLoud=evaluate(s,.5,plan.propDesigns).states[id].rightHand;
  s.sounds[0].mouthCues.forEach(c=>c.open=0);
  assert.deepEqual(evaluate(s,.5,plan.propDesigns).states[id].rightHand,heldLoud);
});
