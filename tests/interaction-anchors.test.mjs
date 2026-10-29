import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePlan } from "../shared/schema.mjs";
import { localToWorld } from "../shared/math.mjs";
import { evaluate, svgFrame } from "../renderer/engine.mjs";

const raw = JSON.parse(readFileSync(new URL("../examples/prop-exchange.json", import.meta.url), "utf8"));
const plan = validatePlan(raw);
const scene = plan.scenes[0];
const design = plan.propDesigns[0];
const anchor = design.interactionAnchors.find(a => a.id === "handle");

function rotate(point, degrees) {
  const angle = degrees * Math.PI / 180;
  return [
    point[0] * Math.cos(angle) - point[1] * Math.sin(angle),
    point[0] * Math.sin(angle) + point[1] * Math.cos(angle),
  ];
}

function propAnchorWorld(frame) {
  const prop = frame.props.parcel;
  const offset = rotate(anchor.position.map(v => v * prop.scale), prop.angle);
  return [prop.position[0] + offset[0], prop.position[1] + offset[1]];
}

function ownerHandWorld(frame) {
  const prop = frame.props.parcel;
  const actor = frame.states[prop.owner.actorId];
  return localToWorld(actor, actor[prop.owner.hand]);
}

function nearPoint(actual, expected, tolerance = 0.05) {
  assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("hand-authored exchange picks up and carries by the named prop anchor", () => {
  assert.equal(evaluate(scene, 0.49, plan.propDesigns).props.parcel.owner, null);
  for (const time of [0.5, 1.0, 1.59]) {
    const frame = evaluate(scene, time, plan.propDesigns);
    assert.equal(frame.props.parcel.owner.actorId, "asha");
    assert.equal(frame.props.parcel.owner.propAnchorId, "handle");
    nearPoint(propAnchorWorld(frame), ownerHandWorld(frame));
  }
});

test("transfer keeps anchor contact, object position, orientation, and world size continuous", () => {
  const before = evaluate(scene, 1.6 - 0.000001, plan.propDesigns);
  const atTransfer = evaluate(scene, 1.6, plan.propDesigns);
  const after = evaluate(scene, 1.6 + 0.000001, plan.propDesigns);
  assert.equal(before.props.parcel.owner.actorId, "asha");
  assert.equal(atTransfer.props.parcel.owner.actorId, "bala");
  assert.equal(after.props.parcel.owner.actorId, "bala");
  for (const frame of [before, atTransfer, after])
    nearPoint(propAnchorWorld(frame), ownerHandWorld(frame));
  nearPoint(before.props.parcel.position, atTransfer.props.parcel.position, 0.01);
  assert.ok(Math.abs(before.props.parcel.angle - atTransfer.props.parcel.angle) < 0.01);
  assert.equal(before.props.parcel.scale, atTransfer.props.parcel.scale);
});

test("release/place preserves the requested absolute destination and repeated seeking is deterministic", () => {
  const before = evaluate(scene, 2.7 - 0.000001, plan.propDesigns);
  const placed = evaluate(scene, 2.7, plan.propDesigns);
  assert.equal(before.props.parcel.owner.actorId, "bala");
  assert.equal(placed.props.parcel.owner, null);
  assert.deepEqual(placed.props.parcel.position, [385, 748]);
  assert.equal(placed.props.parcel.angle, 0);
  assert.deepEqual(evaluate(scene, 3.2, plan.propDesigns), evaluate(scene, 3.2, plan.propDesigns));
});

test("reaction beats change actual faces in the shared SVG renderer", () => {
  const frame = evaluate(scene, 3.2, plan.propDesigns);
  assert.equal(frame.states.asha.face, "shock");
  assert.equal(frame.states.bala.face, "laugh");
  assert.notEqual(svgFrame(plan, 2.8), svgFrame(plan, 3.2));
});

test("interaction anchors are bounded, unique, and referenced by existing prop designs", () => {
  const duplicate = structuredClone(raw);
  duplicate.propDesigns[0].interactionAnchors.push({ id: "handle", position: [0, 0] });
  assert.throws(() => validatePlan(duplicate), /Duplicate interaction anchor/);

  const outOfBounds = structuredClone(raw);
  outOfBounds.propDesigns[0].interactionAnchors[0].position = [251, 0];
  assert.throws(() => validatePlan(outOfBounds));

  const missing = structuredClone(raw);
  missing.scenes[0].props[0].attachmentEvents[0].attachment.propAnchorId = "missing";
  assert.throws(() => validatePlan(missing), /Unknown prop interaction anchor missing in scene propExchange, prop parcel, event 0/);
});

test("placement transforms cannot be attached to an ownership-transfer event", () => {
  const invalid = structuredClone(raw);
  invalid.scenes[0].props[0].attachmentEvents[0].position = [100, 200];
  assert.throws(() => validatePlan(invalid), /Placement transform is only valid on a release event/);
});

test("HTTP preview consumes the named-anchor fixture through the production frame path", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createApp } = await import("../server/index.mjs");
  const { JobQueue } = await import("../server/queue.mjs");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "interaction-preview-"));
  const queue = new JobQueue(dir);
  const { app } = await createApp({ queue });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/preview`;
    const frameAt = async time => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: raw, time }),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
      return response.text();
    };
    const pickup = await frameAt(0.75);
    const transfer = await frameAt(1.75);
    const placed = await frameAt(2.8);
    for (const svg of [pickup, transfer, placed]) assert.match(svg, /#d79a52/);
    assert.notEqual(pickup, transfer);
    assert.notEqual(transfer, placed);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await queue.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});