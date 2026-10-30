import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {produceFilm} from '../server/production.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {verifyReplayPlan} from '../shared/schema.mjs';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';

const pass={passed:true,summary:'Supported visual evidence.',issues:[],observedEvents:[]};
const fail={...pass,passed:false,summary:'Missing cap movement.',issues:[{time:2,problem:'Cap remains closed',repair:'Animate the cap'}]};
async function workspace(run){const dir=await mkdtemp(path.join(os.tmpdir(),'production-preview-'));try{await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}

test('dynamic production gates the full export on preview approval and still reviews the final MP4',()=>workspace(async dir=>{
  const calls=[];
  const result=await produceFilm(dynamicFixture(),dir,{}, {
    audioBuilder:async()=>({audio:'mock.wav',credits:[]}),
    renderer:async(plan,d,a,options)=>calls.push(['render',options.quality,path.resolve(d)===path.resolve(dir)]),
    videoReviewer:async d=>{calls.push(['review',path.resolve(d)===path.resolve(dir)]);return pass;},
  });
  assert.deepEqual(calls,[['render','draft',false],['review',false],['render','full',true],['review',true]]);
  assert.equal(verifyReplayPlan(result.plan),true);
  assert.equal(JSON.parse(await readFile(path.join(dir,'production-state.json'),'utf8')).status,'completed');
  assert.equal((await readdir(dir)).some(name=>name.startsWith('preview-production-preview-')),false);
}));

test('two rejected previews never render a full export and persist the failure',()=>workspace(async dir=>{
  let repairs=0;const qualities=[];
  await assert.rejects(produceFilm(dynamicFixture(),dir,{}, {
    audioBuilder:async()=>({audio:'mock.wav',credits:[]}),renderer:async(p,d,a,o)=>qualities.push(o.quality),
    videoReviewer:async()=>fail,videoRepairer:async p=>{repairs++;return p;},
  }),/Preview still needs corrections/);
  assert.deepEqual(qualities,['draft','draft']);assert.equal(repairs,1);
  assert.equal(JSON.parse(await readFile(path.join(dir,'production-state.json'),'utf8')).status,'failed');
}));

test('measured audio mouth curves are bound into both exported plan and replay before rendering',()=>workspace(async dir=>{
  const raw=dynamicFixture();raw.scenes[0].sounds=[{query:'laugh',role:'nonverbal',actorId:'hero',start:1,duration:1,volume:.2,required:true}];
  const input=canonicalizePlan(raw).plan;
  await produceFilm(input,dir,{}, {
    quality:'draft',audioBuilder:async plan=>{plan.scenes[0].sounds[0].mouthCues=[{time:0,open:0},{time:.2,open:.8}];return{audio:'mock.wav',credits:[]};},
    renderer:async plan=>{assert.equal(verifyReplayPlan(plan),true);assert.equal(plan.scenes[0].sounds[0].mouthCues[1].open,.8);},
    videoReviewer:async()=>pass,
  });
  const saved=JSON.parse(await readFile(path.join(dir,'plan.json'),'utf8'));
  assert.equal(verifyReplayPlan(saved),true);assert.equal(saved.scenes[0].sounds[0].mouthCues.length,2);
}));

test('cancelled preview stops before review and keeps a cancelled stage',()=>workspace(async dir=>{
  const controller=new AbortController();let reviewed=false;
  await assert.rejects(produceFilm(dynamicFixture(),dir,{}, {
    signal:controller.signal,audioBuilder:async()=>({audio:'mock.wav',credits:[]}),
    renderer:async()=>controller.abort(),videoReviewer:async()=>{reviewed=true;return pass;},
  }),/abort/i);
  assert.equal(reviewed,false);
  const saved=JSON.parse(await readFile(path.join(dir,'production-state.json'),'utf8'));
  assert.equal(saved.status,'cancelled');assert.equal(saved.stages.at(-1).status,'cancelled');
}));

test('resume reuses complete hash-bound audio but rebuilds edited or missing audio',()=>workspace(async dir=>{
  const plan=dynamicFixture();let builds=0;
  const deps={quality:'draft',audioBuilder:async()=>{builds++;await writeFile(path.join(dir,'audio.wav'),'test audio '+builds);return{audio:path.join(dir,'audio.wav'),credits:[]};},renderer:async()=>{},videoReviewer:async()=>pass};
  await produceFilm(plan,dir,{},deps);
  await produceFilm(plan,dir,{},{...deps,reuseExisting:true});assert.equal(builds,1);
  await writeFile(path.join(dir,'audio.wav'),'corrupted audio');
  await produceFilm(plan,dir,{},{...deps,reuseExisting:true});assert.equal(builds,2);
  await rm(path.join(dir,'audio.wav'));
  await produceFilm(plan,dir,{},{...deps,reuseExisting:true});assert.equal(builds,3);
}));

test('a changed upstream story invalidates saved sound/mouth stages',()=>workspace(async dir=>{
  const plan=dynamicFixture();let builds=0;
  const deps={quality:'draft',audioBuilder:async()=>{builds++;await writeFile(path.join(dir,'audio.wav'),'test audio '+builds);return{audio:path.join(dir,'audio.wav'),credits:[]};},renderer:async()=>{},videoReviewer:async()=>pass};
  await produceFilm(plan,dir,{},deps);
  const changed=structuredClone(plan);changed.story+=' A new ending.';
  delete changed.replay;
  await produceFilm(canonicalizePlan(changed).plan,dir,{},{...deps,reuseExisting:true});assert.equal(builds,2);
}));

test('retry restores measured mouth curves before deciding whether final media can be reused',()=>workspace(async dir=>{
 const raw=dynamicFixture();raw.scenes[0].sounds=[{query:'laugh',role:'nonverbal',actorId:'hero',start:1,duration:1,volume:.2,required:true}];
 delete raw.replay;
 let renders=0,builds=0,inspections=0;
 const deps={quality:'draft',audioBuilder:async plan=>{
  builds++;plan.scenes[0].sounds[0].mouthCues=[{time:0,open:0},{time:.1,open:.7}];
  await writeFile(path.join(dir,'audio.wav'),'measured audio');await writeFile(path.join(dir,'sound-credits.json'),'[]');
  return{audio:path.join(dir,'audio.wav'),credits:[]};
 },renderer:async plan=>{
  renders++;await writeFile(path.join(dir,'video.mp4'),'mock encoded media');
  await writeFile(path.join(dir,'render-report.json'),JSON.stringify({quality:'draft',replayHash:plan.replay.planHash}));
 },encodedInspector:async(file,plan)=>{inspections++;assert.equal(verifyReplayPlan(plan),true);return{ok:true};},videoReviewer:async()=>pass};
 await assert.rejects(produceFilm(raw,dir,{},{...deps,videoReviewer:async()=>{throw Error('temporary review outage');}}),/temporary review outage/);
 await produceFilm(raw,dir,{},{...deps,reuseExisting:true});
 assert.equal(builds,1);assert.equal(renders,1);assert.equal(inspections,1);
 assert.equal(verifyReplayPlan(JSON.parse(await readFile(path.join(dir,'plan.json'),'utf8'))),true);
}));
