import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {command} from '../server/media.mjs';
import {inspectEncoded} from '../server/encoded-quality.mjs';

test('encoded QA accepts motion and sound, rejects blank, silent and wrong-FPS exports',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'sticklaugh-encoded-'));
  const plan={format:'shorts',renderFps:60,scenes:[{duration:1,sounds:[{}],dialogue:[]}]};
  const file=path.join(dir,'video.mp4');
  async function make(video,audio){await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',video,'-f','lavfi','-i',audio,'-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-af','volume=.1',file]);}
  try {
    await make('testsrc2=size=108x192:rate=60','sine=frequency=440:sample_rate=48000');
    const report=await inspectEncoded(file,plan,{scale:.1});assert.equal(report.frames,60);assert.ok(report.changedPairs>0);assert.equal(report.clippedSamples,0);
    await assert.rejects(()=>inspectEncoded(file,{...plan,renderFps:120},{scale:.1}),/FPS or frame count/);
    await make('color=white:size=108x192:rate=60','sine=frequency=440:sample_rate=48000');
    await assert.rejects(()=>inspectEncoded(file,plan,{scale:.1}),/blank or nearly uniform/);
    await make('color=gray:size=108x192:rate=60,drawbox=x=20:y=20:w=60:h=140:color=white:t=fill','sine=frequency=440:sample_rate=48000');
    await assert.rejects(()=>inspectEncoded(file,plan,{scale:.1}),/entire video is static/);
    await make('testsrc2=size=108x192:rate=60','anullsrc=r=48000:cl=mono');
    await assert.rejects(()=>inspectEncoded(file,plan,{scale:.1}),/expected sounds are silent/);
    await make('testsrc2=size=108x192:rate=120','sine=frequency=440:sample_rate=48000');
    const high=await inspectEncoded(file,{...plan,renderFps:120},{scale:.1});assert.equal(high.frames,120);assert.equal(high.fps,120);
  } finally {await rm(dir,{recursive:true,force:true});}
});
