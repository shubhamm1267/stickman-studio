import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAssetProvider, discoverAssetProviders, generateWithAssetProvider, proceduralAssetProvider, VISUAL_BRIEF_EXAMPLES } from "../server/asset-providers.mjs";
import { compileAssetFactoryPipeline } from "../server/asset-factory.mjs";
const readPlan = async (name) => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), "utf8"));

test("Point 14 provider contract performs discovery without image-provider assumptions", () => {
  assert.doesNotThrow(() => assertAssetProvider(proceduralAssetProvider));
  assert.throws(() => assertAssetProvider({ id: "partial", kind: "image-generation", supports() {} }), /generate, validate, provenance, estimatedCost/);
  assert.equal(VISUAL_BRIEF_EXAMPLES.length, 8);
  for (const brief of VISUAL_BRIEF_EXAMPLES) {
    assert.deepEqual(discoverAssetProviders(brief).map((p) => [p.providerId, p.kind, p.supported, p.estimatedCost.amount]), [["sticklaugh.procedural-vector/v1", "procedural-vector", true, 0]]);
    assert.deepEqual(discoverAssetProviders(brief, []), []);
  }
});

test("eight structured examples generate substantive geometry and complete construction metadata", async () => {
  for (const brief of VISUAL_BRIEF_EXAMPLES) {
    for (const field of ["semanticClass", "shapeLanguage", "outlineStyle", "dominantColor", "secondaryColor", "proportions", "material", "identifiableAttributes", "printedTextLogo", "view", "pivotPoints", "occlusionLayers", "desiredMotionAffordances"])
      assert.ok(brief[field] !== undefined, `${brief.proceduralTemplate} lacks ${field}`);
    const result = await generateWithAssetProvider(proceduralAssetProvider, brief);
    const { asset, validation, provenance, estimatedCost } = result;
    assert.equal(validation.status, "pass"); assert.ok(validation.geometryNodeCount >= 7);
    assert.deepEqual(asset.manifest.bounds.rect, [-50,-50,100,100]);
    assert.equal(asset.manifest.alphaMask.kind, "vector-alpha");
    assert.equal(asset.manifest.shadow.nodeId, "contact-shadow");
    assert.deepEqual(asset.manifest.contactPoint.position, [0,47]);
    assert.ok(asset.manifest.attachmentAnchors.length >= 3 && asset.manifest.occlusionLayers.length >= 3 && asset.manifest.animationLayers.length >= 2);
    assert.match(asset.manifest.fallbackBehavior, /retain/);
    assert.equal(asset.visualSpec.geometryRecipe.some((node) => node.id === "contact-shadow"), true);
    assert.ok(asset.visualSpec.geometryRecipe.length >= 7, "no label-only or lone-oval asset");
    assert.equal(provenance.rightsStatus, "original"); assert.equal(provenance.sourceKind, "procedural-svg");
    assert.equal(estimatedCost.amount, 0);
  }
});

test("invalid geometry and unsupported briefs fail closed", async () => {
  const brief = VISUAL_BRIEF_EXAMPLES[0], asset = proceduralAssetProvider.generate(brief);
  const broken = structuredClone(asset); broken.visualSpec.geometryRecipe = [];
  assert.equal(proceduralAssetProvider.validate(broken).status, "failed");
  assert.equal(proceduralAssetProvider.supports({ semanticClass: "unknown" }), false);
  await assert.rejects(generateWithAssetProvider(proceduralAssetProvider, { semanticClass: "unknown" }), /does not support/);
});

test("Point 14 pipeline preserves procedural coverage and discloses no image provider", async () => {
  const pipeline = compileAssetFactoryPipeline(await readPlan("superhero-return.json"));
  assert.equal(pipeline.providerStatus.imageGeneration, "unavailable");
  assert.equal(pipeline.providerStatus.providerTesting, "OFFLINE");
  assert.equal(pipeline.providerStatus.compatibleImageProviderCount, 0);
  assert.equal(pipeline.providerStatus.proceduralExamples, 8);
  assert.match(pipeline.providerStatus.reason, /Gemini.*do not authorize image generation/);
  assert.ok(pipeline.requests.length > 0);
  for (const request of pipeline.requests) {
    const brief = request.visualBrief;
    assert.ok(brief.semanticClass && brief.shapeLanguage && brief.outlineStyle && brief.colors.dominant && brief.colors.secondary);
    assert.ok(brief.proportions.width > 0 && brief.viewFacing.sideBackPolicy && brief.pivotPoints.length);
    assert.ok(Array.isArray(brief.occlusionLayers) && Array.isArray(brief.desiredMotionAffordances));
    assert.ok(request.construction.geometry.visibleGeometry && request.construction.bounds.rect.length === 4);
    assert.ok(request.construction.alphaMask.status && request.construction.contactPoint && request.construction.shadowContact);
    assert.ok(Array.isArray(request.construction.attachmentAnchors) && request.construction.animationLayers.length && request.construction.fallbackBehavior);
  }
});
