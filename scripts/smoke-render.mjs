import {mkdtemp, readFile, rm, unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {validatePlan} from "../shared/schema.mjs";
import {buildAudio, command, probe} from "../server/media.mjs";
import {findBrowser} from "../server/browser.mjs";
import {ROOT} from "../server/files.mjs";
import {renderFilm} from "../server/render.mjs";

const dir = await mkdtemp(path.join(os.tmpdir(), "sticklaugh-render-smoke-"));
const audioName = `${path.basename(dir)}-audio.wav`;
try {
  const browser = await findBrowser();
  if (!browser) throw Error("Chromium was not detected; cannot render smoke fixture.");
  const source = new URL("../examples/motion-ir-lantern.json", import.meta.url);
  const plan = validatePlan(JSON.parse(await readFile(source, "utf8")));
  const {audio} = await buildAudio(plan, dir, {}, undefined, {bundled: true});
  const output = await renderFilm(plan, dir, audio, {quality: "draft"});
  await command(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"]);
  const info = await probe(output);
  const video = info.streams.find((stream) => stream.codec_type === "video");
  const audioStream = info.streams.find((stream) => stream.codec_type === "audio");
  if (!video || !audioStream || Number(video.nb_frames) !== 240) {
    throw Error("Rendered smoke fixture did not produce the expected video/audio streams.");
  }
  console.log(`PASS offline Remotion smoke: ${path.basename(browser)}, ${video.width}x${video.height}, ${video.nb_frames} frames, H.264/AAC, FFmpeg decode passed.`);
} finally {
  await unlink(path.join(ROOT, "public", audioName)).catch(() => {});
  await rm(dir, {recursive: true, force: true});
}