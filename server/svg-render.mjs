import {Resvg} from '@resvg/resvg-js';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {svgFrameAtFrame} from '../renderer/engine.mjs';
import {timeline} from '../shared/timeline.mjs';
import {atomic} from './files.mjs';
import {inspectEncoded} from './encoded-quality.mjs';
import {planHash} from './inspect.mjs';

// Explicit browserless backend. A memory-bounded child streams raw RGBA;
// drawing and validation use exactly the same production frame evaluator.
export async function renderSvgFilm(plan,dir,audio,{signal,progress=()=>{},quality='full'}={}){
 await mkdir(dir,{recursive:true});
 const clock=timeline(plan),scale=quality==='draft'?.5:1,width=Math.round((plan.format==='landscape'?1920:1080)*scale),height=Math.round((plan.format==='shorts'?1920:1080)*scale);
 const output=path.join(dir,'video.mp4'),planFile=path.join(dir,'plan.json');await atomic(planFile,plan);
 const ff=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-y','-v','error','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(clock.fps),'-i','pipe:0','-i',audio,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',String(clock.durationInFrames/clock.fps),'-movflags','+faststart',output],{signal,stdio:['pipe','ignore','pipe']});
 const worker=spawn(process.execPath,['--expose-gc',fileURLToPath(new URL('./svg-worker.mjs',import.meta.url)),planFile,String(width)],{signal,stdio:['ignore','pipe','pipe']});
 let encoderError='',workerError='',buffer='';ff.stderr.on('data',d=>encoderError=(encoderError+d).slice(-2000));
 worker.stderr.on('data',d=>{buffer+=d;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const p=JSON.parse(line);progress('Rasterizing SVG animation',55+Math.floor(37*p.frame/p.total));}catch{workerError=(workerError+line).slice(-2000);}}});
 const wait=process=>new Promise((resolve,reject)=>{process.once('error',reject);process.once('close',code=>code===0?resolve():reject(Error('SVG render child failed: '+(workerError||buffer||encoderError))));});
 const encoded=wait(ff),drawn=wait(worker);encoded.catch(()=>{});drawn.catch(()=>{});ff.stdin.on('error',()=>{});worker.stdout.pipe(ff.stdin);
 try{
  await Promise.all([encoded,drawn]);
  const report=await inspectEncoded(output,plan,{signal,scale});
  await atomic(path.join(dir,'encoded-quality-report.json'),report);
  await writeFile(path.join(dir,'thumbnail.png'),new Resvg(svgFrameAtFrame(plan,Math.floor(clock.durationInFrames*.7)),{fitTo:{mode:'width',value:width}}).render().asPng());
  await atomic(path.join(dir,'render-report.json'),{engine:'resvg + ffmpeg',...report,quality,planHash:planHash(plan),replayHash:plan.replay?.planHash||null,limits:'SVG backend; Chromium filter and font parity not established.'});return output;
 }catch(error){worker.kill();ff.stdin.destroy();ff.kill();await Promise.allSettled([encoded,drawn]);throw error;}
}
