import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {audioEnvelope,buildAudio,probe} from '../server/media.mjs';

const plan=canonicalizePlan(JSON.parse(await readFile(new URL('../examples/superhero-return.json',import.meta.url),'utf8'))).plan;
plan.renderFps=60;
const dir=await mkdtemp(path.join(os.tmpdir(),'point5-audio-clock-'));
try{
 const built=await buildAudio(plan,dir,{},undefined,{bundled:true});
 const info=await probe(built.audio),envelope=await audioEnvelope(built.audio);
 const audio=info.streams.find(stream=>stream.codec_type==='audio');
 const cues=plan.scenes.reduce((count,scene)=>count+scene.sounds.length,0);
 if(!audio||Math.abs(Number(audio.duration)-16.5)>.06||Math.max(...envelope.map(x=>x.open))<=0)
  throw Error('Frame-aligned sound mix verification failed.');
 console.log(`PASS offline bundled audio clock: cues=${cues}, duration=${audio.duration}s, sampleFrames=${envelope.length}, nonzeroAudio=true.`);
}finally{await rm(dir,{recursive:true,force:true});}
