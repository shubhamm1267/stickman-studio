import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { compileAssetFactoryPipeline, applyAssetFactoryOverrides, importSafeSvg } from "../server/asset-factory.mjs";
import { canonicalizePlan } from "../shared/canonical-story-ir.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { inspectTransparentPng } from "../shared/raster-asset.mjs";
import { svgFrame } from "../renderer/engine.mjs";
import { point13Png } from "./point13-png-fixture.mjs";

const readPlan = async (name) => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Point 13 compiles every canonical scene visual into deterministic semantic and content IDs", async () => {
  const source = await readPlan("superhero-return.json");
  const first = compileAssetFactoryPipeline(source);
  const canonical = canonicalizePlan(source);
  const second = compileAssetFactoryPipeline(canonical.ir);
  assert.deepEqual(first.coverage, second.coverage);
  assert.deepEqual(first.requests.map((item) => [item.semanticEntityId, item.linkedAssetId]), second.requests.map((item) => [item.semanticEntityId, item.linkedAssetId]));
  assert.equal(first.summary.uncoveredCount, 0);
  assert.ok(first.summary.requestedEntityCount > 0);
  assert.ok(first.coverage.every((row) => row.semanticEntityId && /^asset_sha256_[a-f0-9]{64}$/.test(row.compiledAssetId)));
  assert.ok(new Set(first.coverage.map((row) => row.entityKind)).has("character"));
  assert.ok(new Set(first.coverage.map((row) => row.entityKind)).has("prop"));
  assert.ok(new Set(first.coverage.map((row) => row.entityKind)).has("environment"));
  assert.ok(new Set(first.coverage.map((row) => row.entityKind)).has("scenery"));
  assert.ok(new Set(first.coverage.map((row) => row.entityKind)).has("transient-effect"));
  assert.ok(first.coverage.every((row) => row.requiredSilhouette && Array.isArray(row.appearances) && Array.isArray(row.supportedMotionContact)));
  assert.equal(first.providerStatus.imageGeneration, "unavailable");
  assert.equal(first.providerStatus.providerTesting, "OFFLINE");
});

test("tier B accepts only explicitly licensed, digest-matched, transparent PNG and feeds renderer-ready art", async () => {
  const source = await readPlan("mosquito.json");
  const design = source.propDesigns[0];
  const bytes = point13Png();
  const hash = digest(bytes);
  design.optionalSourceAsset = { assetId: "point13Png", sha256: hash, mediaType: "image/png" };
  design.rightsStatus = "licensed";
  const result = compileAssetFactoryPipeline(source, { providedAssets: { point13Png: { bytes, mediaType: "image/png", sourceRef: "upload:point13-fixture" } } });
  const request = result.requests.find((item) => item.kind === "prop" && item.sourceId === design.id);
  const asset = result.assets.find((item) => item.assetId === request.linkedAssetId);
  assert.equal(request.assetPlan.resolverTier, "B");
  assert.equal(asset.tier, "B");
  assert.equal(asset.validatedArt.status, "pass");
  assert.equal(result.renderOverrides.props[design.id].assetSource.sha256, hash);
  assert.match(result.renderOverrides.props[design.id].geometryRecipe[0].dataUri, /^data:image\/png;base64,/);
  const plan = applyAssetFactoryOverrides(validatePlan(source), result);
  const svg = svgFrame(plan, 0.3);
  assert.match(svg, /data-user-raster="verified-alpha"/);
  assert.match(svg, /data-visual-source-kind="user-supplied"/);
  assert.deepEqual(inspectTransparentPng(bytes), { width: 2, height: 2, alphaVerified: true, bytes: bytes.length });
});

test("tier B rejects opaque/corrupt PNG, unlicensed rights, and mismatched content digests", async () => {
  const opaque = point13Png({ transparent: false });
  assert.throws(() => inspectTransparentPng(opaque), /transparent and visible pixels/);
  const corrupt = point13Png(); corrupt[corrupt.length - 10] ^= 1;
  assert.throws(() => inspectTransparentPng(corrupt), /checksum|decode|truncated|chunk length/i);
  const source = await readPlan("mosquito.json");
  const design = source.propDesigns[0];
  const bytes = point13Png();
  design.optionalSourceAsset = { assetId: "point13Png", sha256: digest(bytes), mediaType: "image/png" };
  design.rightsStatus = "unknown";
  assert.throws(() => compileAssetFactoryPipeline(source, { providedAssets: { point13Png: { bytes, mediaType: "image/png" } } }), /explicit original, licensed, or public-domain rights/);
  design.rightsStatus = "licensed";
  assert.throws(() => compileAssetFactoryPipeline(source, { providedAssets: { point13Png: { bytes: point13Png({ transparent: false }), mediaType: "image/png" } } }), /digest or media type/);
});

test("tier B imports only transparent-canvas SVG geometry and rejects active or external content", () => {
  const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><path d="M10 70 L50 5 L90 70 Z" fill="#31aabb" stroke="#293329" stroke-width="2"/></svg>');
  const imported = importSafeSvg(safe);
  assert.equal(imported.geometryVerified, true);
  assert.equal(imported.alphaVerified, true);
  assert.equal(imported.geometryRecipe[0].kind, "path");
  assert.throws(() => importSafeSvg(Buffer.from('<svg viewBox="0 0 10 10"><image href="https://bad.invalid/x.png"/></svg>')), /external|unsupported/i);
  assert.throws(() => importSafeSvg(Buffer.from('<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="#ffffff"/></svg>')), /transparent canvas/);
});

test("tier B safe SVG is content-checked, compiled, linked, and consumed as renderer geometry", async () => {
  const source = await readPlan("mosquito.json");
  const design = source.propDesigns[0];
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><ellipse cx="50" cy="40" rx="36" ry="22" fill="#ffcc33" stroke="#293329" stroke-width="2"/></svg>');
  const hash = digest(bytes);
  design.optionalSourceAsset = { assetId: "safeSvg13", sha256: hash, mediaType: "image/svg+xml" };
  design.rightsStatus = "public-domain";
  const result = compileAssetFactoryPipeline(source, { providedAssets: { safeSvg13: { bytes, mediaType: "image/svg+xml", sourceRef: "upload:safe-svg-fixture" } } });
  const request = result.requests.find((item) => item.kind === "prop" && item.sourceId === design.id);
  assert.equal(request.assetPlan.resolverTier, "B");
  assert.equal(request.linkedAssetId, result.coverage.find((row) => row.sourceId === design.id && row.entityKind === "prop").compiledAssetId);
  const plan = applyAssetFactoryOverrides(source, result);
  const svg = svgFrame(plan, 0.3);
  assert.match(svg, /data-visual-source-kind="user-supplied"/);
  assert.match(svg, /#ffcc33/);
  assert.doesNotMatch(svg, /<script|foreignObject|https:\/\/bad\.invalid/i);
});
