import {command, probe} from './media.mjs';
import {durationOf} from '../shared/schema.mjs';

// Check the encoded MP4, independently of the director's plan review.
export async function inspectEncoded(file, plan, {signal, scale=1}={}) {
  const info=await probe(file), video=info.streams.find(s=>s.codec_type==='video'), audio=info.streams.find(s=>s.codec_type==='audio');
  const fps=plan.renderFps||30, seconds=durationOf(plan), frames=Math.round(seconds*fps);
  const width=Math.round((plan.format==='landscape'?1920:1080)*scale), height=Math.round((plan.format==='shorts'?1920:1080)*scale);
  if(!video||!audio)throw Error('Encoded QA: video and audio streams are required.');
  const [n,d]=video.avg_frame_rate.split('/').map(Number);
  if(video.width!==width||video.height!==height||Math.abs(n/d-fps)>.001||Number(video.nb_frames)!==frames)throw Error('Encoded QA: incorrect dimensions, FPS or frame count.');
  if(Math.abs(Number(video.duration)-seconds)>.2||Math.abs(Number(audio.duration)-seconds)>.2)throw Error('Encoded QA: audio/video duration mismatch.');
  await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-'],{signal});
  const pcm=await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',file,'-map','0:a:0','-f','f32le','-'],{signal,binary:true});
  let peak=0,clippedSamples=0;
  for(let i=0;i+4<=pcm.length;i+=4){const value=Math.abs(pcm.readFloatLE(i));if(!Number.isFinite(value))throw Error('Encoded QA: nonfinite audio.');peak=Math.max(peak,value);if(value>=.999)clippedSamples++;}
  if(clippedSamples)throw Error(`Encoded QA: ${clippedSamples} clipped audio samples.`);
  if(plan.scenes.some(s=>s.sounds.length||s.dialogue.length)&&peak<.001)throw Error('Encoded QA: expected sounds are silent.');
  const pixels=await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',file,'-an','-vf','scale=54:96','-pix_fmt','gray','-f','rawvideo','-'],{signal,binary:true});
  const size=54*96;
  if(pixels.length!==frames*size)throw Error('Encoded QA: decoded frame count mismatch.');
  let minFrameStdDev=Infinity,changedPairs=0,changedWindowPairs=0;
  for(let at=0;at<pixels.length;at+=size){let sum=0,squared=0,delta=0;for(let i=0;i<size;i++){const v=pixels[at+i];sum+=v;squared+=v*v;if(at)delta+=Math.abs(v-pixels[at-size+i]);}minFrameStdDev=Math.min(minFrameStdDev,Math.sqrt(Math.max(0,squared/size-(sum/size)**2)));if(at&&delta/size>.15)changedPairs++;}
  // Slow, small articulated parts can be below an adjacent-frame threshold at
  // 60/120 fps. Also compare a quarter-second baseline; static films still fail.
  const stride=Math.max(1,Math.round(fps/4))*size;
  for(let at=stride;at<pixels.length;at+=size){let delta=0;for(let i=0;i<size;i++)delta+=Math.abs(pixels[at+i]-pixels[at-stride+i]);if(delta/size>.15)changedWindowPairs++;}
  if(minFrameStdDev<2)throw Error('Encoded QA: blank or nearly uniform frame detected.');
  if(frames>1&&!changedPairs&&!changedWindowPairs)throw Error('Encoded QA: the entire video is static.');
  return {ok:true,fullDecode:true,frames,fps,width,height,duration:seconds,clippedSamples,audioPeak:peak,minFrameStdDev,changedPairs,changedWindowPairs,limits:'Technical checks do not prove comedy quality, arbitrary story fidelity or perceptual sound suitability.'};
}
