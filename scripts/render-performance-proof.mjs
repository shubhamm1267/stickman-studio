import 'dotenv/config';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {compileStylePerformance} from '../shared/style-performance.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {renderFilm} from '../server/render.mjs';
import {reviewRenderedVideo} from '../server/video-review.mjs';
import {buildAudio} from '../server/media.mjs';
const [source,audio,output]=process.argv.slice(2);
if(!source||!audio||!output)throw Error('Usage: node scripts/render-performance-proof.mjs plan.json audio.wav|--resolve-audio output-directory');
const raw=JSON.parse(await readFile(source,'utf8'));delete raw.replay;delete raw.review;
const plan=canonicalizePlan(compileStylePerformance(raw)).plan,dir=path.resolve(output);await mkdir(dir,{recursive:true});
const credentials={gemini:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL,freesound:process.env.FREESOUND_API_KEY};
let resolvedAudio;
if(audio==='--resolve-audio')resolvedAudio=(await buildAudio(plan,dir,credentials,undefined,{progress:console.log})).audio;
else{
 resolvedAudio=path.resolve(audio);
 await copyFile(path.join(path.dirname(resolvedAudio),'sound-credits.json'),path.join(dir,'sound-credits.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
await writeFile(path.join(dir,'plan.json'),JSON.stringify(plan,null,2));
await renderFilm(plan,dir,resolvedAudio,{quality:'draft',progress:(message,percent)=>console.log(percent,message)});
const review=await reviewRenderedVideo(dir,plan,credentials);
console.log(JSON.stringify({rendered:true,reviewPassed:review.passed,issues:review.issues}));
if(!review.passed)process.exitCode=1;
