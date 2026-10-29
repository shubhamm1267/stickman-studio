import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validatePlan } from "../shared/schema.mjs";
import { compileSceneGraph, TypedSceneGraphSchema } from "../shared/scene-graph.mjs";
import { evaluate, svgFrame } from "../renderer/engine.mjs";
import { localToWorld } from "../shared/math.mjs";

const load = (name) => validatePlan(JSON.parse(
  fs.readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8"),
));
const activeShot = (scene, time) =>
  scene.shots.find((shot) => time >= shot.start && time < shot.end) || scene.shots.at(-1);

test("frame graph contains independent renderer-backed categories with identity, pose, transform, bounds and interactions", () => {
  const plan = load("superhero-v9");
  const scene = plan.scenes[0];
  const time = 0.5;
  const { states, props, effects } = evaluate(scene, time, plan.propDesigns);
  const shot = activeShot(scene, time);
  const graph = compileSceneGraph({
    plan, scene, time, states, props, effects, shot,
    camera: { focus: shot.focus, zoom: shot.zoom },
  });
  const categories = new Set(graph.entities.map((entity) => entity.category));
  for (const category of ["character", "prop", "environment", "surface", "cameraTarget", "effect", "shadow"])
    assert.ok(categories.has(category), `missing ${category}`);
  for (const entity of graph.entities) {
    assert.ok(entity.id);
    assert.equal(typeof entity.visible, "boolean");
    assert.ok(entity.pose);
    assert.ok(entity.transform.position.every(Number.isFinite));
    assert.ok(entity.transform.scale.every((value) => value > 0));
    assert.ok(Number.isFinite(entity.bounds.x));
    assert.ok(entity.bounds.width >= 0 && entity.bounds.height >= 0);
    assert.ok(entity.layering.band);
    assert.ok(Array.isArray(entity.supportedInteractions));
  }
  const hero = graph.entities.find((entity) => entity.category === "character" && entity.sourceId === "Hero");
  assert.ok(hero.supportedInteractions.includes("perform"));
  const target = graph.entities.find((entity) => entity.category === "cameraTarget");
  assert.deepEqual(target.pose.focus, shot.focus);
  assert.ok(graph.entities.some((entity) => entity.category === "effect" && entity.pose.kind === "wind"));
});

test("reusable visual specifications validate, render their components and expose metadata anchors", () => {
  const plan = load("mosquito");
  const scene = plan.scenes[0];
  const characterId = scene.cast[0].characterId;
  const character = plan.characters.find((item) => item.id === characterId);
  const propPlacement = scene.props.find((item) => item.designId === "mosquito");
  const propDesign = plan.propDesigns.find((item) => item.id === "mosquito");
  const spec = {
    silhouetteFamily: "organic",
    geometryRecipe: [{
      kind: "ellipse", center: [0, 0], radius: [18, 12], paletteIndex: 0,
    }],
    normalizedDimensions: { width: 100, height: 80 },
    material: "paper",
    paint: { fill: "none", stroke: "#102030", outlineThickness: 2.5 },
    palette: ["#34a0a4"],
    facialComponents: [{
      kind: "ellipse", center: [5, -2], radius: [3, 3], fill: "#102030",
    }],
    apparel: [{
      kind: "path", d: "M-8 8 L8 8", fill: "none", stroke: "#102030",
    }],
    accessories: [{
      kind: "ellipse", center: [16, -12], radius: [3, 3], fill: "#34a0a4",
    }],
    decorativeMarks: [{
      kind: "line", from: [-10, 12], to: [10, 12], stroke: "#102030",
    }],
    motionAnchors: [{ id: "specGrip", position: [8, 4] }],
    zIndex: 12,
    localTransform: { position: [2, 3], rotation: 5, scale: [1, 1] },
  };
  character.visualSpec = structuredClone(spec);
  propDesign.visualSpec = structuredClone(spec);
  propPlacement.attachment = {
    actorId: characterId,
    bone: "rightHand",
    offset: [0, 0],
    propAnchorId: "specGrip",
  };
  propPlacement.attachAt = 0;
  const validated = validatePlan(plan);
  const frame = svgFrame(validated, 0.5);
  assert.match(frame, /data-visual-spec="true"/);
  assert.match(frame, /data-silhouette-family="organic"/);
  assert.match(frame, /data-material="paper"/);
  assert.match(frame, /data-visual-z-index="12"/);
  assert.match(frame, /data-visual-component="face"/);
  assert.match(frame, /data-visual-component="apparel"/);
  assert.match(frame, /data-visual-component="accessories"/);
  assert.match(frame, /data-visual-component="decorative-marks"/);
  assert.match(frame, /data-motion-anchor-id="specGrip"/);
  assert.match(frame, /fill="#34a0a4"/);
  assert.match(frame, /stroke="#102030"/);
  assert.match(frame, /data-scene-entity-category="environment"/);
  assert.match(frame, /data-scene-entity-category="surface"/);
  assert.match(frame, /data-scene-entity-category="cameraTarget"/);
  assert.match(frame, /data-scene-entity-category="character"/);
  assert.match(frame, /data-scene-entity-category="prop"/);

  const globalPlan = structuredClone(validated);
  const globalSpec = globalPlan.characters.find((item) => item.id === characterId).visualSpec;
  delete globalSpec.localTransform;
  globalSpec.globalTransform = { position: [20, 30], rotation: 15, scale: [1.2, 0.8] };
  assert.match(svgFrame(validatePlan(globalPlan), 0.5), /translate\(20 30\) rotate\(15\) scale\(1.2 0.8\)/);
});

test("visual-spec palette references and transform-space ambiguity are rejected", () => {
  const plan = JSON.parse(fs.readFileSync(new URL("../examples/mosquito.json", import.meta.url), "utf8"));
  const character = plan.characters[0];
  character.visualSpec = {
    geometryRecipe: [{ kind: "ellipse", center: [0, 0], radius: [8, 8], paletteIndex: 1 }],
    palette: ["#123456"],
  };
  assert.throws(() => validatePlan(plan), /paletteIndex/);
  character.visualSpec = {
    geometryRecipe: [{ kind: "ellipse", center: [0, 0], radius: [8, 8] }],
    localTransform: { position: [0, 0], rotation: 0, scale: [1, 1] },
    globalTransform: { position: [0, 0], rotation: 0, scale: [1, 1] },
  };
  assert.throws(() => validatePlan(plan), /local or global transform/);
});

test("visual-spec motion anchors resolve to the actual attached-prop transform", () => {
  const plan = JSON.parse(fs.readFileSync(new URL("../examples/cool-cap-v9.json", import.meta.url), "utf8"));
  const scene = plan.scenes.find((item) => item.id === "breakfast");
  const placement = scene.props.find((item) => item.designId === "egg");
  const egg = plan.propDesigns.find((item) => item.id === "egg");
  egg.visualSpec = {
    geometryRecipe: [{ kind: "ellipse", center: [0, 0], radius: [20, 20] }],
    motionAnchors: [{ id: "visualGrip", position: [8, 4] }],
  };
  placement.attachment.propAnchorId = "visualGrip";
  const validated = validatePlan(plan);
  const { states, props } = evaluate(scene, 0.2, validated.propDesigns);
  const actor = states.Raju;
  const anchorWorld = localToWorld(actor, [actor.head[0], actor.head[1] - 95]);
  const propScale = props.egg.scale;
  assert.ok(Math.abs(props.egg.position[0] - (anchorWorld[0] - 8 * propScale)) < 0.001);
  assert.ok(Math.abs(props.egg.position[1] - (anchorWorld[1] - 4 * propScale)) < 0.001);
});

test("prop-local procedural details inherit the moving prop's live rotation", () => {
  const plan = load("cool-cap-v9");
  const scene = plan.scenes.find((item) => item.id === "heat");
  const placement = scene.props.find((item) => item.designId === "egg");
  const egg = plan.propDesigns.find((item) => item.id === "egg");
  egg.visualSpec = {
    proceduralComponents: [{
      id: "eggDetail",
      componentId: "organicRound",
      options: { center: [0, 0], radius: [7, 4], fill: "#c98243" },
      attachment: "root",
      layer: "overlay",
    }],
  };
  const validated = validatePlan(plan);
  for (const time of [0.2, 0.3, 0.5]) {
    const { states, props, effects } = evaluate(scene, time, validated.propDesigns);
    const shot = activeShot(scene, time);
    const graph = compileSceneGraph({
      plan: validated, scene, time, states, props, effects, shot,
      camera: { focus: shot.focus, zoom: shot.zoom },
    });
    const entity = graph.entities.find((item) => item.category === "prop" && item.designId === "egg");
    assert.equal(entity.transform.rotation, props.egg.angle);
    const frame = svgFrame(validated, time);
    assert.match(frame, /data-visual-component-id="eggDetail"/);
    const expectedRotation = Number(props.egg.angle.toFixed(2));
    const layers = [...frame.matchAll(/data-visual-procedural-layer="overlay" transform="([^"]+)"/g)];
    assert.ok(
      layers.some((match) => match[1].includes(`rotate(${expectedRotation})`)),
      `procedural prop detail should inherit angle ${expectedRotation}`,
    );
  }
});

test("typed scene graph rejects unsupported prop attachments and over-budget visual specs", () => {
  const graph = {
    version: 1,
    sceneId: "visualGraph",
    time: 0,
    entities: [{
      id: "propEntity",
      sourceId: "cap",
      designId: "cap",
      category: "prop",
      visible: true,
      transform: { position: [0, 0], rotation: 0, scale: [1, 1] },
      layering: { band: "world", zIndex: 0 },
      bounds: { x: -20, y: -20, width: 40, height: 40 },
      pose: { angle: 0, open: 0 },
      supportedInteractions: [],
      visualSpec: {
        proceduralComponents: [{
          id: "hat",
          componentId: "organicRound",
          attachment: "head",
          options: { radius: [5, 5] },
        }],
      },
    }],
  };
  assert.throws(
    () => TypedSceneGraphSchema.parse(graph),
    /Prop visual components must use the prop's local root coordinate system/,
  );
  graph.entities[0].visualSpec.proceduralComponents[0].attachment = "root";
  graph.entities[0].visualSpec.geometryRecipe = Array.from({ length: 100 }, () => ({
    kind: "ellipse", center: [0, 0], radius: [1, 1],
  }));
  assert.throws(
    () => TypedSceneGraphSchema.parse(graph),
    /Rendered visual spec exceeds the 100 geometry node limit/,
  );
});

test("legacy graph rendering remains deterministic across validation round-trips", () => {
  const original = load("mosquito");
  const roundTrip = validatePlan(structuredClone(original));
  for (const time of [0, 0.2, 1.35, 3.7])
    assert.equal(svgFrame(original, time), svgFrame(roundTrip, time));
});