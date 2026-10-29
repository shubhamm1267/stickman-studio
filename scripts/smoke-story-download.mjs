import 'node:process';
import {mkdtemp,readFile,rm,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {JobQueue} from '../server/queue.mjs';
import {ROOT} from '../server/files.mjs';
import {probe,command} from '../server/media.mjs';

// This smoke is fully local and bundled; do not authenticate to providers.
process.env.STUDIO_TOKEN='';
const {createApp}=await import('../server/index.mjs');
const dir=await mkdtemp(path.join(os.tmpdir(),'story-ir-download-'));
const queue=new JobQueue(dir),{app}=await createApp({queue});
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
let jobId;
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 const plan=JSON.parse(await readFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),'utf8'));
 const response=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,mode:'bundled',quality:'draft'})});
 if(response.status!==202)throw Error(`Render request failed (${response.status}): ${(await response.text()).slice(0,300)}`);
 let job=await response.json();jobId=job.id;
 const deadline=Date.now()+600000;
 while(Date.now()<deadline){
  job=await(await fetch(base+'/api/jobs/'+jobId)).json();
  if(job.status==='completed')break;
  if(['failed','cancelled','interrupted'].includes(job.status))throw Error(job.error||job.status);
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(job.status!=='completed')throw Error('Bundled API render timed out.');
 if(!job.result.files.includes('story-ir.json'))throw Error('Render result omitted the canonical IR artifact.');
 const videoResponse=await fetch(base+`/api/files/${jobId}/video.mp4?download=1`);
 if(videoResponse.status!==200||!videoResponse.headers.get('content-disposition')?.includes('attachment'))throw Error('MP4 browser-download endpoint did not send an attachment.');
 const downloaded=Buffer.from(await videoResponse.arrayBuffer());
 const saved=await readFile(path.join(queue.root,jobId,'video.mp4'));
 if(!downloaded.equals(saved))throw Error('Downloaded MP4 bytes differ from the encoded job artifact.');
 if(downloaded.subarray(4,8).toString()!=='ftyp')throw Error('Downloaded artifact is not an MP4 container.');
 const irResponse=await fetch(base+`/api/files/${jobId}/story-ir.json?download=1`);
 if(irResponse.status!==200||!irResponse.headers.get('content-disposition')?.includes('attachment'))throw Error('Canonical IR download failed.');
 const ir=JSON.parse(await irResponse.text());
 if(ir.schemaVersion!==2||ir.timebase?.unit!=='frame'||!ir.scenes?.[0]?.performance?.actions?.length)throw Error('Downloaded frame-based Story IR v2 is incomplete.');
 const info=await probe(path.join(queue.root,jobId,'video.mp4'));
 const video=info.streams.find(x=>x.codec_type==='video'),audio=info.streams.find(x=>x.codec_type==='audio');
 if(video?.codec_name!=='h264'||audio?.codec_name!=='aac'||+video.nb_frames!==240)throw Error('Unexpected H.264/AAC or frame count.');
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',path.join(queue.root,jobId,'video.mp4'),'-f','null','-']);
 const digest=createHash('sha256').update(downloaded).digest('hex');
 console.log(`PASS offline API render/download: H.264/AAC, ${video.width}x${video.height}, ${video.nb_frames} frames; MP4 attachment bytes match SHA-256 ${digest}; frame-based Story IR v${ir.schemaVersion} downloaded.`);
}finally{
 await new Promise(resolve=>server.close(resolve));
 await queue.close();
 if(jobId)await unlink(path.join(ROOT,'public',jobId+'-audio.wav')).catch(()=>{});
 await rm(dir,{recursive:true,force:true});
}
