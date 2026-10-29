import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validatePlan, migratePlan, verifyReplayPlan } from "../shared/schema.mjs";
import { compileCoverageReport, planHash } from "../server/inspect.mjs";
import { svgFrame, svgFrameAtFrame } from "../renderer/engine.mjs";
import { timeline } from "../shared/timeline.mjs";
import { withExportFps } from "../server/export-settings.mjs";

const load = (name) => JSON.parse(
  fs.readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8"),
);

test("legacy fixtures migrate to versioned credential-free replay metadata", () => {
  for (const name of ["mosquito", "cool-cap-v9"]) {
    const legacy = load(name);
    assert.equal(legacy.schemaVersion, undefined);
    const migrated = migratePlan(legacy);
    assert.equal(migrated.schemaVersion, 2);
    assert.ok(Number.isInteger(migrated.seed));
    assert.equal(migrated.replay.schemaVersion, 1);
    assert.equal(migrated.replay.seed, migrated.seed);
    assert.equal(migrated.replay.planHash.length, 64);
    assert.equal(migrated.provenance.origin, "legacy-migration");
    assert.ok(migrated.scenes.every((scene) =>
      Number.isInteger(scene.sceneSeed)
      && scene.canonicalFrame.endFrame > scene.canonicalFrame.startFrame,
    ));
    assert.equal(verifyReplayPlan(migrated), true);
    assert.equal(planHash(migrated), legacy.review?.planHash || planHash(legacy));
    assert.doesNotMatch(JSON.stringify(migrated.replay), /api[_-]?key|token|secret|credential/i);
    const rerun = validatePlan(structuredClone(migrated));
    assert.deepEqual(rerun.replay, migrated.replay);
  }
});

test("saved plan evaluation is byte-identical frame by frame, including reordered entities", () => {
  const legacy = load("mosquito");
  const original = migratePlan(legacy);
  const reordered = structuredClone(original);
  reordered.characters.reverse();
  reordered.propDesigns.reverse();
  reordered.scenes[0].cast.reverse();
  reordered.scenes[0].props.reverse();
  const stableOrder = validatePlan(reordered);
  assert.equal(stableOrder.seed, original.seed);
  assert.equal(stableOrder.replay.planHash, original.replay.planHash);
  assert.deepEqual(
    stableOrder.scenes.map((scene) => scene.sceneSeed),
    original.scenes.map((scene) => scene.sceneSeed),
  );
  const total = timeline(original).durationInFrames;
  for (let frame = 0; frame < total; frame++) {
    assert.equal(
      svgFrameAtFrame(original, frame),
      svgFrameAtFrame(stableOrder, frame),
      `entity order changed rendered output at frame ${frame}`,
    );
  }
  const rerun = migratePlan(JSON.parse(JSON.stringify(original)));
  for (let frame = 0; frame < total; frame++)
    assert.equal(svgFrameAtFrame(original, frame), svgFrameAtFrame(rerun, frame));
});

test("preview and export use the same canonical frame evaluation at a timestamp", () => {
  const plan = migratePlan(load("mosquito"));
  const fps = plan.replay.fps;
  for (const frame of [1, 17, 127, plan.replay.totalFrames - 2]) {
    const timestamp = frame / fps;
    assert.equal(svgFrame(plan, timestamp), svgFrameAtFrame(plan, frame));
  }
});

test("duration edits recalculate canonical frame ranges and replay hashes", () => {
  const plan = migratePlan(load("mosquito"));
  const priorHash = plan.replay.planHash;
  const priorEnd = plan.scenes[0].canonicalFrame.endFrame;
  const changed = structuredClone(plan);
  changed.scenes[0].duration += 0.5;
  changed.scenes[0].shots.at(-1).end += 0.5;
  assert.equal(verifyReplayPlan(changed), false);
  const migrated = validatePlan(changed);
  assert.equal(migrated.scenes[0].canonicalFrame.endFrame, priorEnd + Math.round(0.5 * migrated.replay.fps));
  assert.notEqual(migrated.replay.planHash, priorHash);
  assert.equal(verifyReplayPlan(migrated), true);
});

test("FPS export changes reseal replay metadata and canonical frame ranges", () => {
  const plan = migratePlan(load("mosquito"));
  const changed = withExportFps(plan, 60);
  assert.equal(changed.replay.fps, 60);
  assert.equal(changed.scenes[0].canonicalFrame.fps, 60);
  assert.equal(verifyReplayPlan(changed), true);
  assert.equal(plan.replay.fps, 30);
});

test("unknown contact references fail migration instead of disappearing", () => {
  const plan = load("mosquito");
  plan.propDesigns[0].contactEventIds = ["unknown_contact_event"];
  assert.throws(() => migratePlan(plan), /Unknown contact event/);
});

test("new asset, rig, affordance and visual evidence fields feed coverage compilation", () => {
  const plan = load("mosquito");
  const actor = plan.characters[0];
  const prop = plan.propDesigns.find((item) => item.id === "mosquito");
  actor.requiredAppearanceFeatures = ["round eyes"];
  actor.rigRequirement = {
    profile: "sticklaugh.rig.humanoid-man.v2",
    capabilities: ["sticklaugh.motion.humanoid-pose.v1"],
  };
  prop.visualAssetRequest = {
    description: "A blue-green mosquito with clear wings",
    requiredFeatures: ["clear wings"],
    style: "vector",
  };
  prop.assetCapabilities = ["sticklaugh.shape.drawing.v1"];
  prop.objectAffordances = ["grip"];
  prop.rightsStatus = "original";
  const migrated = validatePlan(plan);
  const report = compileCoverageReport(migrated);
  assert.equal(report.ok, true);
  const event = report.events.find((item) => item.source === "story-asset" && item.entityIds.includes("mosquito"));
  const actorEvent = report.events.find((item) => item.source === "coverage");
  assert.ok(event);
  assert.ok(event.assetRigCapability.asset.includes("sticklaugh.shape.drawing.v1"));
  assert.equal(event.assetRigCapability.rightsStatus, "original");
  assert.equal(event.visibleOutputCheck.propVisible, true);
  assert.match(event.visibleOutputCheck.outputSha256, /^[a-f0-9]{64}$/);
  assert.equal(actorEvent.visibleOutputCheck.actorVisible, true);
  assert.ok(!("credentials" in migrated.replay));
});

test("stored visual evidence is checked against the exact rendered frame", () => {
  const plan = load("mosquito");
  const actor = plan.characters[0];
  const beat = plan.scenes[0].beats[0];
  beat.id = "evidence_action";
  const first = validatePlan(plan);
  const report = compileCoverageReport(first);
  const actual = report.events.find((item) =>
    item.source === "coverage" && item.animationPrimitive === beat.kind,
  );
  actor.visualEvidence = [{
    eventId: beat.id,
    frame: actual.timelineMoment.frame,
    outputSha256: actual.visibleOutputCheck.outputSha256,
    check: "actor-visible",
  }];
  assert.equal(compileCoverageReport(validatePlan(plan)).ok, true);
  plan.characters[0].visualEvidence[0].outputSha256 = "0".repeat(64);
  assert.ok(compileCoverageReport(validatePlan(plan)).issues.some((issue) =>
    issue.code === "coverage-stale-visual-evidence",
  ));
});

test("display-name changes do not change stable ID dispatch or renderer capability mapping", () => {
  const plan = migratePlan(load("mosquito"));
  const renamed = structuredClone(plan);
  renamed.characters[0].name = "A completely different display name";
  renamed.propDesigns.find((item) => item.id === "mosquito").name = "An unrelated object label";
  const before = compileCoverageReport(plan);
  const after = compileCoverageReport(renamed);
  const project = (report) => report.events.map((item) => ({
    entityIds: item.entityIds,
    primitive: item.animationPrimitive,
    rig: item.assetRigCapability?.rig,
    asset: item.assetRigCapability?.asset,
    output: item.visibleOutputCheck.outputSha256,
  }));
  assert.deepEqual(project(after), project(before));
});

test("coverage compiler rejects missing mappings and checks actual renderer markers", () => {
  const plan = load("dadi-jar");
  const report = compileCoverageReport(plan);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "coverage-missing-beat"));
  const complete = compileCoverageReport(load("mosquito"));
  assert.equal(complete.ok, true);
  assert.ok(complete.events.filter((event) => event.source === "coverage").every((event) =>
    event.visibleOutputCheck.actorVisible
    && event.visibleOutputCheck.frameChanged
    && /^[a-f0-9]{64}$/.test(event.visibleOutputCheck.outputSha256),
  ));
  assert.ok(complete.events.filter((event) => event.source === "story-asset").every((event) =>
    event.visibleOutputCheck.propVisible
    && /^[a-f0-9]{64}$/.test(event.visibleOutputCheck.outputSha256),
  ));
});