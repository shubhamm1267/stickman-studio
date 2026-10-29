import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStoryContract} from '../server/story-contract.mjs';
const score=events=>({scenes:[{events}]});
const contract=events=>({missingEntities:[],events});
test('prose claiming a popped button cannot replace object flight',()=>{
 assert.throws(()=>validateStoryContract(score([{actorId:'man',verb:'react',description:'Button flies out'}]),contract([{description:'Button flies out',subjectId:'button',verb:'fly'}])),/Missing actual story action/);
});
test('repeated silent presses need distinct events followed by actual face hit and rebound',()=>{
 const atoms=[{description:'First silent press',subjectId:'man',verb:'press',targetId:'duck',silent:true},{description:'Second silent press',subjectId:'man',verb:'press',targetId:'duck',silent:true},{description:'Duck hits face',subjectId:'duck',verb:'fly',targetId:'man',destination:'face'},{description:'Duck bounces down',subjectId:'duck',verb:'fly',destination:'floor'}];
 const events=[{actorId:'man',verb:'press',targetId:'duck',silent:true},{actorId:'man',verb:'strain',targetId:'duck',silent:true},{actorId:'man',verb:'fly',targetId:'duck',targetActorId:'man',destination:'face'}];
 assert.equal(validateStoryContract(score(events),contract(atoms)),true);
 assert.throws(()=>validateStoryContract(score(events.slice(1)),contract(atoms)),/Second silent press/);
});
test('separately moving story components must be designed',()=>{
 assert.throws(()=>validateStoryContract(score([]),{missingEntities:['detachable bottle cap'],events:[]}),/not designed/);
});
test('actor contact matches the actual receiving actor',()=>{
 assert.equal(validateStoryContract(score([{actorId:'a',verb:'punch',targetActorId:'b'}]),contract([{description:'A punches B',subjectId:'a',verb:'punch',targetId:'b'}])),true);
});
test('holding the actors own head accepts an explicit self target',()=>{
 assert.equal(validateStoryContract(score([{actorId:'a',verb:'headHold'}]),contract([{description:'A holds his own head',subjectId:'a',verb:'headHold',targetId:'a'}])),true);
 assert.throws(()=>validateStoryContract(score([{actorId:'a',verb:'headHold'}]),contract([{description:'A holds another head',subjectId:'a',verb:'headHold',targetId:'b'}])),/Missing actual story action/);
});
test('actor falls have the real floor destination; prop slipping remains object motion',()=>{
 assert.equal(validateStoryContract(score([{actorId:'a',verb:'slip'}]),contract([{description:'A falls onto the floor',subjectId:'a',verb:'fall',destination:'floor'}])),true);
 const input={...score([{actorId:'a',verb:'fly',targetId:'ball',destination:'floor'}]),props:[{id:'ball'}]};
 assert.equal(validateStoryContract(input,contract([{description:'Ball slips to the floor',subjectId:'ball',verb:'slip',destination:'floor'}])),true);
});
test('unsupported deformation cannot be concealed by a named rigid motion',()=>{
 assert.throws(()=>validateStoryContract(score([]),{missingEntities:[],events:[],unsupportedActions:['Bubble gum inflates and changes shape']}),/unimplemented motion/);
});
test('an explicitly designed room background is present but does not supply an interactive door',()=>{
 const input={scenes:[{background:'room',events:[]}]};
 assert.equal(validateStoryContract(input,{missingEntities:['room'],events:[]}),true);
 assert.throws(()=>validateStoryContract(input,{missingEntities:['door'],events:[]}),/not designed/);
});
test('walking to an unmoved object on a table also approaches that table',()=>{
 const input={...score([{actorId:'a',verb:'approach',targetId:'ball'}]),props:[{id:'ball',onId:'table'},{id:'table',type:'table'}]};
 const atom=contract([{description:'A walks to the table',subjectId:'a',verb:'walk',targetId:'table'}]);
 assert.equal(validateStoryContract(input,atom),true);
 assert.equal(validateStoryContract(input,contract([{...atom.events[0],destination:'table'}])),true);
 input.scenes[0].events.unshift({actorId:'a',verb:'grab',targetId:'ball'});
 assert.throws(()=>validateStoryContract(input,atom),/Missing actual story action/);
});
