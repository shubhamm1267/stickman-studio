import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import {buildAudio} from '../server/media.mjs';
import {renderFilm} from '../server/render.mjs';
import {reviewRenderedVideo} from '../server/video-review.mjs';
import {creatorPack} from '../server/creator.mjs';
import {inspectPlan} from '../server/inspect.mjs';
import {validatePlan} from '../shared/schema.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';

const dir='deliverables/hulk-fanta-child';
let plan=validatePlan(JSON.parse(await readFile(dir+'/plan.json','utf8')));
const preflight=inspectPlan(plan,{requireCoverage:false});
if(!preflight.ok)throw Error(JSON.stringify(preflight.issues));
const keys={gemini:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL,freesound:process.env.FREESOUND_API_KEY};
const signal=AbortSignal.timeout(900000);
const {audio,credits}=await buildAudio(plan,dir,keys,signal,{progress:console.log});
// Measured vocal envelopes change replay contents; bind the exported plan to
// the actual mouth animation that will be rendered.
delete plan.replay;
plan=canonicalizePlan(plan).plan;
await writeFile(dir+'/plan.json',JSON.stringify(plan,null,2));
await renderFilm(plan,dir,audio,{signal,quality:'full',progress:(message,percent)=>console.log(percent,message)});
await writeFile(dir+'/creator-pack.json',JSON.stringify(creatorPack(plan,credits),null,2));
await writeFile(dir+'/sample-disclosure.json',JSON.stringify({authoredSample:true,liveGeminiStoryGeneration:false,audioSource:'Freesound CC0 recordings, selected live',intelligibleDialogue:false,storyInterpretation:'The little boy punches Hulk and laughs; the elder watches.',limits:'Specifically choreographed sample. Does not demonstrate arbitrary-story generation.'},null,2));
console.log('Rendered full-quality MP4; independently reviewing the actual encoded video.');
const review=await reviewRenderedVideo(dir,plan,keys,signal);
console.log(JSON.stringify({video:dir+'/video.mp4',reviewPassed:review.passed,issues:review.issues}));
