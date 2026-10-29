import { findBrowser } from "./browser.mjs";
import path from "node:path";
import os from "node:os";
import { mkdir, copyFile, writeFile, stat, open, rename } from "node:fs/promises";
import { ROOT, atomic } from "./files.mjs";
import { probe,command } from "./media.mjs";
import { durationOf } from "../shared/schema.mjs";
import {inspectEncoded} from './encoded-quality.mjs';
import {planHash} from './inspect.mjs';
let bundled;
export async function renderFilm(
  plan,
  dir,
  audio,
  { signal, progress = () => {}, quality = "full" } = {},
) {
  if(process.env.RENDER_ENGINE==='resvg')return (await import('./svg-render.mjs')).renderSvgFilm(plan,dir,audio,{signal,progress,quality});
  // Some hosted containers prohibit network interface enumeration; Chromium uses loopback.
  try {
    os.networkInterfaces();
  } catch {
    os.networkInterfaces = () => ({
      lo: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          internal: true,
          cidr: "127.0.0.1/8",
          mac: "00:00:00:00:00:00",
        },
      ],
    });
  }
  const { bundle } = await import("@remotion/bundler"),
    { selectComposition, renderMedia, renderStill, makeCancelSignal } =
      await import("@remotion/renderer");
  await mkdir(path.join(ROOT, "public"), { recursive: true });
  let name = path.basename(dir) + "-audio.wav";
  await copyFile(audio, path.join(ROOT, "public", name));

  // Re-bundle per job to include its unique audio and avoid cross-job static-file races.
  let serveUrl = await bundle({
    entryPoint: path.join(ROOT, "renderer/index.tsx"),
    publicDir: path.join(ROOT, "public"),
  });
  let props = { plan, audioFile: name },
    browserExecutable = await findBrowser();
  let common = {
    serveUrl,
    inputProps: props,
    logLevel: "error",
    chromiumOptions: { gl: process.env.RENDER_GL || (process.platform==='win32'?'angle':'swangle') },
    ...(browserExecutable ? {chromeMode: /headless[-_]shell/i.test(browserExecutable) ? 'headless-shell' : 'chrome-for-testing'} : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
  };
  let composition = await selectComposition({ ...common, id: "StoryFilm" });
  let { cancelSignal, cancel } = makeCancelSignal();
  let listener = () => cancel();
  signal?.addEventListener("abort", listener, { once: true });
  let output = path.join(dir, "video.mp4");
  let lastProgress = -1;
  let stallTimer,stalled=false,lastRawProgress=-1;
  const resetStallTimer=()=>{clearTimeout(stallTimer);stallTimer=setTimeout(()=>{stalled=true;cancel();},120000);stallTimer.unref();};
  try {
    signal?.throwIfAborted();
    resetStallTimer();
    await renderMedia({
      ...common,
      composition,
      codec: "h264",
      crf: 18,
      audioCodec: "aac",
      audioBitrate: "192k",
      concurrency: Math.max(
        1,
        Math.min(4, Number(process.env.RENDER_CONCURRENCY) || 2),
      ),
      outputLocation: output,
      cancelSignal,
      scale: quality === "draft" ? 0.5 : 1,
      onProgress: (p) => {
        if(p.progress!==lastRawProgress){lastRawProgress=p.progress;resetStallTimer();}
        let value = 55 + Math.round(p.progress * 37);
        if (value !== lastProgress) {
          lastProgress = value;
          progress("Rendering animation", value);
        }
      },
    });
    clearTimeout(stallTimer);
    await normalizeFilmTiming(plan,dir,signal);
    progress('Checking encoded video and audio',93);
    await atomic(path.join(dir,'encoded-quality-report.json'),await inspectEncoded(output,plan,{signal,scale:quality==='draft'?.5:1}));
    let thumbProps = { ...props, thumbnail: true };
    let tc = await selectComposition({
      ...common,
      inputProps: thumbProps,
      id: "StoryFilm",
    });
    let coverFrame = Math.min(
      composition.durationInFrames - 1,
      Math.round(durationOf(plan) * 0.7 * composition.fps),
    );
    await renderStill({
      ...common,
      inputProps: thumbProps,
      composition: tc,
      frame: coverFrame,
      output: path.join(dir, "thumbnail.png"),
    });
    const handle = await open(output, "r+");
    await handle.sync();
    await handle.close();
    const info = await probe(output),
      v = info.streams.find((x) => x.codec_type === "video"),
      a = info.streams.find((x) => x.codec_type === "audio");
    if (
      !v ||
      !a ||
      Math.abs(+v.duration - durationOf(plan)) > 0.2 ||
      Math.abs(+a.duration - durationOf(plan)) > 0.2
    )
      throw Error("Rendered media failed duration/audio verification.");
    await atomic(path.join(dir, "render-report.json"), {
      engine: "@remotion/renderer",
      frames: v.nb_frames,
      fps:composition.fps,
      width: v.width,
      height: v.height,
      duration: v.duration,
      audioDuration: a.duration,
      quality,
      planHash:planHash(plan),
      replayHash:plan.replay?.planHash||null,
      schemaVersion:plan.schemaVersion,
      seed:plan.seed,
      renderedAt: new Date().toISOString(),
    });
    return output;
  } catch(error){
    if(stalled)throw Error('Rendering made no progress for 120 seconds. Check the Chrome GPU backend (RENDER_GL) and retry.');
    throw error;
  } finally {
    clearTimeout(stallTimer);
    signal?.removeEventListener("abort", listener);
  }
}

export async function normalizeFilmTiming(plan,dir,signal){const target=Math.round(durationOf(plan)*(plan.renderFps||30)),file=path.join(dir,'video.mp4'),info=await probe(file),v=info.streams.find(s=>s.codec_type==='video');if(+v.nb_frames===target)return false;const tmp=path.join(dir,'timing-normalized.mp4');await command(process.env.FFMPEG_PATH||'ffmpeg',['-y','-v','error','-i',file,'-vf',`trim=end_frame=${target},setpts=PTS-STARTPTS`,'-af',`atrim=duration=${target/(plan.renderFps||30)},asetpts=PTS-STARTPTS`,'-c:v','libx264','-crf','18','-preset','medium','-c:a','aac','-b:a','192k','-movflags','+faststart',tmp],{signal});await rename(tmp,file);return true;}
