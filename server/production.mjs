import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,access,mkdir,rm,unlink} from 'node:fs/promises';
import {atomic,redact,ROOT} from './files.mjs';
import {assertRenderable,planHash} from './inspect.mjs';
import {buildAudio} from './media.mjs';
import {renderFilm} from './render.mjs';
import {reviewRenderedVideo,repairRenderedPlan} from './video-review.mjs';
import {inspectEncoded} from './encoded-quality.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {verifyReplayPlan} from '../shared/schema.mjs';
import {applyAssetFactoryOverrides,compileAssetFactoryPipeline} from './asset-factory.mjs';

export async function produceFilm(input,dir,credentials,{signal,progress=()=>{},quality='full',bundled=false,liveDialogue=false,reuseExisting=false,providedAssets={},audioBuilder=buildAudio,renderer=renderFilm,videoReviewer=reviewRenderedVideo,videoRepairer=repairRenderedPlan,encodedInspector=inspectEncoded}={}){
  if(input?.replay&&!verifyReplayPlan(input))throw Error('Saved replay metadata does not match the plan contents.');
  let {plan}=canonicalizePlan(input),credits=[];
  const state={version:1,status:'running',inputHash:planHash(plan),stages:[]};
  const stage=async(name,attempt,operation)=>{
    signal?.throwIfAborted();
    const row={name,attempt,status:'running',planHash:planHash(plan),startedAt:new Date().toISOString()};
    state.stages.push(row);await atomic(path.join(dir,'production-state.json'),state);
    try{const result=await operation();signal?.throwIfAborted();row.status='completed';row.finishedAt=new Date().toISOString();await atomic(path.join(dir,'production-state.json'),state);return result;}
    catch(error){row.status=signal?.aborted?'cancelled':'failed';row.error=redact(error.message,credentials);state.status=row.status;await atomic(path.join(dir,'production-state.json'),state);throw error;}
  };
  const bindPlan=async()=>{
    // Audio extraction writes measured mouth curves into the plan. Replay
    // metadata must describe those exact curves, not the pre-audio version.
    delete plan.replay;
    const bound=canonicalizePlan(plan);plan=bound.plan;
    await atomic(path.join(dir,'plan.json'),plan);
    await atomic(path.join(dir,'story-ir.json'),bound.ir);
  };
  const finish=async()=>{state.status='completed';state.outputHash=planHash(plan);state.replayHash=plan.replay?.planHash;await atomic(path.join(dir,'production-state.json'),state);return{plan,credits};};
  for(let attempt=0;attempt<(bundled?1:2);attempt++){
    signal?.throwIfAborted();
    const sourceCanonical=canonicalizePlan(plan);
    const assetPipeline=compileAssetFactoryPipeline(sourceCanonical.ir,{providedAssets});
    plan=applyAssetFactoryOverrides(sourceCanonical.plan,assetPipeline);
    const canonical=canonicalizePlan(plan);
    const report=await stage('preflight',attempt+1,()=>assertRenderable(plan));report.storyReview=plan.review?.method||'not-reviewed';
    await atomic(path.join(dir,'story-ir.json'),canonical.ir);
    const {renderOverrides:_renderOverrides,...assetCoverage}=assetPipeline;
    assetCoverage.assets=assetCoverage.assets.map(({visualSpec:_visualSpec,...asset})=>asset);
    await atomic(path.join(dir,'asset-coverage.json'),assetCoverage);
    await atomic(path.join(dir,'quality-report.json'),report);
    await atomic(path.join(dir,'plan.json'),plan);
    const audioKey=createHash('sha256').update(JSON.stringify({version:1,replay:plan.replay?.planHash,bundled,liveDialogue,model:credentials.geminiModel||process.env.GEMINI_MODEL})).digest('hex');
    let resolved;
    // Restore measured curves before comparing the saved MP4's replay hash.
    // Otherwise a valid post-audio render never matches the original request.
    if(reuseExisting)try{
      const saved=JSON.parse(await readFile(path.join(dir,'audio-stage.json'),'utf8'));
      const bytes=await readFile(path.join(dir,'audio.wav'));
      if(saved.key===audioKey&&saved.sha256===createHash('sha256').update(bytes).digest('hex')&&verifyReplayPlan(saved.plan)){
        plan=saved.plan;resolved={audio:path.join(dir,'audio.wav'),credits:saved.credits};credits=saved.credits;
        await bindPlan();progress('Resuming verified Freesound audio and mouth animation',25);
      }
    }catch{}
    let reuse=false;
    if(reuseExisting&&attempt===0){try{
      const previous=JSON.parse(await readFile(path.join(dir,'render-report.json'),'utf8'));
      const reusable=previous.replayHash
        ? previous.replayHash===plan.replay?.planHash
        : previous.planHash===planHash(plan);
      if(reusable&&previous.quality===quality){await access(path.join(dir,'video.mp4'));credits=JSON.parse(await readFile(path.join(dir,'sound-credits.json'),'utf8'));reuse=true;}
      else progress('Rebuilding saved video to match the current plan',20);
    }catch{}}
    if(!reuse){
      if(!resolved)resolved=await stage('audio',attempt+1,()=>audioBuilder(plan,dir,credentials,signal,{bundled,liveDialogue,progress:m=>progress(m,25)}));credits=resolved.credits;
      await bindPlan();
      // Real builders save audio.wav. Test/injected builders may not produce a
      // file; only complete, hash-bound media can become a resumable stage.
      try{const bytes=await readFile(path.join(dir,'audio.wav'));await atomic(path.join(dir,'audio-stage.json'),{key:audioKey,sha256:createHash('sha256').update(bytes).digest('hex'),plan,credits});}catch(error){if(error.code!=='ENOENT')throw error;}
      if(!bundled&&plan.planningMode==='dynamic'&&quality==='full'){
        const previewDir=path.join(dir,`preview-${path.basename(dir)}-${attempt+1}`);
        await mkdir(previewDir,{recursive:true});
        await atomic(path.join(previewDir,'plan.json'),plan);
        progress('Rendering preview before full-quality export',35);
        let preview;
        try{
          await stage('preview-render',attempt+1,()=>renderer(plan,previewDir,resolved.audio,{signal,quality:'draft',progress:(message,p)=>progress('Preview: '+message,35+Math.round((p||0)*.25))}));
          preview=await stage('preview-review',attempt+1,()=>videoReviewer(previewDir,plan,credentials,signal));
          for(const file of ['video-observations.json','encoded-quality-report.json'])try{await atomic(path.join(dir,`preview-${attempt+1}-${file}`),await readFile(path.join(previewDir,file),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
        }finally{
          // Preview media is temporary. Persist review evidence above, but do
          // not leave nested MP4s or public audio outside normal job retention.
          if(path.dirname(path.resolve(previewDir))!==path.resolve(dir))throw Error('Preview cleanup must remain inside its job workspace.');
          await rm(previewDir,{recursive:true,force:true,maxRetries:3,retryDelay:50});
          await unlink(path.join(ROOT,'public',path.basename(previewDir)+'-audio.wav')).catch(error=>{if(error.code!=='ENOENT')throw error;});
        }
        await atomic(path.join(dir,`preview-review-attempt-${attempt+1}.json`),preview);
        if(!preview.passed){
          if(attempt===1){state.status='failed';await atomic(path.join(dir,'production-state.json'),state);throw Error('Preview still needs corrections after one audiovisual repair: '+(preview.issues.map(i=>`${i.time}s: ${i.problem}`).join('; ')||preview.summary));}
          plan=canonicalizePlan(await stage('preview-repair',attempt+1,()=>videoRepairer(plan,preview,credentials,signal,progress))).plan;
          continue;
        }
      }
      await stage('final-render',attempt+1,()=>renderer(plan,dir,resolved.audio,{signal,progress,quality}));
    }
    if(reuse)await stage('saved-media-check',attempt+1,async()=>atomic(path.join(dir,'encoded-quality-report.json'),await encodedInspector(path.join(dir,'video.mp4'),plan,{signal,scale:quality==='draft'?.5:1})));
    if(bundled)return finish();
    progress('Reviewing actual rendered video',97);
    const visual=await stage('final-review',attempt+1,()=>videoReviewer(dir,plan,credentials,signal));
    await atomic(path.join(dir,`video-review-attempt-${attempt+1}.json`),visual);
    if(visual.passed)return finish();
    if(attempt===1){state.status='failed';await atomic(path.join(dir,'production-state.json'),state);throw Error('Rendered video still needs corrections after one audiovisual repair: '+(visual.issues.map(i=>`${i.time}s: ${i.problem}`).join('; ')||visual.summary));}
    plan=canonicalizePlan(await stage('final-repair',attempt+1,()=>videoRepairer(plan,visual,credentials,signal,progress))).plan;
  }
}
