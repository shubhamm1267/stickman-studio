import {stripGeneratedPlacementIds} from '../shared/normalize-directed-scene.mjs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import {command} from './media.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {geminiJSON,reviewAndRepair} from './providers.mjs';
import {atomic} from './files.mjs';
import {SceneSchema,validatePlan} from '../shared/schema.mjs';
import {compileScene} from './scene-compile.mjs';
import {directSceneSounds} from './sound-director.mjs';
import {inspectPlan} from './inspect.mjs';

const ProblemSchema=z.object({time:z.number().min(0),problem:z.string().min(5),repair:z.string().min(5)}).strict();
const ObservationSchema=z.object({
  objects:z.array(z.object({description:z.string().min(5),identityCertain:z.boolean()}).strict()),
  events:z.array(z.object({id:z.string().min(1),time:z.number().min(0),action:z.string().min(8)}).strict()).min(1),
  audio:z.array(z.string().min(5)),problems:z.array(ProblemSchema),uncertainties:z.array(z.string().min(5)),
}).strict();
export const VideoReviewSchema=z.object({passed:z.boolean(),summary:z.string().min(10),issues:z.array(ProblemSchema),observedEvents:z.array(z.object({checkId:z.string(),event:z.string(),visible:z.boolean(),time:z.number().min(0),evidenceIds:z.array(z.string())}).strict())}).strict();
export async function reviewRenderedVideo(dir,plan,credentials,signal,fetcher=fetch){
  const video=await readFile(path.join(dir,'video.mp4'));
  const videoSha256=createHash('sha256').update(video).digest('hex');

  const seconds=plan.scenes?.reduce((n,s)=>n+s.duration,0)||10;
  const samplingFps=seconds<=30?12:seconds<=120?6:seconds<=300?3:1;
  // Keep this observation pass independent of every story/design claim.
  const observe=async(bytes)=>geminiJSON(`Observe only this attached animation and its audio. You have no script. Describe the concrete visible objects (shape, colour, features) and chronological physical actions with precise seconds and unique observation IDs. Mark identityCertain false when an object's identity is unclear; do not invent its function from its shape. Describe hand contacts, object ownership, visible component motion, facial changes, body motion and camera framing. A click sound does not prove that a mechanism moved. Do not infer a hidden transformation, a tiny part moving, or an unseen action from a reaction. Record ambiguities in uncertainties instead. Describe audible nonverbal sounds separately. Deliberate camera cuts and zooms between wide and contact shots are allowed; distinguish camera movement from actual object teleportation. Flag demonstrably broken contact, teleporting, inappropriate sound and confusing staging with concrete repairs. Sample brief movements carefully at the supplied video sampling rate.`,ObservationSchema,credentials,signal,fetcher,[{inlineData:{mimeType:'video/mp4',data:bytes.toString('base64')},videoMetadata:{fps:samplingFps}}]);
  let observations;
  if(video.length<=18*1024*1024)observations=await observe(video);
  else {
    const temp=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-review-'));
    observations={objects:[],events:[],audio:[],problems:[],uncertainties:[]};
    try{
      let offset=0,index=0;
      for(const scene of plan.scenes){
        for(let local=0;local<scene.duration;local+=10){
          const start=offset+local,length=Math.min(10,scene.duration-local),file=path.join(temp,`clip-${index}.mp4`);
          await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',path.join(dir,'video.mp4'),'-ss',String(start),'-t',String(length),'-vf','scale=1280:720:force_original_aspect_ratio=decrease','-c:v','libx264','-crf','23','-maxrate','8M','-bufsize','16M','-c:a','aac','-b:a','128k',file],{signal});
          const bytes=await readFile(file);
          if(bytes.length>18*1024*1024)throw Error('Review clip exceeds size limit; no observation skipped.');
          const clip=await observe(bytes);
          if(clip.events.some(e=>e.time>length+.2)||new Set(clip.events.map(e=>e.id)).size!==clip.events.length)throw Error('Invalid clip observation timestamps or duplicate IDs.');
          observations.objects.push(...clip.objects);
          observations.events.push(...clip.events.map(e=>({...e,id:`clip${index}_${e.id}`,time:start+e.time})));
          observations.problems.push(...clip.problems.map(e=>({...e,time:start+e.time})));
          observations.audio.push(...clip.audio.map(e=>`${start.toFixed(3)}s: ${e}`));
          observations.uncertainties.push(...clip.uncertainties.map(e=>`${start.toFixed(3)}s: ${e}`));index++;
        }
        offset+=scene.duration;
      }
    }finally{await rm(temp,{recursive:true,force:true});}
  }
  const ids=new Set();
  for(const event of observations.events){if(ids.has(event.id)||event.time>seconds+.2)throw Error('Video observation returned duplicate IDs or an invalid timestamp.');ids.add(event.id);}
  await atomic(path.join(dir,'video-observations.json'),{...observations,samplingFps,videoSha256});
  const checks=[{id:'story',description:plan.story},...(plan.coverage||[]).map((e,i)=>({id:'coverage-'+i,description:e.storyEvent})),...(plan.requirements||[]).map((e,i)=>({id:'requirement-'+i,description:e.description}))];
  const report=await geminiJSON(`Compare the required story checks with an INDEPENDENT BLIND OBSERVATION of the encoded MP4. The observer did NOT see the story. Use ONLY those observations as evidence; the story, coverage and designs are claims, never observations. Return one observedEvents row for EVERY check ID exactly once. A visible:true row MUST cite real evidenceIds proving ALL physical details of that check, not merely a similar reaction or nearby motion. Missing or ambiguous plot-critical details mean visible:false. A rigid object moving cannot prove one of its parts retracting or growing. A sound cannot prove a visual action. Unknown object identity cannot prove a specifically designed story object. Never invent a visible detail absent from the independent observations. Include every material observation problem in issues. passed requires all checks supported, no material issues, and an understandable visual payoff. Preserve exact check IDs. Original request: ${plan.sourceIdea||plan.story}. CHECKS: ${JSON.stringify(checks)}. BLIND OBSERVATIONS: ${JSON.stringify(observations)}.`,VideoReviewSchema,credentials,signal,fetcher);
  const expected=new Set(checks.map(c=>c.id)),seen=new Set();
  for(const event of report.observedEvents){
    if(!expected.has(event.checkId)||seen.has(event.checkId))report.issues.push({time:event.time,problem:'Missing, duplicate or unknown story check: '+event.checkId,repair:'Review each required check exactly once.'});
    seen.add(event.checkId);
    if(event.time>seconds+.2||event.visible&&(!event.evidenceIds.length||event.evidenceIds.some(id=>!ids.has(id)))){event.visible=false;report.issues.push({time:Math.min(event.time,seconds),problem:'Claimed visible action lacks valid independent evidence: '+event.event,repair:'Implement and visibly show the required action.'});}
  }
  for(const check of checks)if(!seen.has(check.id))report.issues.push({time:0,problem:'Required check was omitted: '+check.description,repair:'Review and implement the complete story.'});
  report.issues.push(...observations.problems);
  report.videoSha256=videoSha256;report.samplingFps=samplingFps;report.method='blind-observation-then-story-comparison';
  report.passed=report.passed&&!report.issues.length&&report.observedEvents.length>0&&report.observedEvents.every(e=>e.visible);
  await atomic(path.join(dir,'video-review.json'),{...report,model:credentials.geminiModel||process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',limits:'Two-stage model review reduces story anchoring but can still miss visual errors; a pass is not a guarantee.'});
  return report;
}

export async function repairRenderedPlan(input,report,credentials,signal,progress=()=>{}){
  if(input.planningMode==='dynamic')return (await import('./dynamic-director.mjs')).reviewDynamicPlan(input,credentials,signal,progress,fetch,report);
  if(input.directionScore)return (await import('./semantic-director.mjs')).repairSemanticPlan(input,report,credentials,signal,progress);
  const plan=structuredClone(input);delete plan.review;
  plan.coverage=plan.coverage.map(({beatIndices,...event})=>event);
  if(plan.hook)plan.hook.beatIndices=[];
  const guide=await readFile(new URL('../prompts/action-reference.md',import.meta.url),'utf8');
  let offset=0;
  for(let i=0;i<plan.scenes.length;i++){
    const scene=plan.scenes[i],end=offset+scene.duration;
    const issues=report.issues.filter(e=>e.time>=offset&&e.time<=end);
    if(!report.passed&&!report.issues.length&&!report.observedEvents.some(e=>!e.visible))issues.push({time:offset,problem:report.summary,repair:'Correct the audiovisual review failure while preserving the story.'});
    const missing=report.observedEvents.filter(e=>!e.visible&&e.time>=offset&&e.time<=end);
    if(issues.length||missing.length){
      progress('Repairing actual-video failures in '+scene.id,8);
      let error='',previous;
      for(let attempt=0;attempt<3;attempt++){
      try{
      const fixed=await geminiJSON(`Repair the animation JSON using observations of the ACTUAL rendered MP4. These are real visual/audio failures, even if earlier plan review approved them. ${guide} Keep id and duration and preserve all story events. Local issue time = global time minus ${offset}. Actual video report: ${JSON.stringify({summary:report.summary,issues,missing})}. Complete story bible: ${JSON.stringify(plan)}. Scene to repair: ${JSON.stringify(scene)}. Implement moving objects with real free motions while detached, or pick/place/throw/attachment; react intent does NOT move any object. Do not play a squeak during an attempt explicitly described as silent. Show wind, proper contact, readable anticipation and the real ending. Head attachment offsets are relative to the head bone, e.g.[0,-70], not root coordinates. Shots must show the event. Each actor and each prop design occurs ONCE in cast/props; use motion tracks and attachment events for changes over time. Every custom beat needs pose. Previous invalid repair: ${JSON.stringify(previous)}. Fix these validation errors: ${error}. Return corrected Scene JSON.`,SceneSchema,credentials,signal);
      if(fixed.id!==scene.id||Math.abs(fixed.duration-scene.duration)>.01)throw Error('Video repair changed scene ID or duration.');
      previous=directSceneSounds(compileScene(stripGeneratedPlacementIds(fixed)));
      const candidate={...plan,scenes:plan.scenes.map((s,j)=>j===i?previous:s)};
      const validated=validatePlan(candidate),geometry=inspectPlan(validated);
      if(!geometry.ok)throw Error(JSON.stringify(geometry.issues.filter(x=>x.severity==='error')));
      plan.scenes[i]=validated.scenes[i];break;
      }catch(e){if(signal?.aborted||/Provider HTTP/.test(e.message))throw e;error=e.message;previous=e.generatedValue||previous;if(attempt===2)throw Error('Video repair failed validation: '+error);progress('Correcting video repair JSON, attempt '+(attempt+2)+'/3',10);}
      }
    }
    offset=end;
  }
  // Coverage indices from the previous render are stale after a scene edit.
  plan.coverage=plan.coverage.map(({beatIndices,...event})=>event);
  if(plan.hook)plan.hook.beatIndices=[];
  return reviewAndRepair(validatePlan(plan),credentials,signal,progress);
}
