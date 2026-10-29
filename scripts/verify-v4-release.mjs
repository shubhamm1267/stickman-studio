import fs from 'node:fs/promises';import path from 'node:path';
import {ROOT,atomic} from '../server/files.mjs';import {planHash} from '../server/inspect.mjs';import {probe,command} from '../server/media.mjs';
const jobRoot=path.resolve(process.env.V4_JOB_DIR || path.join(ROOT,'data/jobs')),dirs=await fs.readdir(jobRoot),report=[];
const rendererChanged=Math.max(...await Promise.all((await fs.readdir(path.join(ROOT,'renderer'))).map(async n=>(await fs.stat(path.join(ROOT,'renderer',n))).mtimeMs)));
for(const name of ['banana-bin','lion-balloon']){
 const source=JSON.parse(await fs.readFile(path.join(ROOT,'examples',name+'.json'))),candidates=[];
 for(const id of dirs){const folder=path.join(jobRoot,id);try{const j=JSON.parse(await fs.readFile(path.join(folder,'job.json')));if(j.status!=='completed')continue;const p=JSON.parse(await fs.readFile(path.join(folder,'plan.json'))),r=JSON.parse(await fs.readFile(path.join(folder,'render-report.json')));if(planHash(p)!==planHash(source)||Date.parse(r.renderedAt)<rendererChanged)continue;candidates.push({id,folder,j,r});}catch{}}
 candidates.sort((a,b)=>Date.parse(b.r.renderedAt)-Date.parse(a.r.renderedAt));const c=candidates[0];if(!c)throw Error('Final current-source render still pending: '+name);
 const dest=path.join(ROOT,'deliverables',name);await fs.mkdir(dest,{recursive:true});for(const file of c.j.result.files)await fs.copyFile(path.join(c.folder,file),path.join(dest,file));
 const media=await probe(path.join(dest,'video.mp4'));await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',path.join(dest,'video.mp4'),'-f','null','-']);
 const qa=JSON.parse(await fs.readFile(path.join(dest,'quality-report.json')));if(!qa.ok||!qa.reviewCurrent)throw Error('Quality preflight failed');
 const v=media.streams.find(s=>s.codec_type==='video');report.push({name,jobId:c.id,width:v.width,height:v.height,frames:v.nb_frames,duration:media.format.duration,hook:qa.hook,status:'passed',sourcePlanHash:planHash(source),renderedAt:c.r.renderedAt,fullDecode:'passed'});
}
await atomic(path.join(ROOT,'docs/v4-sample-results.json'),report);console.log(JSON.stringify(report,null,2));
