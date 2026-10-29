import 'dotenv/config';
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {planStory} from '../server/providers.mjs';
import {atomic,ROOT} from '../server/files.mjs';
import {produceFilm} from '../server/production.mjs';
const dir=path.join(ROOT,'deliverables',process.env.SAMPLE_DIR||'live-api-sample');await mkdir(dir,{recursive:true});
const credentials={gemini:process.env.GEMINI_API_KEY,freesound:process.env.FREESOUND_API_KEY,geminiModel:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite'};
const directionDraft=process.env.SAMPLE_DIRECTION_DRAFT?JSON.parse(await readFile(process.env.SAMPLE_DIRECTION_DRAFT,'utf8')):undefined;
try {
 let plan=process.env.SAMPLE_RESUME==='1' ? JSON.parse(await readFile(path.join(dir,'plan.json'),'utf8')) : await planStory({story:process.env.SAMPLE_STORY ?? '',directionDraft,directionMode:'semantic',productionMode:'silent-sfx',strictStoryAudit:true,duration:10,durationMode:'manual',renderFps:60,format:'shorts',language:'en',voice:false,artStyle:'pencil',humorProfile:'clean'},credentials,undefined,(m)=>console.log(m));
 const produced=await produceFilm(plan,dir,credentials,{reuseExisting:process.env.SAMPLE_RESUME==='1',progress:console.log});plan=produced.plan;const credits=produced.credits;
 await atomic(path.join(dir,'live-test.json'),{geminiModel:credentials.geminiModel,gemini:true,storyRequestedThisRun:process.env.SAMPLE_RESUME!=='1',resumedPlan:process.env.SAMPLE_RESUME==='1',resumedDirectionDraft:!!directionDraft,freesound:true,soundIds:credits.map(x=>x.id),bundled:false});
 console.log('LIVE SAMPLE COMPLETE');
}catch(e){console.error(e.stack);process.exitCode=1;}
