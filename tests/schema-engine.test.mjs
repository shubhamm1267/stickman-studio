import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validatePlan, durationOf } from "../shared/schema.mjs";
import { evaluate, svgFrame } from "../renderer/engine.mjs";
import { ik } from "../shared/math.mjs";
const demo = JSON.parse(
  fs.readFileSync(new URL("../examples/dadi-jar.json", import.meta.url)),
);
test("accepted story retains all declared actors, props and duration", () => {
  let p = validatePlan(demo);
  assert.equal(durationOf(p), 26);
  assert.equal(p.characters.length, 2);
  assert.equal(p.propDesigns.length, 3);
});
test("reject missing narrative target rather than substituting", () => {
  let p = structuredClone(demo);
  p.scenes[0].beats[0].targetId = "spaceship";
  assert.throws(() => validatePlan(p), /target missing/);
});
test("reject injected SVG or external asset content", () => {
  let p = structuredClone(demo);
  p.propDesigns.push({
    id: "evil",
    name: "evil",
    type: "drawing",
    color: "#ffffff",
    nodes: [{ kind: "path", d: 'M0 0" onload="alert(1)' }],
  });
  assert.throws(() => validatePlan(p));
});
test("reject camera gaps, overflow and unsupported actions", () => {
  for (let change of [
    (p) => (p.scenes[0].shots[1].start = 1.5),
    (p) => (p.scenes[0].beats[0].duration = 50),
    (p) => (p.scenes[0].beats[0].kind = "teleport"),
  ]) {
    let p = structuredClone(demo);
    change(p);
    assert.throws(() => validatePlan(p));
  }
});
test("IK never stretches bones and clamps unreachable targets", () => {
  for (let t of [
    [1000, 0],
    [-1000, 30],
    [0, 0],
    [40, 110],
  ]) {
    let r = ik([0, 0], t);
    assert.ok(Math.abs(Math.hypot(...r.elbow) - 98) < 1e-6);
    assert.ok(
      Math.abs(
        Math.hypot(r.hand[0] - r.elbow[0], r.hand[1] - r.elbow[1]) - 102,
      ) < 1e-6,
    );
  }
});
test("jar opens only at story event and muscles subsequently deflate", () => {
  let p = validatePlan(demo),
    s = p.scenes[0];
  assert.equal(evaluate(s, 15, p.propDesigns).props.pickle.open, 0);
  assert.equal(evaluate(s, 17, p.propDesigns).props.pickle.open, 1);
  assert.ok(evaluate(s, 20, p.propDesigns).states.nandu.muscle > 0.9);
  assert.ok(evaluate(s, 23, p.propDesigns).states.nandu.muscle < 0.01);
});
test("held cup follows actual clamped hand while actor walks", () => {
  let p = validatePlan(demo);
  for (let t of [12, 13, 14, 23.6]) {
    let { states, props } = evaluate(p.scenes[0], t, p.propDesigns),
      cup = props.tea,
      s = states.dadi;
    assert.equal(cup.owner.actorId, "dadi");
    assert.ok(
      Math.abs(
        cup.position[0] -
          (s.position[0] + s.leftHand[0] * s.scale + cup.owner.offset[0]),
      ) < 1e-6,
    );
  }
});
test("all sample frames produce finite SVG; all format viewports differ correctly", () => {
  let p = validatePlan(demo);
  for (let i = 0; i < 780; i++) {
    let svg = svgFrame(p, i / 30);
    assert.ok(!/NaN|Infinity|undefined|<script|<image|<text/.test(svg));
  }
  assert.match(svgFrame(p, 1, { format: "landscape" }), /0 0 960 540/);
  assert.match(svgFrame(p, 1, { format: "square" }), /0 0 540 540/);
});
test("new vector object is rendered from data without changing renderer code", () => {
  let p = validatePlan(demo);
  p.propDesigns.push({
    id: "star",
    name: "Star",
    type: "drawing",
    color: "#ffffff",
    nodes: [
      { kind: "path", d: "M0 -10 L9 9 L-9 9Z", fill: "#ff0000", width: 1 },
    ],
  });
  p.scenes[0].props.push({ designId: "star", x: 420, y: 400, scale: 1 });
  let svg = svgFrame(validatePlan(p), 1);
  assert.match(svg, /#ff0000/);
});
test("a jar-opening routine cannot silently masquerade as opening a phone", () => {
  let p = structuredClone(demo);
  p.propDesigns.find((x) => x.id === "pickle").type = "phone";
  assert.throws(() => validatePlan(p), /Jar-specific/);
});
