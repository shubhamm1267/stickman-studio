import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {JobQueue} from '../server/queue.mjs';
import {dynamicFixture} from '../scripts/make-dynamic-fixtures.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {planHash} from '../server/inspect.mjs';

for(const mode of ['dynamic','legacy-semantic'])test(`render dispatch preserves the ${mode} score format`,async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dynamic-render-route-')),queue=new JobQueue(root);
 let audioCalls=0;
 const {app}=await createApp({queue,audioBuilder:async()=>{audioCalls++;throw Error('TEST_AUDIO_STAGE_REACHED');},renderer:async()=>{throw Error('Must stop before rendering');}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const raw=dynamicFixture();delete raw.replay;
  if(mode==='dynamic')raw.planningMode='dynamic';else delete raw.planningMode;
  // The dynamic score is deliberately not a DirectorScoreSchema object.
  raw.directionScore=JSON.stringify({version:1,scenes:[]});
  const plan=canonicalizePlan(raw).plan;
  plan.review={method:'gemini',planHash:planHash(plan),summary:'Reviewed fixture for render dispatch only.'};
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,mode:'live',credentials:{gemini:'no-network',freesound:'no-network'}})});
  assert.equal(response.status,202);
  const job=await response.json();
  for(let attempt=0;attempt<200&&['queued','running'].includes(queue.public(job.id).status);attempt++)await new Promise(r=>setTimeout(r,5));
  const state=queue.public(job.id);assert.equal(state.status,'failed');
  if(mode==='dynamic'){
   assert.equal(audioCalls,1);assert.equal(state.error,'TEST_AUDIO_STAGE_REACHED');
   const resumed=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,resumeJobId:job.id,mode:'live',credentials:{gemini:'no-network',freesound:'no-network'}})});
   assert.equal(resumed.status,202);assert.equal((await resumed.json()).id,job.id);
   for(let attempt=0;attempt<200&&['queued','running'].includes(queue.public(job.id).status);attempt++)await new Promise(r=>setTimeout(r,5));
   assert.equal(queue.public(job.id).status,'failed');assert.equal(audioCalls,2);assert.equal(queue.public(job.id).attempts,2);
  }
  else{assert.equal(audioCalls,0);assert.match(state.error,/Invalid input/);}
 }finally{
  await new Promise(r=>server.close(r));
  while(queue.busy)await new Promise(r=>setTimeout(r,5));
  await queue.close();await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});
 }
});
