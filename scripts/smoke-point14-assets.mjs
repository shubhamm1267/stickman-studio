import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { findBrowser } from "../server/browser.mjs";
import { proceduralAssetProvider, VISUAL_BRIEF_EXAMPLES } from "../server/asset-providers.mjs";
import { svgFrame } from "../renderer/engine.mjs";
import { validatePlan } from "../shared/schema.mjs";
const source = JSON.parse(await readFile(new URL("../examples/mosquito.json", import.meta.url), "utf8"));
const drawing = source.propDesigns.find((item) => item.type === "drawing");
if (!drawing) throw new Error("Renderer fixture has no drawing prop.");
const baseSvg = svgFrame(validatePlan(structuredClone(source)), 0.3), executablePath = await findBrowser();
if (!executablePath) throw new Error("Chromium is required for the Point 14 asset render smoke.");
const dir = await mkdtemp(path.join(os.tmpdir(), "sticklaugh-point14-assets-"));
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const measure = `from PIL import Image,ImageChops\nimport sys,json\na=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB');d=ImageChops.difference(a,b);h=d.histogram();n=sum(h[256*i+v] for i in range(3) for v in range(1,256));print(json.dumps({'changedChannelSamples':n,'bounds':d.getbbox()}))`;
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const base = path.join(dir, "base.png"); await page.setContent(`<body style="margin:0">${baseSvg}</body>`); await page.screenshot({ path: base });
  for (const [index, brief] of VISUAL_BRIEF_EXAMPLES.entries()) {
    const asset = proceduralAssetProvider.generate(brief);
    if (proceduralAssetProvider.validate(asset).status !== "pass") throw new Error(`${brief.proceduralTemplate} geometry validation failed.`);
    const plan = structuredClone(source); plan.propDesigns.find((item) => item.id === drawing.id).visualSpec = asset.visualSpec;
    const svg = svgFrame(validatePlan(plan), 0.3);
    if (!svg.includes('data-visual-component="geometry"') || !svg.includes('fill="#d4d4ce"')) throw new Error(`${brief.proceduralTemplate} missing geometry in application SVG.`);
    const png = path.join(dir, `asset-${index}.png`); await page.setContent(`<body style="margin:0">${svg}</body>`); await page.screenshot({ path: png });
    const result = JSON.parse(execFileSync("python3", ["-c", measure, base, png], { encoding: "utf8" }).trim());
    if (result.changedChannelSamples < 100 || !result.bounds) throw new Error(`${brief.proceduralTemplate} had no measurable frame output.`);
    console.log(`PASS ${brief.proceduralTemplate}: Chromium 540x960; changed channel samples=${result.changedChannelSamples}.`);
  }
  console.log("PASS Point 14: all eight procedural assets rendered in application frames; provider testing OFFLINE.");
} finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
