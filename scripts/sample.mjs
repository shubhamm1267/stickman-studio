import "dotenv/config";
import path from "node:path";
import { ROOT, json, atomic } from "../server/files.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { assertRenderable } from "../server/inspect.mjs";
import { creatorPack } from "../server/creator.mjs";
import { buildAudio } from "../server/media.mjs";
import { renderFilm } from "../server/render.mjs";
let plan = validatePlan(
    await json(path.join(ROOT, "examples/interview-chair.json")),
  ),
  dir = path.join(ROOT, "deliverables", "sample");
if (process.argv.includes("--landscape")) {
  plan.format = "landscape";
  dir = path.join(ROOT, "deliverables", "sample-landscape");
}
await atomic(path.join(dir, "plan.json"), plan);
await atomic(path.join(dir, "quality-report.json"), assertRenderable(plan));
let { audio, credits } = await buildAudio(plan, dir, {}, undefined, {
  bundled: true,
  progress: console.log,
});
console.log(
  await renderFilm(plan, dir, audio, { progress: (m, p) => console.log(p, m) }),
);

let seo = creatorPack(plan, credits);
await atomic(path.join(dir, "creator-pack.json"), seo);
await atomic(path.join(dir, "description.txt"), seo.description);
