import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {JobQueue} from '../server/queue.mjs';
import {redact} from '../server/files.mjs';

// Acceptance requests only: no scene JSON, planner, audio, renderer or reviewer
// is substituted. This uses the same HTTP plan/render routes as Angular.
const cases=[
  {id:'bottle',duration:20,story:'Hulk and an elderly man stand by a table with a Fanta bottle. Hulk tries twice to unscrew the cap but fails. A visibly small boy walks in, holds the bottle with one hand, effortlessly unscrews and removes its cap with the other hand, and hands the open bottle to Hulk. Hulk bends down; the boy gives his cheek a harmless cartoon punch and laughs while the elderly man chuckles. No injury and no intelligible speech.'},
  {id:'peel',duration:12,story:'An adult man walks towards a clearly recognizable discarded empty banana peel on the floor. His shoe steps on the peel, he slips, flails both arms to regain balance, and recovers upright without falling. He looks back at the peel in embarrassment and grins. No intelligible speech.'},
  {id:'unseen',duration:14,story:'Two visibly different adult friends stand beside a small wooden box with a hinged lid and a concertina bellows inside. One friend lifts the lid and presses the bellows down with one hand. The bellows visibly compresses with a squeak. The other friend jumps in surprise, realizes what happened, and both laugh. Keep the lid visibly attached to its hinge and show hand contact. No intelligible speech.'},
];
const selected=process.argv.slice(2),root=path.resolve(process.env.ACCEPTANCE_OUTPUT||'deliverables/generation-flow');
await mkdir(root,{recursive:true});
const queue=new JobQueue(path.join(root,'jobs'),{retentionMs:24*3600*1000});
const {app}=await createApp({queue});const server=app.listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,results=[];
const keys={gemini:process.env.GEMINI_API_KEY,freesound:process.env.FREESOUND_API_KEY};
const headers={'Content-Type':'application/json',...(process.env.STUDIO_TOKEN?{Authorization:'Bearer '+process.env.STUDIO_TOKEN}:{})};
async function post(route,body){const response=await fetch(base+route,{method:'POST',headers,body:JSON.stringify(body)}),value=await response.json();if(!response.ok)throw Error(value.error||'HTTP '+response.status);return value;}
async function wait(job){
  const deadline=Date.now()+15*60*1000;let message='';
  while(Date.now()<deadline){
    const response=await fetch(base+'/api/jobs/'+job.id,{headers}),state=await response.json();
    if(state.message!==message){message=state.message;console.log(job.id.slice(0,8),state.status,redact(message,keys));}
    if(!['queued','running'].includes(state.status))return state;
    await new Promise(r=>setTimeout(r,2000));
  }
  await post('/api/jobs/'+job.id+'/cancel',{});
  while(queue.busy)await new Promise(r=>setTimeout(r,250));
  throw Error('Acceptance job exceeded its 15-minute budget and was cancelled.');
}
try{
  for(const scenario of cases.filter(c=>!selected.length||selected.includes(c.id))){
    const row={case:scenario.id,story:scenario.story,liveGemini:true,liveFreesound:false,manualSceneJSON:false,startedAt:new Date().toISOString()};results.push(row);
    try{
      console.log('START',scenario.id);
      const planned=await post('/api/plan',{options:{story:scenario.story,directionMode:'dynamic',referenceStyle:'silent-slapstick',productionMode:'silent-sfx',category:'family-comedy',artStyle:'pencil',format:scenario.id==='unseen'?'landscape':'shorts',duration:scenario.duration,durationMode:'manual',renderFps:60,language:'en',voice:false}});
      row.planJobId=planned.id;const plan=await wait(planned);
      if(plan.status!=='completed')throw Error('Planning: '+(plan.error||plan.message));
      const rendered=await post('/api/render',{plan:plan.result.plan,mode:'live',quality:'full'});
      row.renderJobId=rendered.id;const render=await wait(rendered);
      row.liveFreesound=render.history?.some(e=>e.message.startsWith('Finding sound:'))||false;
      row.status=render.status;row.outputDirectory=path.join(queue.root,rendered.id);
      if(render.status!=='completed')throw Error('Rendering: '+(render.error||render.message));
    }catch(error){row.status='failed';row.error=redact(error.message,keys);console.log('FAIL',scenario.id,row.error.slice(0,2200));}
    row.finishedAt=new Date().toISOString();await writeFile(path.join(root,'acceptance-results.json'),JSON.stringify(results,null,2));
  }
}finally{
  await new Promise(r=>server.close(r));
  while(queue.busy)await new Promise(r=>setTimeout(r,100));
  await queue.close();
}
console.log(JSON.stringify(results));
if(results.some(r=>r.status!=='completed'))process.exitCode=1;
