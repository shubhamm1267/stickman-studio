import "dotenv/config";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { json, ROOT, atomic } from "../server/files.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { buildAudio } from "../server/media.mjs";
import { renderFilm } from "../server/render.mjs";
import { planHash, assertRenderable } from "../server/inspect.mjs";
import { reviewAndRepair } from "../server/providers.mjs";
import {produceFilm} from '../server/production.mjs';
import { creatorPack } from "../server/creator.mjs";
const file = process.argv[2];
if (!file)
  throw Error(
    "Usage: npm run render:plan -- path/to/plan.json [output-directory]",
  );
let plan = validatePlan(await json(path.resolve(file)));
const dir = path.resolve(
    process.argv[3] || path.join(ROOT, "deliverables", "render"),
  ),
  bundled = process.env.BUNDLED_DEMO === "1",
  keys = {
    gemini: process.env.GEMINI_API_KEY,
    freesound: process.env.FREESOUND_API_KEY,
    cartesia: process.env.CARTESIA_API_KEY,
  };
await mkdir(dir, { recursive: true });
if (!bundled && (!plan.review || plan.review.planHash !== planHash(plan)))
  plan = await reviewAndRepair(plan, keys, undefined, console.log);
const {plan:finalPlan,credits}=await produceFilm(plan,dir,keys,{
 bundled,quality:process.env.RENDER_QUALITY==='draft'?'draft':'full',
 progress:(message,percent)=>console.log(percent,message),
});
plan=finalPlan;
console.log(path.join(dir,'video.mp4'));
let seo = creatorPack(plan, credits);
await atomic(path.join(dir, "creator-pack.json"), seo);
await atomic(path.join(dir, "description.txt"), seo.description);
