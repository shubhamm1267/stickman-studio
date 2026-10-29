import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {atomic} from './files.mjs';
import {assertRenderable,planHash} from './inspect.mjs';
import {buildAudio} from './media.mjs';
import {renderFilm} from './render.mjs';
import {reviewRenderedVideo,repairRenderedPlan} from './video-review.mjs';
import {inspectEncoded} from './encoded-quality.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {verifyReplayPlan} from '../shared/schema.mjs';
import {applyAssetFactoryOverrides,compileAssetFactoryPipeline} from './asset-factory.mjs';

export async function produceFilm(input,dir,credentials,{signal,progress=()=>{},quality='full',bundled=false,liveDialogue=false,reuseExisting=false,providedAssets={},audioBuilder=buildAudio,renderer=renderFilm,videoReviewer=reviewRenderedVideo,videoRepairer=repairRenderedPlan}={}){
  if(input?.replay&&!verifyReplayPlan(input))throw Error('Saved replay metadata does not match the plan contents.');
  let {plan}=canonicalizePlan(input),credits=[];
  for(let attempt=0;attempt<(bundled?1:2);attempt++){
    signal?.throwIfAborted();
    const sourceCanonical=canonicalizePlan(plan);
    const assetPipeline=compileAssetFactoryPipeline(sourceCanonical.ir,{providedAssets});
    plan=applyAssetFactoryOverrides(sourceCanonical.plan,assetPipeline);
    const canonical=canonicalizePlan(plan);
    const report=assertRenderable(plan);report.storyReview=plan.review?.method||'not-reviewed';
    await atomic(path.join(dir,'story-ir.json'),canonical.ir);
    const {renderOverrides:_renderOverrides,...assetCoverage}=assetPipeline;
    assetCoverage.assets=assetCoverage.assets.map(({visualSpec:_visualSpec,...asset})=>asset);
    await atomic(path.join(dir,'asset-coverage.json'),assetCoverage);
    await atomic(path.join(dir,'quality-report.json'),report);
    await atomic(path.join(dir,'plan.json'),plan);
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
      const resolved=await audioBuilder(plan,dir,credentials,signal,{bundled,liveDialogue,progress:m=>progress(m,25)});credits=resolved.credits;
      await atomic(path.join(dir,'plan.json'),plan);
      await renderer(plan,dir,resolved.audio,{signal,progress,quality});
    }
    if(reuse)await atomic(path.join(dir,'encoded-quality-report.json'),await inspectEncoded(path.join(dir,'video.mp4'),plan,{signal,scale:quality==='draft'?.5:1}));
    if(bundled)return{plan,credits};
    progress('Reviewing actual rendered video',97);
    const visual=await videoReviewer(dir,plan,credentials,signal);
    await atomic(path.join(dir,`video-review-attempt-${attempt+1}.json`),visual);
    if(visual.passed)return{plan,credits};
    if(attempt===1)throw Error('Rendered video still needs corrections after one audiovisual repair: '+(visual.issues.map(i=>`${i.time}s: ${i.problem}`).join('; ')||visual.summary));
    plan=canonicalizePlan(await videoRepairer(plan,visual,credentials,signal,progress)).plan;
  }
}
