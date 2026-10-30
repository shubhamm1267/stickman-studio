import {validateVoiceCast} from "../shared/voice-cast.mjs";
import { expandIndexedCues } from "./timing.mjs";
import { timeline, sceneFrameTime } from "../shared/timeline.mjs";
import { spawn } from "node:child_process";
import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  stat,
  open,
} from "node:fs/promises";
import path from "node:path";
import { ROOT, DATA, json, atomic } from "./files.mjs";
import { searchSound, cartesiaBytes, request } from "./providers.mjs";
import {createHash} from 'node:crypto';
import {reviewSoundForCue,resolveSoundWithFallback,planSoundFallback} from './sfx-review.mjs';
export function command(exe, args, { signal, binary=false, ...options } = {}) {
  return new Promise((resolve, reject) => {
    let p = spawn(exe, args, {
        ...options,
        signal,
        stdio: ["ignore", "pipe", "pipe"],
      }),
      out = "", chunks=[],
      err = "";
    p.stdout.on("data", (d) => binary ? chunks.push(d) : (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-10000)));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(binary?Buffer.concat(chunks):out)
        : reject(Error(`${exe} exited ${code}: ${err.slice(-1800)}`)),
    );
  });
}
export async function probe(file) {
  return JSON.parse(
    await command(process.env.FFPROBE_PATH || "ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
}
export function assertSfxLicense(plan,item){if(plan.productionMode==="silent-sfx" && !String(item.license).includes("/publicdomain/zero/"))throw Error("Silent SFX mode permits CC0 effects only; no speech fixture.");}
export async function buildAudio(
  plan,
  dir,
  keys,
  signal,
  { bundled = false, liveDialogue=false, progress = () => {} } = {},
) {
  if(!bundled||liveDialogue)validateVoiceCast(plan,keys);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(DATA, "sound-cache"), { recursive: true });
  const frameClock=timeline(plan),outputDuration=frameClock.durationInFrames/frameClock.fps;
  let manifest = await json(path.join(ROOT, "assets/sfx/manifest.json")),
    inputs = [],
    credits = [],warnings=[],selections=[];
  for (let [si, s] of plan.scenes.entries()) {
    const range=frameClock.scenes[si],sceneStart=range.from/frameClock.fps,
      sceneEnd=(range.from+range.durationInFrames)/frameClock.fps;
    for (let {cue,index:cueIndex} of expandIndexedCues(s, plan.propDesigns)) {
      signal?.throwIfAborted();
      let item, file,reviewedStart;
      try {
      if (bundled && cue.fixture && manifest.some(x=>x.name===cue.fixture)) {
        item = manifest.find((x) => x.name === cue.fixture);
        if (!item) throw Error("Bundled sound missing: " + cue.fixture);
        file = path.join(ROOT, "assets/sfx", item.file);
      } else {
        progress("Finding sound: " + cue.query);
        const search=selection=>searchSound(selection.queryOverride||cue.query, keys.freesound, signal,fetch,{duration:cue.duration,role:cue.role,seed:path.basename(dir)+':'+(cue.actorId||'effect')+':'+(selection.queryOverride||cue.query),...selection});
        const load=async item=>{
        const file = path.join(DATA, "sound-cache", `${item.id}.mp3`);
        try {
          await stat(file);
        } catch {
          let url = item.previews["preview-hq-mp3"];
          let u = new URL(url);
          if (u.protocol !== "https:" || u.hostname !== "cdn.freesound.org")
            throw Error("Untrusted sound preview URL");
          let r = await request(url, { signal, timeout: 60000 });
          let b = Buffer.from(await r.arrayBuffer());
          if (b.length > 20 * 1024 * 1024)
            throw Error("Sound preview too large");
          await writeFile(file, b);
        }
        return {file,duration:Number((await probe(file)).format.duration)};
        };
        if(plan.planningMode==='dynamic'&&keys.gemini){
          const reviewDir=path.join(DATA,'sound-reviews');await mkdir(reviewDir,{recursive:true});
          const review=async(loaded,spec)=>{
            const bytes=await readFile(loaded.file);
            const key=createHash('sha256').update(bytes).update(JSON.stringify({version:3,...spec,rate:cue.playbackRate||1,trimSilence:cue.trimSilence!==false,model:keys.geminiModel||process.env.GEMINI_MODEL})).digest('hex');
            const saved=path.join(reviewDir,key+'.json');
            try{const cached=await json(saved);if(cached.version===3&&cached.verdict)return cached.verdict;}catch{}
            const renderSlice=start=>command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',loaded.file,'-af',`atrim=start=${start},${cue.trimSilence!==false?'silenceremove=start_periods=1:start_duration=0.005:start_threshold=-40dB:start_silence=0.005,':''}atrim=duration=${cue.duration},asetpts=PTS-STARTPTS,aresample=48000,asetrate=${48000*(cue.playbackRate||1)},aresample=48000,apad,atrim=duration=${cue.duration}`,'-ac','1','-f','mp3','pipe:1'],{signal,binary:true});
            const verdict=await reviewSoundForCue(bytes,spec,keys,signal,fetch,renderSlice);
            await atomic(saved,{version:3,verdict});return verdict;
          };
          const resolved=await resolveSoundWithFallback({query:cue.query,role:cue.role,duration:cue.duration,sourceStart:cue.sourceStart||0,signal,search,load,review,progress,maxAttempts:6},reports=>planSoundFallback({query:cue.query,role:cue.role,story:plan.sourceIdea||plan.story,scene:s.summary,intents:s.beats.filter(b=>b.start<=cue.start+cue.duration&&b.start+b.duration>=cue.start).map(b=>b.intent),reports},keys,signal));
          item=resolved.item;file=resolved.file;reviewedStart=resolved.sourceStart;
          await atomic(path.join(dir,`sound-review-${si}-${cueIndex}.json`),{query:cue.query,selectedQuery:resolved.selectedQuery||cue.query,substitutionReason:resolved.substitutionReason,sourceStart:reviewedStart,reports:resolved.reports});
        }else{item=await search({});file=(await load(item)).file;}
      }
      }catch(error){
        if(error.soundReviews)await atomic(path.join(dir,`sound-review-${si}-${cueIndex}.json`),{query:cue.query,reports:error.soundReviews,accepted:false});
        if(signal?.aborted||cue.required!==false||!/No (?:CC0 Freesound match|acoustically matching CC0 Freesound recording)/.test(error.message))throw error;
        warnings.push({sceneId:s.id,query:cue.query,reason:'No matching CC0 recording'});progress('Optional sound unavailable: '+cue.query);continue;
      }
      assertSfxLicense(plan,item);
      let prepared=false;
      if(cue.actorId && cue.role==='nonverbal'){
        const processed=path.join(dir,`vocal-${si}-${cueIndex}.wav`);
        await command(process.env.FFMPEG_PATH||'ffmpeg',['-y','-v','error','-i',file,'-af',`atrim=start=${reviewedStart??cue.sourceStart??0},${cue.trimSilence!==false?'silenceremove=start_periods=1:start_threshold=-40dB,':''}asetpts=PTS-STARTPTS,aresample=48000,asetrate=${48000*(cue.playbackRate||1)},aresample=48000,apad,atrim=duration=${cue.duration}`,'-ac','1',processed],{signal});
        file=processed;prepared=true;s.sounds[cueIndex].mouthCues=await audioEnvelope(file,signal);
      }
      const cueStart=sceneFrameTime(plan,si,cue.start),
        cueDuration=Math.min(cue.duration,Math.max(0,sceneEnd-cueStart));
      if(cueDuration<=0)continue;
      selections.push({sceneId:s.id,cueIndex,query:cue.query,role:cue.role||'effect',actorId:cue.actorId,
        source:bundled&&cue.fixture?'bundled-freesound':'live-freesound',id:item.id,page:item.url||item.page,license:item.license,
        sourceStart:reviewedStart??cue.sourceStart??0,start:cueStart,duration:cueDuration,playbackRate:cue.playbackRate||1,volume:cue.volume,trimSilence:cue.trimSilence!==false});
      inputs.push({
        file,
        start: cueStart,
        duration: cueDuration,
        volume: cue.volume,
        playbackRate:prepared?1:cue.playbackRate||1,
        sourceStart: prepared?0:reviewedStart??cue.sourceStart??0,
        pan: cue.pan || 0,
        trimSilence: prepared?false:cue.trimSilence !== false,
      });
      credits.push(...(item.additionalSources||[]));
      credits.push({
        id: item.id,
        name: item.name,
        author: item.username || item.author,
        page: item.url || item.page,
        license: item.license,
      });
    }
    let lastSpokenEnd=0;
    for (let [vi, v] of [...s.dialogue].sort((a,b)=>a.start-b.start).entries()) {
      const voiceStart=sceneFrameTime(plan,si,v.start),voiceLocalStart=voiceStart-sceneStart;
      const actor = plan.characters.find((a) => a.id === v.actorId);
      let voiceId = keys.voices?.[v.actorId] || actor.voiceId;
      let file;
      if(bundled && v.fixture && !liveDialogue){
        const item=manifest.find(x=>x.name===v.fixture);
        if(!item)throw Error("Bundled voice missing: "+v.fixture);
        file=path.join(ROOT,"assets/sfx",item.file);
        credits.push({id:item.id,name:item.name,author:item.username||item.author,page:item.url||item.page,license:item.license});
      }else{
        let b=await cartesiaBytes(v.text,voiceId,keys,plan.language,signal);
        file=path.join(dir,`voice-${si}-${vi}.wav`);await writeFile(file,b);
        credits.push({id:"cartesia-"+actor.id,name:"Cartesia dialogue: "+actor.name,author:"Cartesia; original script",page:"https://cartesia.ai/",license:"Generated speech; Cartesia account terms apply. Not CC0."});
      }
      let info = await probe(file),
        duration = +info.format.duration;
      if (duration > sceneEnd - voiceStart + 0.01)
        throw Error(
          `Voice for ${actor.name} does not fit the scene. Shorten the line or extend the scene.`,
        );
      if(v.start<lastSpokenEnd-.02 && !v.allowOverlap)throw Error("Dialogue lines overlap after voice generation. Shorten the lines, move the next line, or explicitly allow an interruption.");
      lastSpokenEnd=Math.max(lastSpokenEnd,v.start+duration);
      v.audioDuration = duration;
      v.mouthCues=await audioEnvelope(file,signal);
      inputs.push({
        file,
        start: voiceStart,
        duration,
        volume: 0.8,
        voice: true,
      });
    }
  }
  let args = [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=48000:cl=stereo:d=${outputDuration}`,
  ];
  for (let i of inputs) args.push("-i", i.file);
  let filters = [];
  for (let [j, i] of inputs.entries())
    filters.push(
      `[${j + 1}:a]atrim=start=${i.sourceStart || 0},${i.trimSilence ? "silenceremove=start_periods=1:start_duration=0.005:start_threshold=-40dB:start_silence=0.005," : ""}atrim=duration=${i.duration},asetpts=PTS-STARTPTS,aresample=48000,asetrate=${48000*(i.playbackRate||1)},aresample=48000,apad,atrim=duration=${i.duration},aformat=channel_layouts=stereo,pan=stereo|c0=${i.pan > 0 ? 1 - i.pan : 1}*c0|c1=${i.pan < 0 ? 1 + i.pan : 1}*c1,afade=t=in:d=0.008,afade=t=out:st=${Math.max(0, i.duration - 0.04)}:d=0.04,volume=${i.volume},adelay=${Math.round(i.start * 1000)}:all=1[a${j}]`,
    );
  let refs = inputs.map((_, j) => `[a${j}]`).join("");
  filters.push(
    `[0:a]${refs}amix=inputs=${inputs.length + 1}:normalize=0:duration=longest,loudnorm=I=-17:TP=-1.5:LRA=11,atrim=duration=${outputDuration}[out]`,
  );
  let output = path.join(dir, "audio.wav");
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-ar",
    "48000",
    output,
  );
  await command(process.env.FFMPEG_PATH || "ffmpeg", args, { signal });
  let h = await open(output, "r+");
  await h.sync();
  await h.close();
  credits = [...new Map(credits.map((c) => [c.id || c.page, c])).values()];
  await atomic(path.join(dir, "sound-credits.json"), credits);
  await atomic(path.join(dir,"sound-warnings.json"),warnings);
  await atomic(path.join(dir,'sound-selection.json'),selections);
  return { audio: output, credits, warnings };
}

export async function audioEnvelope(file,signal){const raw=await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',file,'-ac','1','-ar','8000','-f','f32le','-'],{signal,binary:true});const rms=[];for(let j=0;j<raw.length;j+=1600){let sum=0,n=0;for(let k=j;k+4<=Math.min(j+1600,raw.length);k+=4){const v=raw.readFloatLE(k);sum+=v*v;n++;}rms.push(Math.sqrt(sum/Math.max(1,n)));}const peak=Math.max(.025,...rms);return rms.map((v,i)=>({time:+(i*.05).toFixed(2),open:v<.008?0:Math.min(1,Math.sqrt(v/peak))}));}
