import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {redact} from '../server/files.mjs';
const {app,queue}=await createApp(),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,results=[];
try{
 for(const name of (process.argv.slice(2).length?process.argv.slice(2):['comparison-silent-slapstick','comparison-coloured-cartoon','comparison-elastic-meme','supported-acting','dynamic-excavator-fridge','eight-arm-creature'])){
  const dest=path.resolve('deliverables/production-'+name);await fs.mkdir(dest,{recursive:true});let job;
  try{
   const plan=JSON.parse(await fs.readFile(path.resolve('examples',name+'.json'),'utf8'));
   const response=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,quality:'full'})});if(response.status!==202)throw Error(await response.text());job=await response.json();let last='';
   while(true){const j=await(await fetch(base+'/api/jobs/'+job.id)).json();if(j.message!==last){console.log(name,j.message);last=j.message;}if(j.status==='completed'){for(const file of j.result.files)await fs.copyFile(path.join(queue.root,j.id,file),path.join(dest,file));results.push({name,passed:true,method:'HTTP /api/render, live sounds, encoded-video observation and repair'});break;}if(['failed','cancelled','interrupted'].includes(j.status))throw Error(j.error||j.status);await new Promise(r=>setTimeout(r,1500));}
  }catch(e){results.push({name,passed:false,error:redact(e.message,{gemini:process.env.GEMINI_API_KEY,freesound:process.env.FREESOUND_API_KEY})});if(job){for(const file of ['plan.json','quality-report.json','video-review.json','video-observations.json','encoded-quality-report.json'])await fs.copyFile(path.join(queue.root,job.id,file),path.join(dest,file)).catch(()=>{});}}
  await fs.writeFile(path.resolve('deliverables/production-sample-results.json'),JSON.stringify(results,null,2));
 }
}finally{await queue.close();await new Promise(r=>server.close(r));}
if(results.some(r=>!r.passed))process.exitCode=1;
