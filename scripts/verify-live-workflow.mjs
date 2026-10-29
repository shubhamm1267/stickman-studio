import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {redact} from '../server/files.mjs';
process.env.RENDER_ENGINE='resvg';
const dir=path.resolve('deliverables/live-workflow');await fs.mkdir(dir,{recursive:true});
const {app,queue}=await createApp();const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const report={method:'actual HTTP /api/plan then /api/render, bundled=false',story:'An adult man waves at a small electric fan. Its three blades start spinning; he looks surprised. The fan stops; he smiles.',started:new Date().toISOString(),passed:false};
const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();};
async function wait(job){const deadline=Date.now()+420000;let last='';while(Date.now()<deadline){const j=await(await fetch(base+'/api/jobs/'+job.id)).json();if(j.message!==last){console.log(j.message);last=j.message;}if(j.status==='completed')return j;if(['failed','cancelled','interrupted'].includes(j.status))throw Error(j.error||j.status);await new Promise(r=>setTimeout(r,1500));}await post('/api/jobs/'+job.id+'/cancel',{});throw Error('Live workflow exceeded 7 minutes at this stage');}
try{
 const job=await post('/api/plan',{options:{referenceStyle:'elastic-meme',story:report.story,duration:10,durationMode:'manual',format:'shorts',renderFps:60}});report.planJobId=job.id;
 const planned=await wait(job);const plan=planned.result.plan;await fs.writeFile(path.join(dir,'generated-plan.json'),JSON.stringify(plan,null,2));report.planningPassed=true;
 const rendered=await wait(await post('/api/render',{plan,quality:'full'}));report.renderJobId=rendered.id;
 for(const file of rendered.result.files)await fs.copyFile(path.join(queue.root,rendered.id,file),path.join(dir,file));report.passed=true;
}catch(e){report.error=redact(e.message,{gemini:process.env.GEMINI_API_KEY,freesound:process.env.FREESOUND_API_KEY});console.log(report.error.slice(0,1000));}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(dir,'workflow-report.json'),JSON.stringify(report,null,2));await queue.close();await new Promise(r=>server.close(r));}
