import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { findBrowser } from "../server/browser.mjs";
import { compileAssetReadyVisual } from "../shared/asset-ready-visual.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { svgFrame } from "../renderer/engine.mjs";

const readJson = async (url) => JSON.parse(await fs.readFile(url, "utf8"));
const fixtures = await readJson(new URL("../examples/point12-asset-ready-visuals.json", import.meta.url));
const source = await readJson(new URL("../examples/mosquito.json", import.meta.url));
const outputDir = new URL("../examples/point12-raster-fixtures/", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

function makePlan(fixture) {
  const { id, category: _category, ...brief } = fixture;
  const compiled = compileAssetReadyVisual(brief);
  const plan = structuredClone(source);
  const scene = plan.scenes[0];
  plan.scenes = [scene];
  plan.propDesigns = [{
    id,
    name: fixture.description,
    type: "drawing",
    color: fixture.palette[0],
    nodes: [],
    visualSpec: compiled.visualSpec,
    interactionAnchors: compiled.interactionAnchors,
  }];
  scene.props = [{ designId: id, x: 270, y: 500, scale: 1 }];
  scene.motions = [];
  scene.beats = [{
    actorId: scene.cast[0].characterId,
    kind: "idle",
    start: 0,
    duration: scene.duration,
    intent: "Render an isolated Point 12 visual fixture",
  }];
  scene.dialogue = [];
  scene.sounds = [];
  scene.background = "custom";
  scene.backgroundNodes = [];
  scene.shots = [{
    start: 0,
    end: scene.duration,
    focus: [270, 500],
    zoom: 1,
    actorIds: [],
  }];
  plan.coverage = [{
    storyEvent: `Point 12 asset fixture ${id}`,
    sceneId: scene.id,
    beatIndices: [0],
  }];
  delete plan.requirements;
  delete plan.hook;
  return validatePlan(plan);
}

const browserPath = await findBrowser();
if (!browserPath) throw new Error("Chromium is required for the Point 12 raster fixtures.");
const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 540, height: 960 },
  deviceScaleFactor: 1,
});
const outputs = [];
try {
  for (const fixture of fixtures) {
    const plan = makePlan(fixture);
    const svg = svgFrame(plan, 0.5);
    if (!svg.includes(`data-visual-source-kind="procedural-svg"`))
      throw new Error(`Source metadata missing from ${fixture.id} renderer frame.`);
    await page.setContent(`<body style="margin:0;width:540px;height:960px">${svg}</body>`);
    const filename = `${fixture.id}.png`;
    const target = new URL(filename, outputDir);
    const buffer = await page.screenshot({ path: target.pathname, type: "png" });
    outputs.push({
      id: fixture.id,
      category: fixture.category,
      description: fixture.description,
      dimensions: fixture.normalizedDimensions,
      material: fixture.material,
      colors: fixture.palette,
      filename,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      bytes: buffer.length,
    });
  }
} finally {
  await browser.close();
}

const manifest = {
  generatedBy: "scripts/render-point12-fixtures.mjs",
  renderer: "svgFrame + Chromium",
  providerTesting: "OFFLINE",
  viewport: { width: 540, height: 960, deviceScaleFactor: 1 },
  frameTimeSeconds: 0.5,
  fixtures: outputs,
};
await fs.writeFile(
  new URL("manifest.json", outputDir),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`PASS: rendered ${outputs.length} Point 12 fixtures at 540x960.`);