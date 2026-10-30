import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {geminiJSON,providerRetryDelay} from '../server/providers.mjs';
test('provider backoff honors Google RetryInfo instead of retrying inside its quota window',()=>{
 const body=JSON.stringify({error:{details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'57.5s'}]}});
 assert.equal(providerRetryDelay(null,body,0),57500);
 assert.equal(providerRetryDelay('60',body,0),60000);
 assert.equal(providerRetryDelay(null,'bad json',3),8000);
 assert.equal(providerRetryDelay(null,JSON.stringify({error:{details:[{retryDelay:'999s'}]}}),0),120000);
});
test('Gemini generateContent uses JSON mode and parses actual candidates',async()=>{
 let out=await geminiJSON('hello',z.object({ok:z.boolean()}),{gemini:'fake',geminiModel:'gemini-3.5-flash-lite'},undefined,async(url,options)=>{
 assert.match(url,/models\/gemini-3.5-flash-lite:generateContent$/);
 const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.match(body.contents[0].parts[0].text,/JSON Schema/);
 return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]});
 });assert.equal(out.ok,true);
});
test('Gemini truncated JSON is reported before JSON parsing',async()=>{
 await assert.rejects(()=>geminiJSON('hello',z.object({ok:z.boolean()}),{gemini:'fake'},undefined,async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"ok":'}]}}]})),/truncated/);
});

test('Gemini unwraps a single validated object but rejects multiple candidate objects',async()=>{
 const schema=z.object({ok:z.boolean()});
 const response=value=>async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
 assert.deepEqual(await geminiJSON('ok',schema,{gemini:'fake'},undefined,response([{ok:true}])),{ok:true});
 await assert.rejects(()=>geminiJSON('ok',schema,{gemini:'fake'},undefined,response([{ok:true},{ok:false}])));
});
test('Gemini retries malformed JSON without changing the selected Lite model',async()=>{
 let calls=0;
 const result=await geminiJSON('Return ok',z.object({ok:z.boolean()}),{gemini:'fake',geminiModel:'gemini-3.5-flash-lite'},undefined,async(url,options)=>{
  calls++;assert.match(url,/gemini-3.5-flash-lite/);if(calls===2)assert.match(JSON.parse(options.body).contents[0].parts.at(-1).text,/malformed JSON/);
  return Response.json({candidates:[{content:{parts:[{text:calls===1?'{ok:true}':'{"ok":true}'}]}}]});
 });assert.equal(calls,2);assert.equal(result.ok,true);
});
test('download sends attachment disposition and preview stays inline',async()=>{
 const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const {createApp}=await import('../server/index.mjs');const {JobQueue}=await import('../server/queue.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'download-'));const queue=new JobQueue(dir);const {app}=await createApp({queue});
 const srv=app.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
 try{const job=await queue.add('render',async()=>({}),{},{});await fs.mkdir(path.join(dir,job.id),{recursive:true});await fs.writeFile(path.join(dir,job.id,'video.mp4'),'test bytes');
 const url=`http://127.0.0.1:${srv.address().port}/api/files/${job.id}/video.mp4`;
 const inline=await fetch(url);assert.equal(inline.status,200);assert.equal(inline.headers.get('content-disposition'),null);assert.equal(await inline.text(),'test bytes');
 const download=await fetch(url+'?download=1');assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment; filename="video.mp4"/);assert.equal(await download.text(),'test bytes');
 }finally{
  await new Promise(r=>srv.close(r));
  const deadline=Date.now()+5000;
  while(queue.busy&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
  assert.equal(queue.busy,false,'Download fixture job must finish before removing its directory');
  await queue.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:50});
 }
});
test('camera cut compilation fills gaps without changing camera positions',async()=>{
 const {compileScene}=await import('../server/scene-compile.mjs');const scene={duration:10,shots:[{start:0.2,end:2,focus:[200,400],zoom:1},{start:4,end:8,focus:[300,350],zoom:1.5}]};
 const result=compileScene(scene);assert.deepEqual(result.shots.map(q=>[q.start,q.end]),[[0,4],[4,10]]);assert.deepEqual(result.shots.map(q=>q.focus),scene.shots.map(q=>q.focus));assert.equal(scene.shots[0].start,.2);
});
test('headwear requirement recognizes timed attachment events',async()=>{
 const {readFile}=await import('node:fs/promises');const {validatePlan}=await import('../shared/schema.mjs');
 const p=JSON.parse(await readFile(new URL('../examples/superhero-v9.json',import.meta.url),'utf8'));
 const s=p.scenes[0],prop=s.props[0],actor=s.cast[0].characterId;delete prop.attachment;delete prop.attachAt;
 prop.attachmentEvents=[{at:1,attachment:{actorId:actor,bone:'head',offset:[0,0]}}];
 p.requirements=[{description:'Object lands on the head later in the scene',sceneId:s.id,characterId:actor,propId:prop.designId,worn:true}];
 assert.doesNotThrow(()=>validatePlan(p));prop.attachmentEvents=[];assert.throws(()=>validatePlan(p),/headwear/);
});
