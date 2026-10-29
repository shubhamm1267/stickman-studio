import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,access,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {JobQueue} from '../server/queue.mjs';
import {createApp} from '../server/index.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function idle(q){const until=Date.now()+5000;while(q.busy&&Date.now()<until)await wait(10);assert.equal(q.busy,false);}
test('MP4 downloads before expiry; media is deleted at ten minutes and stays expired after restart',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-retention-'));let time=Date.now();
  const q=new JobQueue(root,{now:()=>time});const {app}=await createApp({queue:q});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let restored;
  try{
    const job=await q.add('render',async(j,dir)=>{await writeFile(path.join(dir,'video.mp4'),'test download bytes');await writeFile(path.join(dir,'audio.wav'),'test audio');await writeFile(path.join(dir,'plan.json'),'{}');return{};});await idle(q);
    assert.equal(Date.parse(q.public(job.id).videoExpiresAt)-Date.parse(q.public(job.id).videoCreatedAt),600000);
    const url=`http://127.0.0.1:${server.address().port}/api/files/${job.id}/video.mp4?download=1`;
    let response=await fetch(url);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(await response.text(),'test download bytes');
    time+=599999;response=await fetch(url);assert.equal(response.status,200);await response.arrayBuffer();
    time+=1;response=await fetch(url);assert.equal(response.status,410);assert.match((await response.json()).error,/expired/);
    await assert.rejects(()=>access(path.join(root,job.id,'video.mp4')));await assert.rejects(()=>access(path.join(root,job.id,'audio.wav')));assert.equal(await readFile(path.join(root,job.id,'plan.json'),'utf8'),'{}');
    await q.close();restored=new JobQueue(root,{now:()=>time});await restored.init();assert.equal(restored.public(job.id).mediaExpired,true);
  }finally{await q.close();await restored?.close();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
test('cleanup is scheduled automatically without a download request',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-expiry-timer-')),q=new JobQueue(root,{retentionMs:80});await q.init();
  try{const j=await q.add('render',async(job,dir)=>{await writeFile(path.join(dir,'video.mp4'),'test');return{};});await idle(q);const deadline=Date.now()+3000;while(!q.public(j.id).mediaExpired&&Date.now()<deadline)await wait(15);await q.expireMedia(j.id);assert.equal(q.public(j.id).mediaExpired,true);await assert.rejects(()=>access(path.join(root,j.id,'video.mp4')));}finally{await q.close();await rm(root,{recursive:true,force:true});}
});
test('a repair render cannot be deleted by the previous render expiry timer',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-repair-expiry-'));let time=Date.now();const q=new JobQueue(root,{now:()=>time});await q.init();
 try{const j=await q.add('render',async(job,dir)=>{await writeFile(path.join(dir,'video.mp4'),'first');return{};});await idle(q);await q.beginMediaRender(j.id);time+=600001;assert.equal(await q.expireMedia(j.id),false);assert.equal(await readFile(path.join(root,j.id,'video.mp4'),'utf8'),'first');await q.markMediaReady(j.id);assert.equal(Date.parse(q.public(j.id).videoExpiresAt),time+600000);}finally{await q.close();await rm(root,{recursive:true,force:true});}
});

test('reviewing saved media preserves its deadline and cannot revive expired output',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-review-expiry-'));let time=Date.now();const q=new JobQueue(root,{now:()=>time});await q.init();
 try{
  const j=await q.add('render',async(job,dir)=>{await writeFile(path.join(dir,'video.mp4'),'saved');return{};});await idle(q);
  const expires=q.public(j.id).videoExpiresAt;time+=1000;
  await q.retryVideoReview(j.id,async()=>({reviewed:true}));await idle(q);
  assert.equal(q.public(j.id).status,'completed');assert.equal(q.public(j.id).videoExpiresAt,expires);
  time=Date.parse(expires);await assert.rejects(()=>q.retryVideoReview(j.id,async()=>({})),/expired/);
  assert.equal(q.public(j.id).mediaExpired,true);await assert.rejects(()=>access(path.join(root,j.id,'video.mp4')));
 }finally{await q.close();await rm(root,{recursive:true,force:true});}
});
