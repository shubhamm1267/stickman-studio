import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewSoundRecording,resolveReviewedSound,reviewSoundForCue,resolveSoundWithFallback} from '../server/sfx-review.mjs';
import {searchSound} from '../server/providers.mjs';

const observation={intelligibleSpeech:false,music:false,events:[{id:'a',start:1,end:1.4,description:'A short high-pitched rubber squeak',acoustics:'High nasal tonal squeal with fast attack and falling pitch over 0.4s'}],uncertainties:[]};
const spec={query:'rubber toy squeak',role:'effect',duration:.5,sourceDuration:3};
test('audio is observed blind before matching and the audible onset selects the source slice',async()=>{
 const replies=[observation,{accepted:true,eventId:'a',reason:'An audible rubber squeak matches.'}];let calls=0;
 const fetcher=async(url,init)=>{const text=JSON.parse(init.body).contents[0].parts.find(p=>p.text)?.text;
  if(!calls++){assert.doesNotMatch(text,/rubber toy squeak/);assert.ok(JSON.parse(init.body).contents[0].parts.some(p=>p.inlineData?.mimeType==='audio/mpeg'));}
  return Response.json({outputs:[{text:JSON.stringify(replies.shift())}]});
 };
 const result=await reviewSoundRecording(Buffer.from('test audio'),spec,{gemini:'test'},undefined,fetcher);
 assert.equal(result.accepted,true);assert.equal(result.sourceStart,.985);assert.equal(calls,2);
});
test('speech or music never reaches cue matching',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({outputs:[{text:JSON.stringify({...observation,intelligibleSpeech:true})}]});};
 const result=await reviewSoundRecording(Buffer.from('audio'),spec,{gemini:'test'},undefined,fetcher);
 assert.equal(result.accepted,false);assert.equal(calls,1);
});
test('a fabricated matching event or a source slice outside the audible event cannot pass',async()=>{
 for(const [eventId,sourceStart] of [['invented',0],['a',2]]){
  const replies=[observation,{accepted:true,eventId,reason:'The recording supposedly fits.'}];
  const fetcher=async()=>Response.json({outputs:[{text:JSON.stringify(replies.shift())}]});
  const verdict=await reviewSoundRecording(Buffer.from('audio'),{...spec,sourceStart},{gemini:'test'},undefined,fetcher);
  assert.equal(verdict.accepted,false);
 }
});
test('invalid observer timing fails instead of producing a fabricated crop',async()=>{
 const fetcher=async()=>Response.json({outputs:[{text:JSON.stringify({...observation,events:[{...observation.events[0],end:9}]})}]});
 await assert.rejects(()=>reviewSoundRecording(Buffer.from('audio'),spec,{gemini:'test'},undefined,fetcher),/invalid event times/);
});
test('a rejected snap tries another Freesound recording and retains review evidence',async()=>{
 let calls=0;const excluded=[];
 const result=await resolveReviewedSound({...spec,
  search:async selection=>{excluded.push([...selection.excludeIds]);return {id:++calls};},
  load:async item=>({file:item.id+'.mp3',duration:3}),
  review:async loaded=>loaded.file==='1.mp3'?{accepted:false,reason:'Only a snapping sound'}:{accepted:true,sourceStart:1},
 });
 assert.deepEqual(excluded,[[],[1]]);assert.equal(result.item.id,2);assert.equal(result.sourceStart,1);assert.equal(result.reports.length,2);
});
test('bounded sound retries retain rejection reports and abort without silently substituting a fixture',async()=>{
 let count=0;
 await assert.rejects(()=>resolveReviewedSound({...spec,search:async()=>({id:++count}),load:async()=>({file:'bad.mp3',duration:3}),review:async()=>({accepted:false,reason:'Wrong acoustic event'})}),error=>error.soundReviews.length===3);
 assert.equal(count,3);
 const abort=new AbortController();abort.abort();
 await assert.rejects(()=>resolveReviewedSound({...spec,signal:abort.signal,search:async()=>{throw Error('Must not search');}}),/abort/i);
});
test('Freesound search excludes acoustically rejected IDs before ranking',async()=>{
 const candidate=id=>({id,name:'rubber toy squeak',tags:['squeak'],license:'https://creativecommons.org/publicdomain/zero/1.0/',duration:.5,previews:{'preview-hq-mp3':'https://cdn.freesound.org/preview.mp3'}});
 const fetcher=async()=>Response.json({results:[candidate(1),candidate(2)]});
 const item=await searchSound('rubber toy squeak','test',undefined,fetcher,{role:'effect',excludeIds:[1]});
 assert.equal(item.id,2);
});

test('slide does not become a lid query and rejected squeaks try distinct acoustic searches',async()=>{
 const queries=[];const fetcher=async url=>{queries.push(new URL(url).searchParams.get('query'));return Response.json({results:[]});};
 await assert.rejects(searchSound('cartoon slip slide squeak','test',undefined,fetcher,{retry:1,role:'effect'}),/No CC0/);
 assert.ok(queries.includes('shoe squeak'));assert.ok(queries.includes('rubber squeak'));assert.ok(queries.includes('squeak'));
 assert.ok(!queries.includes('jar open'));assert.equal(queries[0],'shoe squeak');
});

test('alternate Foley still needs acoustic approval and retains the original rejection evidence',async()=>{
 const queries=[];let calls=0;
 const result=await resolveSoundWithFallback({...spec,maxAttempts:1,
  search:async selection=>{queries.push(selection.queryOverride||spec.query);return{id:++calls};},
  load:async item=>({file:item.id+'.mp3',duration:3}),
  review:async(loaded,cue)=>({accepted:cue.query==='shoe skid',reason:'Audible sliding shoe friction',sourceStart:.2}),
 },async reports=>{assert.equal(reports.length,1);return{alternatives:[{query:'shoe skid',reason:'The original story requires a foot slipping, not a specific squeak.'}]};});
 assert.equal(result.selectedQuery,'shoe skid');assert.equal(result.reports.length,2);assert.equal(result.sourceStart,.2);
 assert.deepEqual(queries,[spec.query,'shoe skid']);
});

test('empty alternatives preserve failure and provider failures never trigger Foley substitution',async()=>{
 let planned=0;
 const options={...spec,maxAttempts:1,search:async()=>({id:1}),load:async()=>({file:'wrong.mp3',duration:3}),review:async()=>({accepted:false,reason:'Unrelated acoustic event'})};
 await assert.rejects(resolveSoundWithFallback(options,async()=>({alternatives:[]})),error=>error.soundReviews.length===1);
 await assert.rejects(resolveSoundWithFallback({...options,search:async()=>{throw Error('Provider HTTP 401');}},async()=>{planned++;return{alternatives:[]};}),/401/);
 assert.equal(planned,0);
});

test('acoustic retry changes to a literal alternate Freesound search phrase',async()=>{
 let query;
 const fetcher=async url=>{query=new URL(url).searchParams.get('query');return Response.json({results:[{id:4,name:'short squeak',duration:.5,license:'https://creativecommons.org/publicdomain/zero/1.0/',previews:{'preview-hq-mp3':'https://cdn.freesound.org/preview.mp3'}}]});};
 await searchSound('rubber toy squeak','test',undefined,fetcher,{role:'effect',retry:1});
 assert.equal(query,'squeak');
});

test('a matching full recording cannot pass when its actual cue slice becomes a click',async()=>{
 const clip={...observation,events:[{id:'click',start:.01,end:.1,description:'A short click',acoustics:'A broadband transient snap with no sustained tonal component'}]};
 const replies=[observation,{accepted:true,eventId:'a',reason:'The recording contains a tonal squeak.'},clip,{accepted:false,eventId:null,reason:'The extracted cue contains only a transient click.'}];
 let start;
 const fetcher=async()=>Response.json({outputs:[{text:JSON.stringify(replies.shift())}]});
 const result=await reviewSoundForCue(Buffer.from('whole recording'),spec,{gemini:'test'},undefined,fetcher,async selected=>{start=selected;return Buffer.from('actual cropped click');});
 assert.equal(start,.985);assert.equal(result.accepted,false);assert.equal(result.sliceReview.accepted,false);assert.equal(replies.length,0);
});
