import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';
import {OutlineSchema,VisualSpecSchema} from '../shared/schema.mjs';
import {planStory} from '../server/providers.mjs';
import {planDynamicStory,reviewDynamicPlan,linkMissingTargets,assertEventMechanics,nativePropertyAvailable,assertOutlineDesignRequirements,assertNativeOverlayGeometry,sceneSchemaFor} from '../server/dynamic-director.mjs';
import {planHash} from '../server/inspect.mjs';
import {canonicalizePlan,storyIRToPlan} from '../shared/canonical-story-ir.mjs';
import {rigCapabilities} from '../server/performance-director.mjs';

function responses(){
  const p=dynamicFixture(),raw=structuredClone(p);
  raw.scenes=p.scenes.map(({id,summary,duration})=>({id,summary,duration}));
  const outline=OutlineSchema.parse(Object.fromEntries(Object.entries(raw).filter(([k])=>Object.hasOwn(OutlineSchema.shape,k))));
  for(const design of [...outline.characters,...outline.propDesigns])delete design.visualSpec;
  const hero=VisualSpecSchema.parse({geometryRecipe:[{id:'badge',kind:'group',bone:'torso',children:[{id:'badgeMark',kind:'ellipse',center:[0,0],radius:[8,8],fill:'#ffcc44'}]}]});
  return[p,outline,[{visualSpec:hero,features:[{feature:'badge',nodeIds:['badgeMark']}]},...p.propDesigns.map(d=>({visualSpec:d.visualSpec,features:[{feature:d.name,nodeIds:[d.visualSpec.geometryRecipe[0].id]}]}))]];
}

test('generated native actions cannot silently ignore missing destinations or performance-only fields',()=>{
 const p=dynamicFixture(),scene=p.scenes[0],schema=sceneSchemaFor(p);
 const value={scene:structuredClone(scene),coverage:[{eventIndex:0,beatIndices:[0]}],partTracks:[]};
 value.scene.beats=[{actorId:'hero',kind:'walk',start:0,duration:2,intent:'Walk towards the excavator'}];
 assert.throws(()=>schema.parse(value),/world destination/);
 value.scene.beats[0].to=[120,780];assert.ok(schema.parse(value));
 value.scene.beats[0].keyframes=[{at:0,pose:{headAngle:0}},{at:1,pose:{headAngle:10}}];
 assert.throws(()=>schema.parse(value),/does not execute performance keys/);
});

test('contradictory outfit and label requirements fail before asset and choreography generation',()=>{
 const outline={characters:[{id:'hero',outfit:'#112233',shirtLabel:'HELLO'}],propDesigns:[],requirements:[{characterId:'hero',description:'Hero outfit',color:'#112233',label:'HELLO'}]};
 assert.doesNotThrow(()=>assertOutlineDesignRequirements(outline));
 outline.requirements[0].color='#aabbcc';assert.throws(()=>assertOutlineDesignRequirements(outline),/outfit/);
 outline.requirements[0].color='#112233';outline.requirements[0].label='OTHER';assert.throws(()=>assertOutlineDesignRequirements(outline),/physical label/);
});

test('native overlay rejects duplicate anatomy but permits accessories and complete replacement art',()=>{
 const actor={id:'hero',name:'Hero'};
 const duplicate={renderMode:'overlay',geometryRecipe:[{id:'decoration',kind:'group',children:[{id:'headCircle',kind:'ellipse'}]}]};
 assert.throws(()=>assertNativeOverlayGeometry(actor,duplicate),/duplicates base anatomy/);
 assert.doesNotThrow(()=>assertNativeOverlayGeometry(actor,{...duplicate,renderMode:'replace'}));
 assert.doesNotThrow(()=>assertNativeOverlayGeometry(actor,{renderMode:'overlay',geometryRecipe:[{id:'shirtEyeBadge',kind:'ellipse'}]}));
});
test('native face defaults are available without pretending animal clothes or unknown properties exist',()=>{
 assert.equal(nativePropertyAvailable({kind:'man'},'faceShape'),true);
 assert.equal(nativePropertyAvailable({kind:'woman'},'hairStyle'),true);
 assert.equal(nativePropertyAvailable({kind:'dog'},'wardrobe'),false);
 assert.equal(nativePropertyAvailable({kind:'man'},'extraArm'),false);
 assert.equal(nativePropertyAvailable({kind:'man',ageYears:73},'ageYears'),true);
 assert.equal(nativePropertyAvailable({kind:'man',ageYears:25},'ageYears'),false);
 assert.equal(nativePropertyAvailable({kind:'dog',ageYears:73},'ageYears'),false);
});
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
test('asset stage ignores speculative future-scene animation and recognizes default native wardrobe',async()=>{
 const [p,outline,assets]=responses();
 const hero=assets[0];hero.visualSpec.geometryRecipe[0].animation=[{sceneId:'scene2',playback:'once',keys:[{at:0,rotation:0},{at:1,rotation:20}]}];
 hero.features[0].nativeProperties=['wardrobe'];
 const replies=[outline,...assets,{scene:p.scenes[0],coverage:p.coverage.map(({storyEvent,beatIndices})=>({storyEvent,beatIndices})),partTracks:[]},{passed:true,summary:'The requested action and appearance are visible.',issues:[]}];
 const fetcher=async()=>new Response(JSON.stringify({outputs:[{text:JSON.stringify(replies.shift())}]}));
 const result=await planDynamicStory({story:p.story,duration:10,durationMode:'manual',format:'landscape',category:'slapstick',productionMode:'silent-sfx'},{gemini:'test'},undefined,()=>{},fetcher);
 assert.equal(result.characters[0].wardrobe,'shirt');
 assert.equal(result.characters[0].visualSpec.geometryRecipe[0].animation,undefined);
 assert.equal(replies.length,0);
});
test('missing reach target links only to the named or clearly nearest placed prop',()=>{
 const designs=[{id:'bananaFront',name:'Front banana peel'},{id:'bananaBack',name:'Back banana peel'}];
 const scene={cast:[{characterId:'ramesh',x:300,y:780}],props:[{designId:'bananaFront',x:350,y:780},{designId:'bananaBack',x:120,y:780}],beats:[
  {kind:'reach',actorId:'ramesh',start:1,intent:'Ramesh reaches for the front banana peel.'},
  {kind:'pick',actorId:'ramesh',start:2,intent:'He picks up the first peel.'}
 ]};
 linkMissingTargets(scene,designs);
 assert.deepEqual(scene.beats.map(b=>b.targetId),['bananaFront','bananaFront']);
 const ambiguous={cast:[{characterId:'ramesh',x:300,y:780}],props:[{designId:'bananaFront',x:260,y:780},{designId:'bananaBack',x:340,y:780}],beats:[{kind:'reach',actorId:'ramesh',start:1,intent:'Ramesh reaches down.'}]};
 linkMissingTargets(ambiguous,designs);assert.equal(ambiguous.beats[0].targetId,undefined);
 linkMissingTargets(ambiguous,designs,'He notices the first peel and misses the second one behind him.');
 assert.equal(ambiguous.beats[0].targetId,'bananaFront');
 const sequence={cast:[{characterId:'ramesh',x:300,y:780}],props:ambiguous.props,beats:[{kind:'reach',actorId:'ramesh',start:1,intent:'He reaches down.'},{kind:'pick',actorId:'ramesh',start:1.5,targetId:'bananaBack',intent:'He picks up the back peel.'}]};
 linkMissingTargets(sequence,designs);assert.equal(sequence.beats[0].targetId,'bananaBack');
});
test('story events cannot pass with reach instead of pickup or a missing peel on head',()=>{
 const scene={beats:[{kind:'reach'}],props:[{designId:'peel1'}]};
 assert.throws(()=>assertEventMechanics(scene,[{storyEvent:'He reaches to pick it up'}]),/real pick beat/);
 scene.beats.push({kind:'pick'});
 assert.throws(()=>assertEventMechanics(scene,[{storyEvent:'The first peel lands on his head'}]),/timed prop landing/);
 scene.props[0].attachmentEvents=[{at:3,attachment:{actorId:'ramesh',bone:'head'}}];
 assert.doesNotThrow(()=>assertEventMechanics(scene,[{storyEvent:'He picks the peel up'},{storyEvent:'The first peel lands on his head'}]));
});
test('two-key dynamic mode rejects speech mode and requires explicit adult-mode opt-in before any provider call',async()=>{
  const noFetch=async()=>{throw Error('Provider must not be called');};
  await assert.rejects(planDynamicStory({productionMode:'dialogue-toon'},{},undefined,()=>{},noFetch),/silent SFX/);
  await assert.rejects(planDynamicStory({category:'adult-comedy',adultOptIn:false},{},undefined,()=>{},noFetch),/opt-in/);
});
test('performance stage feeds executable scene staging and persists its score through canonical replay',async()=>{
 const [p,outline,assets]=responses();outline.propDesigns=[];delete outline.requirements;delete outline.hook;
 outline.story='An adult notices a sound and reacts with surprise.';
 const scene=structuredClone(p.scenes[0]);scene.props=[];scene.motions=[];scene.sounds=[];
 scene.beats=[{actorId:'hero',kind:'react',start:0,duration:10,emotion:'curious',intent:'He notices a small sound'}];
 outline.coverage=[{sceneId:scene.id,storyEvent:'He notices a small sound'}];
 const direction={sceneId:scene.id,transition:{kind:'continuous',reason:'Single continuous scene'},rigs:rigCapabilities([{...outline.characters[0],visualSpec:assets[0].visualSpec}]),events:[{eventIndex:0,actorId:'hero',action:'react',start:0,end:10,anticipation:0,settle:10,footSupport:'both',result:'pose'}],acting:[{actorId:'hero',start:0,end:10,anticipationEmotion:'curious',reactionEmotion:'shock',reactionAt:5,intensity:.8}],shots:[{start:0,end:10,intent:'establishing',actorIds:['hero']}],sounds:[]};
 const replies=[outline,assets[0],direction,{scene,coverage:[{eventIndex:0,beatIndices:[0]}],partTracks:[]},{passed:true,summary:'The gaze and reaction are implemented by facial keys.',issues:[]}];
 const fetcher=async(url,init)=>{
  if(replies.length===2)assert.match(JSON.parse(init.body).contents[0].parts[0].text,/PERFORMANCE DIRECTION/);
  const response=replies.shift();assert.ok(response,'Unexpected retry');return Response.json({outputs:[{text:JSON.stringify(response)}]});
 };
 const result=await planDynamicStory({story:outline.story,duration:10,durationMode:'manual',format:'landscape',category:'slapstick',productionMode:'silent-sfx',performancePlanning:true},{gemini:'test'},undefined,()=>{},fetcher);
 assert.ok(result.scenes[0].beats.some(b=>b.semanticAction==='direction-acting'));
 assert.equal(JSON.parse(result.directionScore).scenes[0].direction.events[0].action,'react');
 assert.equal(storyIRToPlan(canonicalizePlan(result).ir).directionScore,result.directionScore);
 assert.equal(replies.length,0);
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

test('full visual repairs recompile saved gaze and recovery instead of silently replacing the acting score',async()=>{
 const p=responses()[0],s=p.scenes[0];p.sourceIdea=p.story;p.referenceStyle='elastic-meme';
 s.beats=[{actorId:'hero',kind:'react',start:0,duration:10,emotion:'curious',intent:'A delayed surprised reaction'}];
 const direction={sceneId:s.id,transition:{kind:'continuous',reason:'A single continuous scene'},rigs:rigCapabilities(p.characters),events:[{eventIndex:0,actorId:'hero',action:'react',start:0,end:10,anticipation:0,settle:10,footSupport:'both',result:'pose'}],acting:[{actorId:'hero',start:0,end:10,gazeDirection:[1,0],anticipationEmotion:'curious',reactionEmotion:'shock',reactionAt:4,settleAt:8,settleEmotion:'calm',intensity:.9}],shots:[{start:0,end:10,intent:'reaction',actorIds:['hero']}],sounds:[]};
 p.directionScore=JSON.stringify({version:1,scenes:[{direction}]});
 const candidate=structuredClone(p);candidate.scenes[0].beats[0].emotion='laugh';
 candidate.coverage=p.coverage.map((c,eventIndex)=>({eventIndex,beatIndices:c.beatIndices}));
 const replies=[{passed:false,summary:'The visual expression needs repair.',issues:['Retain the directed shocked reaction.']},candidate,{passed:true,summary:'The saved acting score is visibly implemented.',issues:[]}];
 const fetcher=async()=>Response.json({outputs:[{text:JSON.stringify(replies.shift())}]});
 const result=await reviewDynamicPlan(p,{gemini:'test'},undefined,()=>{},fetcher);
 const {evaluate}=await import('../renderer/engine.mjs');
 const state=evaluate(result.scenes[0],4.1,result.propDesigns).states.hero;
 assert.equal(state.face,'shock');assert.equal(state.gaze[0],12);
 assert.equal(evaluate(result.scenes[0],9,result.propDesigns).states.hero.face,'calm');
 assert.equal(result.directionScore,p.directionScore);assert.equal(replies.length,0);
});
