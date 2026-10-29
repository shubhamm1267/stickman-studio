import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {reviewRenderedVideo} from '../server/video-review.mjs';
import {redact} from '../server/files.mjs';
const dir=path.resolve(process.argv[2]),plan=JSON.parse(await fs.readFile(path.join(dir,'plan.json'),'utf8'));
try{const r=await reviewRenderedVideo(dir,plan,{gemini:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL},AbortSignal.timeout(180000));console.log(JSON.stringify({passed:r.passed,summary:r.summary,issues:r.issues},null,2));}
catch(e){const r={passed:false,blocked:true,method:'live encoded observation attempt',error:redact(e.message,{gemini:process.env.GEMINI_API_KEY,freesound:process.env.FREESOUND_API_KEY})};await fs.writeFile(path.join(dir,'video-review-blocker.json'),JSON.stringify(r,null,2));console.log(r);process.exitCode=1;}
