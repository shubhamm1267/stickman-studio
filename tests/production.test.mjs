import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {produceFilm} from '../server/production.mjs';
test('resume rebuilds stale media when the saved render lacks the current plan binding',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-stale-media-'));
 try{
  const plan=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
  await writeFile(path.join(dir,'video.mp4'),'obsolete encoded file');await writeFile(path.join(dir,'sound-credits.json'),'[]');
  for(const report of [{quality:'full'},{quality:'full',planHash:'different-story'}]){
   await writeFile(path.join(dir,'render-report.json'),JSON.stringify(report));let renders=0,audio=0;
   await produceFilm(plan,dir,{},{reuseExisting:true,audioBuilder:async()=>{audio++;return{audio:'mock.wav',credits:[]};},renderer:async()=>{renders++;},videoReviewer:async()=>({passed:true,issues:[],observedEvents:[],summary:'Mocked provider result for stale media handling.'})});
   assert.equal(renders,1);assert.equal(audio,1);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('production rebuilds after audiovisual rejection and refuses a second rejected render',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-production-'));
  const plan=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
  const failure={passed:false,summary:'The object never moves.',issues:[{time:1,problem:'Missing prop flight',repair:'Add prop motion'}],observedEvents:[{event:'Flight',visible:false,time:1}]};
  let renders=0,audio=0,repairs=0,reviews=0;
  const deps={audioBuilder:async()=>{audio++;return{audio:'mock.wav',credits:[]};},renderer:async()=>{renders++;},videoRepairer:async p=>{repairs++;return p;},videoReviewer:async()=>++reviews===1?failure:{passed:true,summary:'All events are visible.',issues:[],observedEvents:[{event:'Flight',visible:true,time:1}]}};
  try{
    await produceFilm(plan,dir,{},{...deps});assert.equal(renders,2);assert.equal(audio,2);assert.equal(repairs,1);assert.equal(reviews,2);
    renders=0;repairs=0;
    await assert.rejects(()=>produceFilm(plan,dir,{},{...deps,videoReviewer:async()=>failure}),/after one audiovisual repair/);
    assert.equal(renders,2);assert.equal(repairs,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
