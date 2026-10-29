import fs from "node:fs/promises";
import path from "node:path";
import { createApp } from "../server/index.mjs";
import { ROOT } from "../server/files.mjs";
import { probe, command } from "../server/media.mjs";
const { app, queue } = await createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
let report = [];
try {
  let plan = await (await fetch(base + "/api/example?name=mosquito")).json();
  for (const kind of ["shorts", "landscape-check"]) {
    let p = structuredClone(plan);
    if (kind === "landscape-check") {
      p.format = "landscape";
      p.scenes = ["park", "street"].map((background, i) => ({
        id: "scene" + i,
        summary: "A walk through the " + background,
        duration: 3,
        background,
        backgroundNodes: [],
        cast: [{ characterId: "nandu", x: 190, y: 780, scale: 1, facing: 1 }],
        props: [],
        beats: [
          {
            actorId: "nandu",
            kind: "walk",
            start: 0,
            duration: 2.4,
            to: [320, 780],
            intent: "Walk into the new location",
            emotion: "confident",
          },
        ],
        shots: [
          { start: 0, end: 3, focus: [270, 530], zoom: 1.08, detail: "full" },
        ],
        sounds: [],
        dialogue: [],
      }));
      p.coverage = [
        {
          storyEvent: "Walk between two locations",
          sceneId: "scene0",
          beatIndices: [0],
        },
        { storyEvent: "Walk on street", sceneId: "scene1", beatIndices: [0] },
      ];
      delete p.review;
    }
    let r = await fetch(base + "/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: p, mode: "bundled", quality: "full" }),
    });
    if (r.status !== 202) throw Error(await r.text());
    let j = await r.json();
    let last = "";
    while (true) {
      j = await (await fetch(base + "/api/jobs/" + j.id)).json();
      if (j.message + " " + j.progress !== last) {
        last = j.message + " " + j.progress;
        console.log(kind, last);
      }
      if (j.status === "completed") break;
      if (["failed", "cancelled", "interrupted"].includes(j.status))
        throw Error(j.error || j.status);
      await new Promise((r) => setTimeout(r, 1200));
    }
    const src = path.join(queue.root, j.id),
      dest = path.join(
        ROOT,
        "deliverables",
        kind === "shorts" ? "mosquito-sample" : "landscape-check",
      );
    await fs.mkdir(dest, { recursive: true });
    for (const file of j.result.files)
      await fs.copyFile(path.join(src, file), path.join(dest, file));
    const info = await probe(path.join(dest, "video.mp4"));
    await command(process.env.FFMPEG_PATH || "ffmpeg", [
      "-v",
      "error",
      "-i",
      path.join(dest, "video.mp4"),
      "-f",
      "null",
      "-",
    ]);
    report.push({
      kind,
      jobId: j.id,
      files: j.result.files,
      width: info.streams[0].width,
      height: info.streams[0].height,
      duration: info.format.duration,
      frames: info.streams[0].nb_frames,
      status: "passed",
    });
  }
  await fs.writeFile(
    path.join(ROOT, "docs/integration-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS: actual API jobs, MP4, thumbnail, SEO pack, credits, portrait + multi-scene landscape, full decode.",
  );
} finally {
  await new Promise((r) => server.close(r));
}
