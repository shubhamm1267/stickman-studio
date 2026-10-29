import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';
import {OutlineSchema,VisualSpecSchema} from '../shared/schema.mjs';
import {planStory} from '../server/providers.mjs';
import {planDynamicStory,reviewDynamicPlan} from '../server/dynamic-director.mjs';
import {planHash} from '../server/inspect.mjs';
import {canonicalizePlan,storyIRToPlan} from '../shared/canonical-story-ir.mjs';

function responses(){
  const p=dynamicFixture(),raw=structuredClone(p);
  raw.scenes=p.scenes.map(({id,summary,duration})=>({id,summary,duration}));
  const outline=OutlineSchema.parse(Object.fromEntries(Object.entries(raw).filter(([k])=>Object.hasOwn(OutlineSchema.shape,k))));
  for(const design of [...outline.characters,...outline.propDesigns])delete design.visualSpec;
  const hero=VisualSpecSchema.parse({geometryRecipe:[{id:'badge',kind:'group',bone:'torso',children:[{id:'badgeMark',kind:'ellipse',center:[0,0],radius:[8,8],fill:'#ffcc44'}]}]});
  return[p,outline,[{visualSpec:hero,features:[{feature:'badge',nodeIds:['badgeMark']}]},...p.propDesigns.map(d=>({visualSpec:d.visualSpec,features:[{feature:d.name,nodeIds:[d.visualSpec.geometryRecipe[0].id]}]}))]];
}
test('default dynamic integration calls outline, asset designs, scene and independent audit using only Gemini',async()=>{
  const [p,outline,assets]=responses();
  const replies=[outline,...assets,{scene:p.scenes[0],coverage:p.coverage.map(({storyEvent,beatIndices})=>({storyEvent,beatIndices})),partTracks:[]},{passed:true,summary:'The geometry and nested transforms implement the fixture.',issues:[]}];
  let calls=0;
  const fetcher=async(url,options)=>{
    assert.match(String(url),/generativelanguage.googleapis.com/);
    assert.equal(options.headers['x-goog-api-key'],'test-key');
    const value=replies[calls++];assert.ok(value,'Unexpected repair request');
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}));
  };
  const output=await planStory({directionMode:'dynamic',story:p.story,duration:10,durationMode:'manual',format:'landscape',category:'slapstick',productionMode:'silent-sfx'}, {gemini:'test-key'},undefined,()=>{},fetcher);
  assert.equal(calls,6);assert.equal(output.planningMode,'dynamic');assert.equal(output.sourceIdea,p.story);
  assert.equal(output.review.planHash,planHash(output));assert.equal(output.scenes[0].dialogue.length,0);
  const restored=storyIRToPlan(canonicalizePlan(output).ir);assert.deepEqual(restored.scenes[0].props[1].partAttachment,output.scenes[0].props[1].partAttachment);
});
test('two-key dynamic mode rejects speech mode and requires explicit adult-mode opt-in before any provider call',async()=>{
  const noFetch=async()=>{throw Error('Provider must not be called');};
  await assert.rejects(planDynamicStory({productionMode:'dialogue-toon'},{},undefined,()=>{},noFetch),/silent SFX/);
  await assert.rejects(planDynamicStory({category:'adult-comedy',adultOptIn:false},{},undefined,()=>{},noFetch),/opt-in/);
});
test('adult non-graphic mode preserves consent metadata and settings through the real staged planner',async()=>{
  const [p,outline,assets]=responses();
  const replies=[outline,...assets,{scene:p.scenes[0],coverage:p.coverage.map(({storyEvent,beatIndices})=>({storyEvent,beatIndices})),partTracks:[]},{passed:true,summary:'All characters are adults and the gag is non-graphic.',issues:[]}];
  const fetcher=async()=>new Response(JSON.stringify({outputs:[{text:JSON.stringify(replies.shift())}]}));
  const result=await planDynamicStory({story:p.story,category:'adult-comedy',adultOptIn:true,comedySettings:{innuendo:'cheeky'},duration:10,format:'landscape'},{gemini:'test'},undefined,()=>{},fetcher);
  assert.equal(result.adultModeAcknowledged,true);assert.equal(result.comedySettings.innuendo,'cheeky');assert.equal(result.characters[0].ageYears,30);
});
test('missing Cartesia switches spoken-mode request to coloured family video with Gemini and Freesound only',async()=>{
  const [p,outline,assets]=responses();
  const replies=[outline,...assets,{scene:p.scenes[0],coverage:p.coverage.map((c,eventIndex)=>({eventIndex,beatIndices:c.beatIndices})),partTracks:[]},{passed:true,summary:'The family scene is told through visible action and sound effects.',issues:[]}];
  const fetcher=async()=>new Response(JSON.stringify({outputs:[{text:JSON.stringify(replies.shift())}]}));
  const notices=[];
  const result=await planStory({directionMode:'semantic',productionMode:'dialogue-toon',category:'family-comedy',story:p.story,duration:10,format:'landscape'},{gemini:'test'},undefined,m=>notices.push(m),fetcher);
  assert.equal(result.productionMode,'silent-sfx');assert.equal(result.category,'family-comedy');assert.equal(result.planningMode,'dynamic');
  assert.ok(result.characters.every(c=>c.artStyle==='toon'));assert.ok(result.scenes.every(s=>s.dialogue.length===0));assert.match(notices[0],/Cartesia unavailable/);assert.equal(replies.length,0);
});
for(const [referenceStyle,artStyle] of [['silent-slapstick','pencil'],['coloured-cartoon','toon'],['elastic-meme','classic']])test(`${referenceStyle} ignores speech settings and automatically chooses story tone`,async()=>{
 const [p,outline,assets]=responses();outline.category='slapstick';
 const replies=[outline,...assets,{scene:p.scenes[0],coverage:p.coverage.map((c,eventIndex)=>({eventIndex,beatIndices:c.beatIndices})),partTracks:[]},{passed:true,summary:'The scene has complete articulated motion and no dialogue.',issues:[]}];
 const fetcher=async url=>{assert.match(String(url),/generativelanguage/);return new Response(JSON.stringify({outputs:[{text:JSON.stringify(replies.shift())}]}));};
 const result=await planStory({referenceStyle,productionMode:'dialogue-toon',voice:true,category:'auto',story:p.story,duration:10,format:'landscape'},{gemini:'mock',cartesia:'must-not-be-used'},undefined,()=>{},fetcher);
 assert.equal(result.productionMode,'silent-sfx');assert.equal(result.referenceStyle,referenceStyle);assert.equal(result.category,'slapstick');assert.ok(result.characters.every(c=>c.artStyle===artStyle));assert.ok(result.scenes.every(s=>!s.dialogue.length));assert.equal(replies.length,0);
 const restored=storyIRToPlan(canonicalizePlan(result).ir);assert.equal(restored.referenceStyle,referenceStyle);
});
test('dynamic repairs restore immutable story metadata and relink events by index',async()=>{
 const p=responses()[0];p.sourceIdea=p.story;p.referenceStyle='elastic-meme';
 const candidate=structuredClone(p);candidate.sourceIdea='Unrelated replacement story that must not take ownership';delete candidate.referenceStyle;
 candidate.coverage=p.coverage.map((c,eventIndex)=>({eventIndex,beatIndices:c.beatIndices}));
 const replies=[{passed:false,summary:'A performance needs a clearer reaction.',issues:['Make the final reaction readable.']},candidate,{passed:true,summary:'The corrected original scene retains its events and motion.',issues:[]}];
 const fetcher=async()=>new Response(JSON.stringify({outputs:[{text:JSON.stringify(replies.shift())}]}));
 const result=await reviewDynamicPlan(p,{gemini:'test'},undefined,()=>{},fetcher);
 assert.equal(result.sourceIdea,p.sourceIdea);assert.equal(result.referenceStyle,p.referenceStyle);assert.deepEqual(result.coverage,p.coverage);assert.equal(replies.length,0);
});
