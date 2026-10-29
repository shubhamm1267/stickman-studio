import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validatePlan } from "../shared/schema.mjs";
import { inspectPlan, assertRenderable, planHash } from "../server/inspect.mjs";
import { evaluate, svgFrame } from "../renderer/engine.mjs";
const demo = JSON.parse(
  fs.readFileSync(new URL("../examples/mosquito.json", import.meta.url)),
);
const old = JSON.parse(
  fs.readFileSync(new URL("../examples/dadi-jar.json", import.meta.url)),
);
test("new comedy has linked events, current authored review, and clean geometry", () => {
  let p = validatePlan(demo),
    r = inspectPlan(p, { requireCoverage: true });
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 0);
  assert.ok(r.samples >= 224);
  assert.equal(r.planHash, p.review.planHash);
});
test("unreachable contact fails preflight instead of silently stretching a hand", () => {
  let p = structuredClone(old);
  p.scenes[0].props.find((q) => q.designId === "pickle").x = 900;
  let r = inspectPlan(p);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "unreachable-contact"));
  assert.throws(() => assertRenderable(p), /cannot reach/);
});
test("coverage cannot reference a nonexistent beat and strict review needs concrete links", () => {
  let p = structuredClone(demo);
  p.coverage[0].beatIndices = [999];
  assert.throws(() => validatePlan(p));
  p = structuredClone(demo);
  delete p.coverage[0].beatIndices;
  assert.equal(inspectPlan(p, { requireCoverage: true }).ok, false);
});
test("overlapping motions cannot control the same prop", () => {
  let p = structuredClone(demo);
  p.scenes[0].motions.push({
    ...p.scenes[0].motions[0],
    start: 0.2,
    duration: 0.7,
  });
  assert.ok(inspectPlan(p).issues.some((i) => i.code === "overlapping-motion"));
});
test("sequential prop paths reach their destination and preserve endpoints", () => {
  let p = validatePlan(demo);
  let q = evaluate(p.scenes[0], 3.5, p.propDesigns).props.mosquito;
  assert.deepEqual(q.position, [350, 480]);
  assert.equal(q.scale, 0.7);
});
test("swat makes contact at its declared sound frame without unreachable bones", () => {
  let p = validatePlan(demo),
    s = p.scenes[0],
    t = 5.25 + 1.1 * 0.64;
  let v = evaluate(s, t, p.propDesigns),
    a = v.states.nandu,
    q = v.props.cheekR;
  let actual = [
    a.position[0] + a.rightHand[0] * a.scale,
    a.position[1] + a.rightHand[1] * a.scale,
  ];
  assert.ok(
    Math.hypot(actual[0] - q.position[0], actual[1] - q.position[1]) < 1,
  );
  assert.ok(a.reachError.right < 0.01);
});
test("editing a reviewed action invalidates the review hash; derived voice timing does not", () => {
  let p = validatePlan(demo),
    h = planHash(p);
  p.scenes[0].beats[0].emotion = "calm";
  assert.notEqual(planHash(p), h);
  p = validatePlan(demo);
  p.scenes[0].dialogue.push({ actorId: "nandu", start: 1, text: "Hi" });
  h = planHash(p);
  p.scenes[0].dialogue[0].audioDuration = 0.5;
  assert.equal(planHash(p), h);
});
test("all 840 new comedy frames have finite geometry and no captions", () => {
  let p = validatePlan(demo);
  for (let i = 0; i < 840; i++)
    assert.ok(
      !/NaN|Infinity|undefined|<text|<script|<image/.test(svgFrame(p, i / 30)),
    );
});
test("camera interpolation changes the frame continuously within a shot", () => {
  let p = validatePlan(demo);
  assert.notEqual(svgFrame(p, 0.2), svgFrame(p, 1));
  let p2 = structuredClone(p);
  p2.scenes[0].shots[0].endZoom = 1.65;
  assert.notEqual(svgFrame(p, 1), svgFrame(p2, 1));
});
test("eye direction interpolates to the instructed gaze instead of being ignored", () => {
  let p = validatePlan(demo),
    a = evaluate(p.scenes[0], 7.5, p.propDesigns).states.nandu;
  assert.deepEqual(a.gaze, [-9, -2]);
});
test("held prop follows a rotating wrist during a fall", () => {
  let p = validatePlan(old),
    s = p.scenes[0];
  s.beats.push({
    actorId: "dadi",
    kind: "fall",
    start: 13,
    duration: 0.5,
    intent: "Fall while carrying cup",
  });
  let { states, props } = evaluate(s, 13.6, p.propDesigns),
    a = states.dadi,
    q = props.tea,
    h = a[q.owner.hand],
    ang = (a.bodyAngle * Math.PI) / 180,
    x = h[0] * a.scale + q.owner.offset[0],
    y = h[1] * a.scale + q.owner.offset[1];
  assert.ok(
    Math.abs(
      q.position[0] - (a.position[0] + x * Math.cos(ang) - y * Math.sin(ang)),
    ) < 1e-6,
  );
  assert.equal(q.angle, a.bodyAngle);
});
test("scene entry preserves directed pose, expression and open prop state", () => {
  let p = validatePlan(old),
    s = p.scenes[0];
  s.beats = [];
  s.cast[0].initialPose = { muscle: 1, headAngle: 8, gaze: [-5, 2] };
  s.cast[0].emotion = "smug";
  s.props.find((q) => q.designId === "pickle").open = 1;
  let v = evaluate(s, 0, p.propDesigns);
  assert.equal(v.states.nandu.muscle, 1);
  assert.equal(v.states.nandu.face, "smug");
  assert.deepEqual(v.states.nandu.gaze, [-5, 2]);
  assert.equal(v.props.pickle.open, 1);
});
test("sound anchors use actual swat, sneeze and planted-foot timing", async () => {
  const { expandCues } = await import("../server/timing.mjs");
  let p = validatePlan(demo),
    s = p.scenes[0],
    cues = expandCues(s, p.propDesigns);
  let slap = cues.find((c) => c.fixture === "slap" && c.beatIndex === 6);
  assert.ok(Math.abs(slap.start - (5.25 + 1.1 * 0.64)) < 1e-8);
  let sneeze = cues.find((c) => c.fixture === "sneeze");
  assert.ok(Math.abs(sneeze.start - (16.1 + 2.1 * 0.68)) < 1e-8);
  let steps = cues.filter((c) => c.fixture === "steps");
  assert.ok(steps.length >= 4);
  for (const c of steps) {
    let a = evaluate(s, c.start, p.propDesigns).states.nandu;
    assert.ok(a.leftFoot[1] >= -0.11 || a.rightFoot[1] >= -0.11);
  }
});
