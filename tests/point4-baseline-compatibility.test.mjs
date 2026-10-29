import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nodes } from "../renderer/draw.mjs";
import { evaluate } from "../renderer/engine.mjs";
import { ACTIONS } from "../shared/schema.mjs";
import { cartesiaBytes } from "../server/providers.mjs";

const read = (name) => fs.readFileSync(new URL(name, import.meta.url), "utf8");
const appTemplate = read("../web/src/app.html");
const appSource = read("../web/src/main.ts");
const serverSource = read("../server/index.mjs");

test("create UI provides the automatic workflow without fixed sample buttons", () => {
  assert.doesNotMatch(appTemplate, /Tested example|Try the tested demo/);
  assert.doesNotMatch(appTemplate, /\[\(ngModel\)\]=["']exampleName["']/);
  assert.doesNotMatch(appTemplate, /Load\s+bundled sample|Preview dynamic joints/);
});

test("studio connections require only Gemini and Freesound", () => {
  assert.doesNotMatch(appTemplate, /Cartesia model|Cartesia API version/);
  assert.doesNotMatch(appSource, /cartesiaModel\s*:|cartesiaVersion\s*:/);
  assert.match(appSource, /delete this\.keys\.cartesiaModel/);
  assert.match(appSource, /delete this\.keys\.cartesiaVersion/);
  assert.doesNotMatch(appTemplate, /Cartesia|Voice IDs by character ID/);
  assert.match(appTemplate, /Gemini API key/);
  assert.match(appTemplate, /Freesound API key/);
});

test("fixed bundled fixture routing remains available without deleting test assets", () => {
  const expected = [
    "superhero-v9.json", "cool-cap-v9.json", "motion-ir-lantern.json",
    "simple-slap.json", "headphone-mask.json", "banana-bin.json",
    "lion-balloon.json", "dadi-jar.json", "mosquito.json",
    "toilet-roll.json", "interview-chair.json",
  ];
  for (const file of expected) {
    assert.ok(serverSource.includes(`examples/${file}`), `route mapping missing ${file}`);
    assert.ok(fs.existsSync(new URL(`../examples/${file}`, import.meta.url)), `fixture missing ${file}`);
  }
  for (const file of ["../tests/v7-api.test.mjs", "../tests/api-queue.test.mjs", "../tests/schema-engine.test.mjs"])
    assert.ok(fs.existsSync(new URL(file, import.meta.url)), `regression test missing ${file}`);
});

test("renderer node grammar preserves path, ellipse, line, nested group and flutter nodes", () => {
  const svg = nodes([
    { kind: "path", d: "M0 0 L8 8", fill: "#ff0000" },
    { kind: "ellipse", center: [4, 5], radius: [2, 3], fill: "#00ff00" },
    { kind: "line", from: [0, 0], to: [4, 4], stroke: "#0000ff" },
    { kind: "group", children: [{ kind: "path", d: "M1 1 L2 2", motion: "flutter" }] },
  ], 0);
  assert.match(svg, /fill="#ff0000"/);
  assert.match(svg, /<ellipse cx="4" cy="5" rx="2" ry="3"/);
  assert.match(svg, /stroke="#0000ff"/);
  assert.match(svg, /data-scene-group="true"/);
  assert.match(svg, /scale\(1 0\.65\)/);
});

test("engine retains default pose values when no action overrides are authored", () => {
  const scene = {
    cast: [{ characterId: "baseline", x: 123, y: 780, scale: 1, facing: 1 }],
    props: [], motions: [], beats: [], sounds: [],
  };
  const state = evaluate(scene, 0, []).states.baseline;
  assert.deepEqual(state.position, [123, 780]);
  assert.deepEqual(state.head, [0, -405]);
  assert.deepEqual(state.hip, [0, -160]);
  assert.deepEqual(state.gaze, [7, 4]);
  assert.equal(state.face, "neutral");
  assert.equal(state.leftType, "fist");
});

test("supported action enum remains explicit and rejects invented actions", () => {
  assert.ok(ACTIONS.includes("custom"));
  assert.ok(ACTIONS.includes("pick"));
  assert.ok(ACTIONS.includes("place"));
  assert.ok(ACTIONS.includes("pawPress"));
  assert.ok(!ACTIONS.includes("teleport"));
});

test("Cartesia provider defaults remain server-owned and request construction is offline", async () => {
  let requestUrl, requestOptions;
  await cartesiaBytes("sample", "voice-fixture", { cartesia: "fixture-only" }, "en", undefined,
    async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(new Uint8Array([82, 73, 70, 70]));
    });
  assert.equal(requestUrl, "https://api.cartesia.ai/tts/bytes");
  assert.equal(requestOptions.headers["Cartesia-Version"], "2026-08-14");
  assert.equal(JSON.parse(requestOptions.body).model_id, "sonic-3.6");
});
