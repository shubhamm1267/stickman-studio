import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canonicalizePlan,
  planToStoryIR,
  storyIRToPlan,
  validateStoryIR,
  STORY_IR_VERSION,
  LEGACY_STORY_IR_VERSION,
} from "../shared/canonical-story-ir.mjs";
import { validatePlan } from "../shared/schema.mjs";
import {
  locateFrame,
  sceneFrameTime,
  timeline,
} from "../shared/timeline.mjs";
import {
  secondsAtFractionToFrame,
  secondsToFrame,
  secondsSumToFrame,
} from "../shared/frame-clock.mjs";
import { svgFrame, svgFrameAtFrame, svgFrameForScene } from "../renderer/engine.mjs";
import { planHash } from "../server/inspect.mjs";
import { contactFractions } from "../shared/action-time.mjs";

const readPlan = async (name) =>
  JSON.parse(
    await readFile(new URL(`../examples/${name}`, import.meta.url), "utf8"),
  );

test("Story IR v2 separates semantic labels from registered technical types and round-trips", async () => {
  const input = await readPlan("prop-exchange.json");
  const first = canonicalizePlan(input);
  const second = canonicalizePlan(first.plan);
  assert.equal(first.ir.schemaVersion, STORY_IR_VERSION);
  assert.equal(first.ir.timebase.unit, "frame");
  assert.equal(first.ir.timebase.fps, first.plan.renderFps);
  assert.deepEqual(second.plan, first.plan);
  assert.deepEqual(second.ir, first.ir);
  assert.deepEqual(storyIRToPlan(first.ir), first.plan);
  assert.deepEqual(
    storyIRToPlan(first.ir.compatibility.storyIR),
    first.plan,
    "the prior v1 Story IR remains readable",
  );
  assert.equal(
    first.ir.compatibility.schemaVersion,
    LEGACY_STORY_IR_VERSION,
  );
  assert.equal(planHash(input), planHash(first.plan));

  for (const actor of first.ir.design.actors) {
    assert.ok(actor.id);
    assert.ok(actor.displayName);
    assert.ok(actor.rigProfile.startsWith("sticklaugh.rig."));
    assert.ok(actor.capabilities.length);
    assert.equal("name" in actor, false);
    assert.equal("kind" in actor, false);
  }
  for (const prop of first.ir.design.props) {
    assert.ok(prop.displayName);
    assert.ok(prop.shapeDefinition.startsWith("sticklaugh.shape."));
    assert.ok(prop.capabilities.includes("sticklaugh.render.vector-shape.v1"));
    assert.equal("type" in prop, false);
  }
  assert.ok(first.ir.design.environments.every((x) => x.id && x.sceneId));
  for (const scene of first.ir.scenes) {
    assert.ok(scene.intent.summary);
    assert.equal(scene.time.unit, "frame");
    assert.equal(scene.time.globalEndFrame - scene.time.globalStartFrame, scene.time.localEndFrame);
    assert.equal(scene.transition.atGlobalFrame, scene.time.globalEndFrame);
    assert.ok(scene.performance.actions.every((x) => x.primitiveAction.startsWith("sticklaugh.action.")));
  }
});

test("frame IR defines windows, reactions, contacts, transitions, and sound timestamps", async () => {
  const plan = canonicalizePlan(await readPlan("prop-exchange.json")).plan;
  plan.renderFps = 60;
  const { ir } = canonicalizePlan(plan);
  const source = ir.compatibility.storyIR;
  for (const [sceneIndex, scene] of ir.scenes.entries()) {
    const sourceScene = source.scenes[sceneIndex];
    assert.equal(scene.time.globalStartFrame, timeline(plan).scenes[sceneIndex].from);
    assert.equal(scene.time.interval, "[startFrame,endFrame)");
    for (const action of scene.performance.actions) {
      assert.ok(Number.isInteger(action.window.local.startFrame));
      assert.ok(Number.isInteger(action.window.local.endFrame));
      assert.ok(action.window.local.endFrame >= action.window.local.startFrame);
    }
    for (const reaction of scene.performance.reactions) {
      assert.ok(scene.performance.actions.some((x) => x.id === reaction.actionId));
      assert.equal(reaction.semantics, "reaction-action-window");
    }
    for (const audio of scene.performance.soundCues) {
      for (const timestamp of audio.timestamps) {
        assert.equal(timestamp.unit, "frame");
        if (Number.isInteger(timestamp.frame))
          assert.equal(
            timestamp.globalFrame,
            scene.time.globalStartFrame + timestamp.frame,
          );
      }
    }
    assert.equal(
      scene.transition.atGlobalFrame,
      scene.time.globalEndFrame,
    );
    assert.ok(sourceScene.performance.soundCues.every((cue) => cue.id));
  }
  const slap = canonicalizePlan(await readPlan("simple-slap.json")).ir;
  const punch = slap.scenes.flatMap((scene) => scene.performance.actions)
    .find((action) => action.primitiveAction === "sticklaugh.action.punch.v1");
  if (punch) assert.equal(punch.contacts[0]?.event, "contact");
  assert.deepEqual(contactFractions({ kind: "punch" }), [0.42]);
});

test("canonical validation rejects broken references and altered frame projections", async () => {
  const base = canonicalizePlan(await readPlan("prop-exchange.json")).ir;
  for (const [mutate, pattern] of [
    [(ir) => (ir.schemaVersion = 99), /Unsupported Story IR version/],
    [
      (ir) => (ir.compatibility.storyIR.scenes[0].performance.actions[0].actorId = "missing"),
      /references actor absent/,
    ],
    [
      (ir) => (ir.compatibility.storyIR.scenes[0].transition.toSceneId = "missing"),
      /Transition from scene/,
    ],
    [
      (ir) => (ir.scenes[0].time.globalStartFrame += 1),
      /frame projection does not match/,
    ],
    [
      (ir) => (ir.compatibility.storyIR.schemaVersion = 99),
      /Unsupported Story IR version/,
    ],
  ]) {
    const ir = structuredClone(base);
    mutate(ir);
    assert.throws(() => validateStoryIR(ir), pattern);
  }

  const sounds = structuredClone(base);
  const soundScene = sounds.compatibility.storyIR.scenes.find(
    (scene) => scene.performance.soundCues.length,
  );
  if (soundScene) {
    soundScene.performance.soundCues[0].actionId = "missing";
    assert.throws(() => validateStoryIR(sounds), /references missing action/);
  }
});

test("legacy primary IDs stay intact while new stable entity IDs are global and unique", async () => {
  const raw = await readPlan("superhero-return.json");
  const before = structuredClone(raw);
  const { plan, ir } = canonicalizePlan(raw);
  assert.deepEqual(raw, before);
  const all = [];
  const collect = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const child of node) collect(child);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.id === "string") all.push(node.id);
      for (const [key, value] of Object.entries(node))
        if (key !== "id") collect(value);
    }
  };
  collect(ir.compatibility.storyIR.story);
  collect(ir.compatibility.storyIR.design);
  collect(ir.compatibility.storyIR.scenes);
  assert.equal(new Set(all).size, all.length);
  assert.equal(plan.scenes[0].id, raw.scenes[0].id);
  assert.equal(plan.characters[0].id, raw.characters[0].id);
});

test("preview and Remotion frame selection agree at a rounded fractional scene boundary", async () => {
  const raw = await readPlan("superhero-return.json");
  raw.renderFps = 60;
  raw.scenes[0].duration += 0.005;
  raw.scenes[0].shots.at(-1).end = raw.scenes[0].duration;
  const plan = canonicalizePlan(validatePlan(raw)).plan;
  const clock = timeline(plan);
  const boundary = clock.scenes[1].from;
  const resolved = locateFrame(plan, boundary);
  assert.equal(resolved.index, 1);
  assert.equal(resolved.time, 0);
  assert.equal(
    (await import("../renderer/engine.mjs")).locate(
      plan,
      boundary / clock.fps,
    ).index,
    0,
  );
  assert.equal(svgFrameAtFrame(plan, boundary), svgFrameForScene(plan, 1, 0));
  assert.match(svgFrameAtFrame(plan, boundary), /viewBox="0 0 540 960"/);
  assert.equal(
    svgFrame(plan, boundary / clock.fps),
    svgFrameForScene(
      plan,
      0,
      boundary / clock.fps - clock.scenes[0].from / clock.fps,
    ),
  );
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createApp } = await import("../server/index.mjs");
  const { JobQueue } = await import("../server/queue.mjs");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "story-ir-preview-"));
  const queue = new JobQueue(dir);
  const { app } = await createApp({ queue });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, time: boundary / clock.fps }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), svgFrameAtFrame(plan, boundary));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await queue.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("audio clock uses frame-aligned scene starts and first-frame-at-or-after instants", async () => {
  const plan = canonicalizePlan(await readPlan("superhero-return.json")).plan;
  plan.renderFps = 60;
  const clock = timeline(plan);
  const sceneIndex = 1;
  const range = clock.scenes[sceneIndex];
  assert.equal(sceneFrameTime(plan, sceneIndex, 0), range.from / clock.fps);
  const at = sceneFrameTime(plan, sceneIndex, 0.101);
  assert.equal(at * clock.fps, range.from + Math.ceil(0.101 * 60));
  assert.equal(
    clock.durationInFrames,
    Math.round(plan.scenes.reduce((sum, scene) => sum + scene.duration, 0) * 60),
  );
});

test("decimal frame conversion and cumulative boundaries avoid binary drift", () => {
  assert.equal(secondsToFrame(0.1, 60), 6);
  assert.equal(secondsToFrame(0.1, 60, "ceil"), 6);
  assert.equal(secondsToFrame(0.101, 60, "ceil"), 7);
  assert.equal(secondsSumToFrame(0.1, 0.2, 30, "nearest"), 9);
  assert.equal(secondsAtFractionToFrame(0.1, 0.2, 0.5, 30, "nearest"), 6);
  assert.deepEqual(
    timeline({
      renderFps: 60,
      scenes: Array.from({ length: 60 }, (_, index) => ({
        id: `s${index}`,
        duration: 0.1,
      })),
    }).scenes.map((scene) => scene.durationInFrames),
    Array(60).fill(6),
  );
});