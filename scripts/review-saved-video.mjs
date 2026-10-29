import 'dotenv/config';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {reviewRenderedVideo} from '../server/video-review.mjs';
import {redact} from '../server/files.mjs';

const credentials={gemini:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite'};
try{
 if(!process.argv[2])throw Error('Usage: node scripts/review-saved-video.mjs VIDEO_DIRECTORY');
 const dir=path.resolve(process.argv[2]),plan=JSON.parse(await readFile(path.join(dir,'plan.json'),'utf8'));
 const report=await reviewRenderedVideo(dir,plan,credentials);
 console.log(JSON.stringify({passed:report.passed,method:report.method,issues:report.issues,summary:report.summary},null,2));
 if(!report.passed)process.exitCode=1;
}catch(error){console.error(redact(error.message,credentials));process.exitCode=1;}
