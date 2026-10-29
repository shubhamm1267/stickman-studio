import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {reviewRenderedVideo} from '../server/video-review.mjs';
async function run(report,observations={objects:[],events:[{id:'o1',time:2,action:'A man stands still with a blue oval in his hand.'}],audio:[],problems:[],uncertainties:[]},coverage=[]){
 const dir=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-review-'));let calls=0;
 try{
  await writeFile(path.join(dir,'video.mp4'),'mock movie bytes');
  const fake=async(url,init)=>{
   const body=JSON.parse(init.body),parts=body.contents[0].parts;
   if(calls++===0){assert.equal(parts[0].videoMetadata.fps,12);assert.equal(Buffer.from(parts[0].inlineData.data,'base64').toString(),'mock movie bytes');assert.ok(!parts.at(-1).text.includes('A man jumps.'));}
   else{assert.equal(parts.length,1);assert.match(parts[0].text,/BLIND OBSERVATIONS/);assert.match(parts[0].text,/A man jumps/);}
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(calls===1?observations:report)}]}}]});
  };
  const result=await reviewRenderedVideo(dir,{story:'A man jumps.',coverage},{gemini:'test-key'},undefined,fake);
  assert.equal(calls,2);assert.deepEqual(JSON.parse(await readFile(path.join(dir,'video-observations.json'),'utf8')).events,observations.events);
  assert.equal(JSON.parse(await readFile(path.join(dir,'video-review.json'),'utf8')).passed,result.passed);return result;
 }finally{await rm(dir,{recursive:true,force:true});}
}
const row=(visible,evidenceIds=['o1'])=>({checkId:'story',event:'A man jumps.',visible,time:2,evidenceIds});
test('review observes MP4 without the story and rejects a missing action',async()=>{
 assert.equal((await run({passed:true,summary:'The required jump is absent.',issues:[],observedEvents:[row(false)]})).passed,false);
});
test('a claimed pass cannot cite invented observation IDs or omit coverage checks',async()=>{
 const result=await run({passed:true,summary:'A claimed but unsupported jump.',issues:[],observedEvents:[row(true,['invented'])]},undefined,[{storyEvent:'The man lands.'}]);
 assert.equal(result.passed,false);assert.equal(result.issues.length,2);
});
test('a supported observation can pass but independent visual problems still veto approval',async()=>{
 const observations={objects:[],events:[{id:'o1',time:2,action:'A man jumps upward and lands on both feet.'}],audio:[],problems:[],uncertainties:[]};
 assert.equal((await run({passed:true,summary:'The visible jump matches the requirement.',issues:[],observedEvents:[row(true)]},observations)).passed,true);
 observations.problems=[{time:2,problem:'The feet visibly pass through the floor.',repair:'Keep the feet above the floor.'}];
 assert.equal((await run({passed:true,summary:'The visible jump matches the requirement.',issues:[],observedEvents:[row(true)]},observations)).passed,false);
});

test('oversized encoded video is observed scene-wise with globally unique evidence and timestamps',async()=>{
 const {command}=await import('../server/media.mjs');
 const {appendFile}=await import('node:fs/promises');
 const dir=await mkdtemp(path.join(os.tmpdir(),'stick-review-large-'));
 try{
  await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=12:d=2','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','2','-c:v','libx264','-c:a','aac',path.join(dir,'video.mp4')]);
  // Valid MP4 plus ignored trailing padding exercises the real size branch.
  await appendFile(path.join(dir,'video.mp4'),Buffer.alloc(19*1024*1024));let calls=0;
  const fake=async(url,init)=>{
   const parts=JSON.parse(init.body).contents[0].parts;calls++;
   let result;
   if(calls<=2){assert.equal(parts[0].inlineData.mimeType,'video/mp4');result={objects:[],events:[{id:'same-local-id',time:.5,action:'A blue stage is visible in this clip.'}],audio:[],problems:[],uncertainties:[]};}
   else{assert.match(parts[0].text,/clip0_same-local-id/);assert.match(parts[0].text,/clip1_same-local-id/);result={passed:true,summary:'Both blue scenes are visible.',issues:[],observedEvents:[{checkId:'story',event:'Both scenes appear.',visible:true,time:1.5,evidenceIds:['clip0_same-local-id','clip1_same-local-id']}]};}
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
  };
  const result=await reviewRenderedVideo(dir,{story:'Both scenes appear.',scenes:[{duration:1},{duration:1}]},{gemini:'test-key'},undefined,fake);
  assert.equal(calls,3);assert.equal(result.passed,true);
  const observed=JSON.parse(await readFile(path.join(dir,'video-observations.json'),'utf8'));assert.deepEqual(observed.events.map(e=>e.time),[.5,1.5]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
