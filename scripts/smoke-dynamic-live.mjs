import 'dotenv/config';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {planStory} from '../server/providers.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {inspectPlan} from '../server/inspect.mjs';
import {redact} from '../server/files.mjs';

// Explicit live smoke: uses configured Gemini quota. No paid image or speech API.
const credentials={gemini:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL};
const dir=process.env.SMOKE_OUTPUT?new URL(process.env.SMOKE_OUTPUT.replace(/\/?$/,'/') ,new URL('../',import.meta.url)):new URL('../deliverables/dynamic-live/',import.meta.url);await mkdir(dir,{recursive:true});
try{
  const plan=await planStory({directionMode:'dynamic',productionMode:'silent-sfx',category:process.env.STORY_CATEGORY||'slapstick',...(process.env.REFERENCE_STYLE?{referenceStyle:process.env.REFERENCE_STYLE}:{}),story:process.argv[2]||'An adult man watches an electric fan start spinning its three blades. He opens his mouth in surprise, then smiles when the blades stop. Keep one scene.',duration:Number(process.env.SAMPLE_SECONDS||10),durationMode:'manual',format:'landscape',language:'en',renderFps:60},credentials,AbortSignal.timeout(360000),(message)=>console.log(message));
  const canonical=canonicalizePlan(plan),report=inspectPlan(canonical.plan,{requireCoverage:true});
  await writeFile(new URL('plan.json',dir),JSON.stringify(canonical.plan,null,2));
  await writeFile(new URL('report.json',dir),JSON.stringify({liveGemini:true,liveFreesound:false,rendered:false,...report},null,2));
  await unlink(new URL('failure.json',dir)).catch(()=>{});
  console.log('PASS live Gemini dynamic plan; render and Freesound are separate checks.');
}catch(error){
  const message=redact(error.message,credentials);
  await writeFile(new URL('failure.json',dir),JSON.stringify({liveGemini:true,passed:false,error:message},null,2));
  console.error(message.slice(0,1800));process.exitCode=1;
}
