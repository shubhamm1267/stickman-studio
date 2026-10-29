import fs from "node:fs/promises";
import path from "node:path";
import { createApp } from "../server/index.mjs";
import { ROOT } from "../server/files.mjs";
import { probe, command } from "../server/media.mjs";
const { app, queue } = await createApp(),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port,
  report = [];
try {
  for (const name of (process.argv.slice(2).length?process.argv.slice(2):["superhero-v9","cool-cap-v9"])) {
    let plan = JSON.parse(
      await fs.readFile(path.join(ROOT, "examples", name + ".json"), "utf8"),
    );
    let res = await fetch(base + "/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, mode: "bundled", quality: "full" }),
    });
    if (res.status !== 202) throw Error(await res.text());
    let j = await res.json(),
      last = -1;
    while (true) {
      j = await (await fetch(base + "/api/jobs/" + j.id)).json();
      if (j.progress !== last) {
        console.log(name, j.message, j.progress);
        last = j.progress;
      }
      if (j.status === "completed") break;
      if (["failed", "cancelled", "interrupted"].includes(j.status))
        throw Error(j.error || j.status);
      await new Promise((r) => setTimeout(r, 1000));
    }
    let source = path.join(queue.root, j.id),
      dest = path.join(ROOT, "deliverables", name);
    await fs.mkdir(dest, { recursive: true });
    for (const file of j.result.files)
      await fs.copyFile(path.join(source, file), path.join(dest, file));
    let info = await probe(path.join(dest, "video.mp4"));
    await command(process.env.FFMPEG_PATH || "ffmpeg", [
      "-v",
      "error",
      "-i",
      path.join(dest, "video.mp4"),
      "-f",
      "null",
      "-",
    ]);
    let qa = JSON.parse(
      await fs.readFile(path.join(dest, "quality-report.json"), "utf8"),
    );
    if (!qa.ok || !qa.reviewCurrent || !qa.hook.timingPassed || !qa.hook.visiblePassed)
      throw Error("Opening hook/preflight failed");
    report.push({
      name,
      jobId: j.id,
      width: info.streams[0].width,
      height: info.streams[0].height,
      frames: info.streams[0].nb_frames,
      duration: info.format.duration,
      hook: qa.hook,
      status: "passed",
      audioMode:name==="superhero-v9"?"60fps, CC0 recorded gibberish and literal action effects":"120fps, CC0 genuine gibberish preview vocals; live Cartesia not used",
    });
  }
  await fs.writeFile(
    path.join(ROOT, "docs/v9-sample-results.json"),
    JSON.stringify([...JSON.parse(await fs.readFile(path.join(ROOT,"docs/v9-sample-results.json"),"utf8").catch(()=>"[]")).filter(x=>!report.some(r=>r.name===x.name)),...report], null, 2),
  );
  console.log(
    "PASS: Selected V9 samples rendered through the real app API; full decode, audio and opening-hook checks.",
  );
} finally {
  await new Promise((r) => server.close(r));
}
