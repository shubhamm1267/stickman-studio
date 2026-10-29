import test from "node:test";
import assert from "node:assert/strict";
import { sampleMotionPath, validateMotionPath } from "../shared/motion-path.mjs";

const route = [
  { at: 0, position: [0, 0] },
  { at: 0.25, position: [100, 50], timing: "smooth" },
  { at: 1, position: [100, 200] },
];

test("bounded stage paths interpolate across unevenly timed waypoints", () => {
  assert.equal(validateMotionPath(route), true);
  assert.deepEqual(sampleMotionPath(route, 0), [0, 0]);
  assert.deepEqual(sampleMotionPath(route, 1), [100, 200]);
  assert.deepEqual(sampleMotionPath(route, 0.625), [100, 125]);
});

test("path sampling clamps boundaries and is independent of evaluation order", () => {
  const expected = sampleMotionPath(route, 0.4);
  assert.deepEqual(sampleMotionPath(route, -20), [0, 0]);
  assert.deepEqual(sampleMotionPath(route, 20), [100, 200]);
  sampleMotionPath(route, 0.9);
  assert.deepEqual(sampleMotionPath(route, 0.4), expected);
});

test("path validation rejects malformed, unbounded, or excessive data", () => {
  for (const bad of [
    [{ at: 0, position: [0, 0] }],
    [{ at: 0.1, position: [0, 0] }, { at: 1, position: [1, 1] }],
    [{ at: 0, position: [0, 0] }, { at: 1, position: [Infinity, 0] }],
    [{ at: 0, position: [0, 0] }, { at: 1, position: [1501, 0] }],
    [{ at: 0, position: [0, 0] }, { at: 0, position: [1, 0] }, { at: 1, position: [2, 0] }],
    [{ at: 0, position: [0, 0] }, { at: 0.5, position: [1, 0], timing: "bounce" }, { at: 1, position: [2, 0] }],
    Array.from({ length: 17 }, (_, index) => ({
      at: index / 16,
      position: [index, 0],
    })),
  ])
    assert.throws(() => validateMotionPath(bad));
});