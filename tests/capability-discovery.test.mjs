import test from "node:test";
import assert from "node:assert/strict";
import {chmod, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {findBrowser, findBrowserOnPath} from "../server/browser.mjs";
import {discoverCapabilities} from "../server/capability-discovery.mjs";
import {compileScene, listSceneCompilers} from "../server/scene-compile.mjs";
import {ACTIONS, MOTION_CAPABILITIES} from "../shared/schema.mjs";
import {plannerCapabilityData} from "../shared/capability-compiler.mjs";
import {geometryComponentNames, getGeometryComponentManifest} from "../shared/geometry-library.mjs";
import {createApp} from "../server/index.mjs";
import {JobQueue} from "../server/queue.mjs";

test("browser discovery searches PATH for an executable Chromium command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "browser-path-"));
  try {
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    await Promise.all([
      mkdir(first, {recursive: true}),
      mkdir(second, {recursive: true}),
    ]);
    const notExecutable = path.join(first, "chromium");
    const executable = path.join(second, "chromium");
    await writeFile(notExecutable, "not executable");
    await writeFile(executable, "chromium test stub");
    await chmod(executable, 0o755);
    assert.equal(findBrowserOnPath(`${first}${path.delimiter}${second}`), executable);
    assert.equal(findBrowserOnPath(first), null);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("the scene compiler registry preserves the legacy default and rejects unknown IDs", () => {
  const scene = {
    duration: 8,
    shots: [
      {start: 2, end: 4, focus: [20, 30], zoom: 1},
      {start: 5, end: 6, focus: [40, 50], zoom: 1.2},
    ],
  };
  const defaultResult = compileScene(scene);
  const namedResult = compileScene(scene, "camera-cuts/v1");
  assert.deepEqual(defaultResult, namedResult);
  assert.deepEqual(defaultResult.shots.map(({start, end}) => [start, end]), [[0, 5], [5, 8]]);
  assert.equal(scene.shots[0].start, 2);
  assert.deepEqual(listSceneCompilers(), [{
    id: "camera-cuts/v1",
    version: 1,
    capabilities: ["camera.continuous-timeline"],
  }]);
  assert.throws(() => compileScene(scene, "not-registered/v1"), /Unknown scene compiler/);
});

test("capability discovery reports only registered compiler and existing plan/motion support", async () => {
  const result = await discoverCapabilities();
  assert.equal(result.contractVersion, 1);
  assert.deepEqual(result.plan, {version: 1, actionKinds: ACTIONS});
  assert.deepEqual(result.motion, MOTION_CAPABILITIES);
  assert.deepEqual(result.capabilityCompiler, plannerCapabilityData());
  assert.equal(result.visual.id, "sticklaugh.visual-components");
  assert.equal(result.visual.contractVersion, 1);
  assert.equal(result.visual.componentSchemaVersion, 1);
  assert.equal(result.visual.complexity.geometryNodesPerVisualSpec, 100);
  assert.deepEqual(result.visual.proceduralComponents.map(({id}) => id), geometryComponentNames);
  assert.ok(result.visual.proceduralComponents.every((component) => component.registered));
  assert.ok(result.visual.proceduralComponents.every((component) => component.maxNodes > 0));
  assert.ok(result.visual.builtInPropTypes.find((propType) => propType.id === "drawing").labelIsNotGeometry);
  assert.deepEqual(result.sceneCompilers, listSceneCompilers());
  assert.equal(typeof result.rendering.chromiumAvailable, "boolean");
  assert.equal(result.rendering.engine, "remotion");
  assert.equal(result.rendering.chromiumAvailable, Boolean(await findBrowser()));
});

test("GET /api/capabilities is additive to the existing schema endpoint", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "capabilities-api-"));
  const queue = new JobQueue(dir);
  const {app} = await createApp({queue});
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const headers = process.env.STUDIO_TOKEN
    ? {Authorization: `Bearer ${process.env.STUDIO_TOKEN}`}
    : {};
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const schemaResponse = await fetch(`${base}/api/schema`, {headers});
    assert.equal(schemaResponse.status, 200);
    const schema = await schemaResponse.json();
    assert.deepEqual(Object.keys(schema).sort(), ["actions", "motionCapabilities", "schema"]);

    const response = await fetch(`${base}/api/capabilities`, {headers});
    assert.equal(response.status, 200);
    const capabilities = await response.json();
    assert.deepEqual(capabilities.plan.actionKinds, ACTIONS);
    assert.deepEqual(capabilities.motion, MOTION_CAPABILITIES);
    assert.deepEqual(capabilities.capabilityCompiler, plannerCapabilityData());
    assert.equal(capabilities.visual.id, "sticklaugh.visual-components");
    assert.deepEqual(
      capabilities.visual.proceduralComponents.map(({id}) => id),
      getGeometryComponentManifest().map(({id}) => id),
    );
    assert.deepEqual(capabilities.sceneCompilers, listSceneCompilers());
    assert.equal(typeof capabilities.rendering.chromiumAvailable, "boolean");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await queue.close();
    await rm(dir, {recursive: true, force: true});
  }
});