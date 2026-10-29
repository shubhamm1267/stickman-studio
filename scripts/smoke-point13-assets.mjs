import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { findBrowser } from "../server/browser.mjs";
import { compileAssetFactoryPipeline, applyAssetFactoryOverrides } from "../server/asset-factory.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { svgFrame } from "../renderer/engine.mjs";
import { point13Png } from "../tests/point13-png-fixture.mjs";

const source = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../examples/mosquito.json", import.meta.url), "utf8"));
const design = source.propDesigns[0];
const bytes = point13Png();
const { createHash } = await import("node:crypto");
const sha256 = createHash("sha256").update(bytes).digest("hex");
design.optionalSourceAsset = { assetId: "point13RasterSmoke", sha256, mediaType: "image/png" };
design.rightsStatus = "original";
const before = validatePlan(structuredClone(source));
const compiled = compileAssetFactoryPipeline(source, { providedAssets: { point13RasterSmoke: { bytes, mediaType: "image/png", sourceRef: "test:point13-smoke" } } });
const after = applyAssetFactoryOverrides(source, compiled);
const beforeSvg = svgFrame(before, 0.3);
const afterSvg = svgFrame(after, 0.3);
if (!afterSvg.includes('data-user-raster="verified-alpha"')) throw new Error("Actual renderer SVG omitted the verified PNG node.");
const executablePath = await findBrowser();
if (!executablePath) throw new Error("Chromium is required for the Point 13 asset render smoke.");
const dir = await mkdtemp(path.join(os.tmpdir(), "sticklaugh-point13-assets-"));
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;width:540px;height:960px">${beforeSvg}</body>`);
  await page.screenshot({ path: path.join(dir, "before.png") });
  await page.setContent(`<body style="margin:0;width:540px;height:960px">${afterSvg}</body>`);
  await page.screenshot({ path: path.join(dir, "after.png") });
  const measurement = JSON.parse(execFileSync("python3", ["-c", `from PIL import Image, ImageChops\nimport sys, json\na=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')\nd=ImageChops.difference(a,b); h=d.histogram(); changed=sum(h[256*i+v] for i in range(3) for v in range(1,256))\nprint(json.dumps({'changedChannelSamples': changed, 'bounds': d.getbbox()}))`, path.join(dir, "before.png"), path.join(dir, "after.png")], { encoding: "utf8" }).trim());
  if (measurement.changedChannelSamples < 100) throw new Error(`Raster asset made no measurable renderer change: ${JSON.stringify(measurement)}`);
  console.log(`PASS: Chromium rendered verified user PNG; changed channel samples=${measurement.changedChannelSamples}, diff-bounds=${JSON.stringify(measurement.bounds)}; 540x960 SVG frame, provider testing OFFLINE.`);
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
