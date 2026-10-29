import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileAssetReadyVisual } from "../shared/asset-ready-visual.mjs";
import { NodeSchema, VisualSpecSchema } from "../shared/visual-spec-schema.mjs";
import { TypedSceneGraphSchema } from "../shared/scene-graph.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { svgFrame } from "../renderer/engine.mjs";

const fixtures = JSON.parse(fs.readFileSync(
  new URL("../examples/point12-asset-ready-visuals.json", import.meta.url),
  "utf8",
));
const sourcePlan = () => JSON.parse(fs.readFileSync(
  new URL("../examples/mosquito.json", import.meta.url),
  "utf8",
));

function compileFixture(fixture) {
  const { id: _id, category: _category, ...brief } = fixture;
  return compileAssetReadyVisual(brief);
}

function isolatedPlan(fixture) {
  const compiled = compileFixture(fixture);
  const plan = sourcePlan();
  const scene = plan.scenes[0];
  plan.scenes = [scene];
  plan.propDesigns = [{
    id: fixture.id,
    name: fixture.description,
    type: "drawing",
    color: fixture.palette[0],
    nodes: [],
    visualSpec: compiled.visualSpec,
    interactionAnchors: compiled.interactionAnchors,
  }];
  scene.props = [{ designId: fixture.id, x: 270, y: 500, scale: 1 }];
  scene.motions = [];
  scene.beats = [{
    actorId: scene.cast[0].characterId,
    kind: "idle",
    start: 0,
    duration: scene.duration,
    intent: "Hold the isolated visual fixture for raster review",
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
    storyEvent: `Point 12 visual fixture ${fixture.id}`,
    sceneId: scene.id,
    beatIndices: [0],
  }];
  delete plan.requirements;
  delete plan.hook;
  return validatePlan(plan);
}

function cameraEntity(id, entityRefs = [], overrides = {}) {
  return {
    id,
    sourceId: id,
    category: "cameraTarget",
    visible: true,
    transform: { position: [0, 0], rotation: 0, scale: [1, 1] },
    layering: { band: "camera", zIndex: 0 },
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    pose: { focus: [0, 0], zoom: 1 },
    supportedInteractions: [],
    ...(entityRefs.length ? { entityRefs } : {}),
    ...overrides,
  };
}

const graph = (entities) => ({
  version: 1,
  sceneId: "validationScene",
  time: 0,
  entities,
});

test("Point 12 visual descriptions compile only safe recipes and preserve rig/interaction anchors and source status", () => {
  const fixture = fixtures[3];
  const compiled = compileFixture(fixture);
  assert.ok(compiled.visualSpec.geometryRecipe.length > 0);
  assert.deepEqual(compiled.visualSpec.motionAnchors, fixture.motionAnchors);
  assert.deepEqual(compiled.interactionAnchors, fixture.interactionAnchors);
  assert.deepEqual(compiled.sourceStatus, {
    kind: "procedural-svg",
    rightsStatus: "original",
  });

  const plan = sourcePlan();
  const design = plan.propDesigns.find((item) => item.id === "mosquito");
  design.visualSpec = compiled.visualSpec;
  design.interactionAnchors = compiled.interactionAnchors;
  const placement = plan.scenes[0].props[0];
  placement.attachment = {
    actorId: plan.scenes[0].cast[0].characterId,
    bone: "rightHand",
    offset: [0, 0],
    propAnchorId: fixture.interactionAnchors[0].id,
  };
  placement.attachAt = 0;
  const rendered = svgFrame(validatePlan(plan), 0.2);
  assert.match(rendered, /data-motion-anchor-id="handleTop"/);
  assert.match(rendered, /data-visual-source-kind="procedural-svg"/);
  assert.match(rendered, /data-rights-status="original"/);
  assert.doesNotMatch(rendered, /<script|foreignObject|(?:href|src)="(?:https?|file):/i);
});

test("new food, household, and sign fixtures compile as distinct playback-size visual specs", () => {
  const categoryCounts = { food: 0, household: 0, sign: 0 };
  const signatures = new Set();
  for (const fixture of fixtures) {
    categoryCounts[fixture.category]++;
    const compiled = compileFixture(fixture);
    const plan = isolatedPlan(fixture);
    const svg = svgFrame(plan, 0.5);
    assert.match(svg, new RegExp(`data-visual-source-kind="procedural-svg"`));
    assert.match(svg, new RegExp(`data-rights-status="original"`));
    assert.match(svg, new RegExp(`data-material="${fixture.material}"`));
    assert.match(svg, new RegExp(`data-motion-anchor-id="${fixture.motionAnchors[0].id}"`));
    assert.ok(/<(?:path|polygon|ellipse|rect)/.test(svg), `${fixture.id} has no rendered shape`);
    assert.ok(compiled.visualSpec.normalizedDimensions.width !== 100
      || compiled.visualSpec.normalizedDimensions.height !== 100,
    `${fixture.id} must vary dimensions from the default`);
    signatures.add(JSON.stringify({
      width: compiled.visualSpec.normalizedDimensions.width,
      height: compiled.visualSpec.normalizedDimensions.height,
      material: compiled.visualSpec.material,
      palette: compiled.visualSpec.palette,
      recipe: compiled.visualSpec.geometryRecipe,
    }));
  }
  assert.deepEqual(categoryCounts, { food: 3, household: 3, sign: 2 });
  assert.equal(signatures.size, fixtures.length, "each fixture must vary its shape/material/color recipe");
});

test("user art and optional verified-image records remain explicit, inert provenance", () => {
  const source = {
    kind: "user-supplied",
    assetId: "userApple",
    sourceRef: "upload:apple-art&v=2.svg",
    sha256: "a".repeat(64),
    mediaType: "image/svg+xml",
    rightsStatus: "licensed",
  };
  const fixture = fixtures[0];
  const compiled = compileAssetReadyVisual({
    description: fixture.description,
    geometryRecipe: fixture.geometryRecipe,
    motionAnchors: fixture.motionAnchors,
    interactionAnchors: fixture.interactionAnchors,
    assetSource: source,
  });
  const plan = isolatedPlan({ ...fixture, assetSource: source });
  const svg = svgFrame(plan, 0.5);
  assert.equal(compiled.sourceStatus.assetId, "userApple");
  assert.match(svg, /data-visual-source-ref="upload:apple-art&amp;v=2\.svg"/);
  assert.match(svg, /data-visual-asset-sha256="a{64}"/);
  assert.match(svg, /data-rights-status="licensed"/);
  assert.doesNotMatch(svg, /<image\b|href=/i, "provenance metadata must not fetch or embed the art");

  const generated = compileAssetReadyVisual({
    description: "Verified generated reference art; not rendered by this vector fixture",
    geometryRecipe: fixture.geometryRecipe,
    assetSource: {
      kind: "verified-generated",
      assetId: "generatedPear",
      sourceRef: "asset-registry:generatedPear",
      sha256: "b".repeat(64),
      mediaType: "image/png",
      rightsStatus: "unknown",
      provider: "approved.image.provider",
      verification: {
        method: "human-review",
        evidenceRef: "review:ticket-12",
        verifiedAt: "2026-10-27T03:00:00Z",
      },
    },
  });
  assert.equal(generated.sourceStatus.kind, "verified-generated");
  assert.equal(generated.sourceStatus.rightsStatus, "unknown");
  assert.throws(() => isolatedPlan({
    ...fixture,
    assetSource: { ...source, rightsStatus: "restricted" },
  }), /Restricted visual source/);
  const escapedReference = compileAssetReadyVisual({
    description: "Escaped metadata stays inert",
    geometryRecipe: fixture.geometryRecipe,
    assetSource: { ...source, sourceRef: 'x" onload="alert(1)' },
  });
  assert.equal(escapedReference.sourceStatus.sourceRef, 'x" onload="alert(1)');
  const escapedSvg = svgFrame(isolatedPlan({
    ...fixture,
    assetSource: { ...source, sourceRef: 'x" onload="alert(1)' },
  }), 0.5);
  assert.match(escapedSvg, /data-visual-source-ref="x&quot; onload=&quot;alert\(1\)"/);
  assert.doesNotMatch(escapedSvg, /data-visual-source-ref="x" onload=/);
  assert.throws(() => compileAssetReadyVisual({
    description: "Reject control characters",
    geometryRecipe: fixture.geometryRecipe,
    assetSource: { ...source, sourceRef: "invalid\nreference" },
  }), /sourceRef|Source references/i);
});

test("malformed paths, excessive budgets, huge transforms, and non-finite coordinates fail closed", () => {
  for (const d of [
    'M0 0" onload="alert(1)',
    "M0 0 E1 2",
    "M0 0 L1e999 0",
    `M0 0 ${"L1 1 ".repeat(257)}`,
  ]) {
    assert.throws(() => NodeSchema.parse({ kind: "path", d }));
  }
  assert.throws(() => NodeSchema.parse({
    kind: "ellipse", center: [0, 0], radius: [Infinity, 1],
  }), /finite|number/i);
  assert.throws(() => VisualSpecSchema.parse({
    geometryRecipe: Array.from({ length: 101 }, () => ({
      kind: "ellipse", center: [0, 0], radius: [1, 1],
    })),
  }), /100|maximum/i);
  assert.throws(() => VisualSpecSchema.parse({
    globalTransform: { position: [0, 0], rotation: 0, scale: [1e9, 1] },
  }), /maximum|too big|greater/i);

  const base = cameraEntity("cameraA");
  assert.throws(() => TypedSceneGraphSchema.parse(graph([{
    ...base,
    transform: { position: [1e300, 0], rotation: 0, scale: [1, 1] },
  }])), /maximum|too big|greater/i);
  assert.throws(() => TypedSceneGraphSchema.parse(graph([{
    ...base,
    transform: { position: [NaN, 0], rotation: 0, scale: [1, 1] },
  }])), /finite|number/i);
});

test("unsupported material functions and generated component overflow are rejected", () => {
  for (const material of [
    () => "organic",
    { type: "custom", paint: () => "#ffffff" },
  ]) {
    assert.throws(() => VisualSpecSchema.parse({ material }), /Invalid|expected|function/i);
  }
  const fixture = fixtures[0];
  assert.throws(() => compileAssetReadyVisual({
    description: "Over budget generated asset",
    assetSource: fixture.assetSource,
    proceduralComponents: Array.from({ length: 8 }, (_, index) => ({
      id: `wheel${index}`,
      componentId: "wheelSpokes",
      options: { center: [0, 0], radius: 10, spokes: 12 },
    })),
  }), /100 geometry node limit/);
  assert.throws(() => compileAssetReadyVisual({
    description: "Unsupported executable material",
    geometryRecipe: fixture.geometryRecipe,
    material: { callback: "() => paint" },
    assetSource: fixture.assetSource,
  }), /material|Invalid/i);
});

test("typed scene graph rejects duplicate IDs, missing/circular references, and invalid layer relations", () => {
  const first = cameraEntity("cameraA");
  assert.throws(() => TypedSceneGraphSchema.parse(graph([
    first,
    cameraEntity("cameraA"),
  ])), /Duplicate scene graph entity id/);
  assert.throws(() => TypedSceneGraphSchema.parse(graph([
    cameraEntity("cameraA", ["missingCamera"]),
  ])), /references missing entity/);
  assert.throws(() => TypedSceneGraphSchema.parse(graph([
    cameraEntity("cameraA", ["cameraB"]),
    cameraEntity("cameraB", ["cameraA"]),
  ])), /Circular entity references/);
  assert.throws(() => TypedSceneGraphSchema.parse(graph([
    cameraEntity("cameraA", [], {
      category: "character",
      sourceId: "actorA",
      pose: {
        head: [0, 0], hip: [0, 0], leftHand: [0, 0], rightHand: [0, 0],
        leftFoot: [0, 0], rightFoot: [0, 0], emotion: "neutral", facing: 1,
      },
    }),
  ])), /Invalid layer relationship/);
});