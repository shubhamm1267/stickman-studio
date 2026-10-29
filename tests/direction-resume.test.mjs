import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {directSemanticStory,repairSemanticPlan} from '../server/semantic-director.mjs';

test('resuming a direction draft still runs both action contracts, independent audit and sound direction',async()=>{
 const example=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
 const draft={title:'A friendly greeting',story:'An adult smiles at the viewer, then waves hello.',comedy:example.comedy,seo:example.seo,characters:[{...example.characters[0],id:'man',name:'Man',slot:'center',scale:.85}],props:[],scenes:[{id:'scene1',summary:'A friendly adult smiles and waves at the viewer.',background:'room',events:[{id:'smile',actorId:'man',verb:'react',description:'The adult smiles at the viewer.',emotion:'calm',duration:2},{id:'wave',actorId:'man',verb:'wave',description:'The adult waves hello.',duration:2}]}],blockedReasons:[]};
 const replies=[draft,{events:[{eventId:'smile',subjectId:'man',verbs:['react'],silent:false},{eventId:'wave',subjectId:'man',verbs:['wave'],silent:false}]},{missingEntities:[],unsupportedActions:[],events:[{description:'The adult smiles.',subjectId:'man',verb:'react'},{description:'The adult waves.',subjectId:'man',verb:'wave'}]},{passed:true,missingEvents:[],problems:[],summary:'The story and actual action sequence agree.'},{cues:[]}];
 let calls=0,expected=/previously generated draft/;const fake=async(url,init)=>{
  if(calls===0)assert.match(JSON.parse(init.body).contents[0].parts[0].text,expected);
  assert.ok(calls<replies.length,'Unexpected repair call');
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(replies[calls++])}]}}]});
 };
 const plan=await directSemanticStory({directionDraft:draft,story:'',productionMode:'silent-sfx',durationMode:'manual',duration:10,renderFps:60,language:'en',format:'shorts'}, {gemini:'fake'},undefined,()=>{},fake);
 assert.equal(calls,5);assert.ok(plan.review);assert.equal(plan.scenes[0].duration,10);
 calls=0;expected=/This is YOUR invented story/;
 await repairSemanticPlan(plan,{passed:false,summary:'The original gag needs a clearer payoff.',issues:[]},{gemini:'fake'},undefined,()=>{},fake);assert.equal(calls,5);
 calls=0;expected=/Preserve every event of the explicit USER story/;
 await repairSemanticPlan({...plan,sourceIdea:'An adult smiles at the viewer, then waves hello.'},{passed:false,summary:'Improve the visible wave.',issues:[]},{gemini:'fake'},undefined,()=>{},fake);assert.equal(calls,5);
});
