import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NodeSchema, VisualSpecSchema } from "../shared/visual-spec-schema.mjs";
import {
  composeGeometryComponents,
  createGeometryComponent,
  getGeometryComponentManifest,
  geometryComponentNames,
} from "../shared/geometry-library.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { svgFrame } from "../renderer/engine.mjs";
import { visualSpec as renderVisualSpec } from "../renderer/draw.mjs";

const load = (name) => validatePlan(JSON.parse(
  fs.readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8"),
));

test("bounded geometry DSL accepts implemented node kinds and safe path curves", () => {
  const nodes = [
    { kind: "path", d: "M0 0 C10 0 10 10 20 10 Q30 20 40 10 A4 5 0 0 1 48 12 Z" },
    { kind: "group", position: [2, 3], pivot: [1, 1], rotation: 20, scale: [1.2, 0.8], opacity: 0.75, children: [
      { kind: "ellipse", center: [0, 0], radius: [8, 6] },
      { kind: "roundedRect", rect: [-10, -5, 20, 10], cornerRadius: 4 },
      { kind: "polygon", points: [[0, 0], [10, 0], [5, 10]] },
      { kind: "line", from: [0, 0], to: [10, 10] },
      { kind: "curve", curveType: "cubic", from: [0, 0], control1: [2, 8], control2: [8, 8], to: [10, 0] },
    ] },
  ];
  for (const node of nodes) assert.doesNotThrow(() => NodeSchema.parse(node));
  assert.throws(() => NodeSchema.parse({ kind: "group", opacity: 1.01, children: [{ kind: "ellipse", center: [0, 0], radius: [1, 1] }] }));
  assert.throws(() => NodeSchema.parse({ kind: "group", scale: [0, 1], children: [{ kind: "ellipse", center: [0, 0], radius: [1, 1] }] }));
  assert.throws(() => NodeSchema.parse({ kind: "ellipse", center: [0, 0], radius: [1, 1], opacity: 0.5 }));
});

test("path grammar rejects injection, unsupported commands, invalid arity and unbounded geometry", () => {
  for (const d of [
    'M0 0" onload="alert(1)',
    "M0 0 E1 2",
    "M0",
    "L0 0",
    "M0 0 L999999 0",
    `M0 0 ${"L1 1 ".repeat(257)}`,
    "M0 0 A-1 2 0 0 1 4 4",
  ]) {
    assert.throws(() => NodeSchema.parse({ kind: "path", d }), `should reject ${d.slice(0, 30)}`);
  }
  assert.throws(() => NodeSchema.parse({ kind: "path", d: "M0 0", href: "https://example.test/x.svg" }));
  assert.throws(() => NodeSchema.parse({ kind: "polygon", points: [[0, 0], [1, 1]] }));
  assert.throws(() => NodeSchema.parse({ kind: "curve", curveType: "cubic", from: [0, 0], control1: [1, 2], to: [3, 4] }));
});

test("visual specs enforce cumulative node and recursive group-depth limits", () => {
  const leaf = { kind: "ellipse", center: [0, 0], radius: [1, 1] };
  assert.throws(() => VisualSpecSchema.parse({
    geometryRecipe: Array.from({ length: 50 }, () => leaf),
    facialComponents: Array.from({ length: 51 }, () => leaf),
  }), /100 geometry nodes/);
  let nested = leaf;
  for (let depth = 0; depth < 5; depth++)
    nested = { kind: "group", children: [nested] };
  assert.throws(() => NodeSchema.parse(nested));
});

test("gradients are bounded local fills and reject remote or ambiguous references", () => {
  const gradient = {
    type: "linear", start: [0, 0], end: [40, 0],
    stops: [{ offset: 0, color: "#f0a020" }, { offset: 1, color: "#2040a0", opacity: 0.8 }],
  };
  assert.doesNotThrow(() => NodeSchema.parse({ kind: "roundedRect", rect: [0, 0, 40, 20], gradient }));
  assert.throws(() => NodeSchema.parse({ kind: "line", from: [0, 0], to: [1, 1], gradient }));
  assert.throws(() => NodeSchema.parse({ kind: "ellipse", center: [0, 0], radius: [2, 2], fill: "#ffffff", gradient }));
  assert.throws(() => NodeSchema.parse({ kind: "ellipse", center: [0, 0], radius: [2, 2], gradient: { ...gradient, stops: [{ offset: 1, color: "#ffffff" }, { offset: 0, color: "#000000" }] } }));
  assert.throws(() => NodeSchema.parse({ kind: "ellipse", center: [0, 0], radius: [2, 2], fill: "url(https://example.test/x)" }));
});

test("semantic geometry registry composes reusable primitives into schema-valid recipes", () => {
  const expected = [
    "organicRound", "taperedLimb", "rigidBox", "furniturePlane", "curvedFood",
    "cylinder", "fold", "clothContour", "leafStem", "wheelSpokes",
    "fabricLayers", "doorHinge", "expressiveFace",
  ];
  for (const name of expected) {
    assert.ok(geometryComponentNames.includes(name), `missing ${name}`);
    const nodes = createGeometryComponent(name);
    assert.ok(nodes.length > 0 && nodes.length <= 100);
    for (const node of nodes) NodeSchema.parse(node);
    const countNodes = (items) => items.reduce(
      (count, item) => count + 1 + (item.children ? countNodes(item.children) : 0),
      0,
    );
    const contract = getGeometryComponentManifest().find((component) => component.id === name);
    assert.ok(countNodes(nodes) <= contract.maxNodes, `${name} exceeds its published node maximum`);
  }
  const recipe = composeGeometryComponents([
    { name: "rigidBox", options: { rect: [-40, -30, 80, 60], cornerRadius: 5, fill: "#7799aa" } },
    { name: "wheelSpokes", options: { center: [0, 35], radius: 20, spokes: 7 } },
    { name: "expressiveFace", options: { center: [0, -5], radius: 18, expression: "smile" } },
  ]);
  const spec = VisualSpecSchema.parse({ geometryRecipe: recipe });
  assert.equal(spec.geometryRecipe.length, recipe.length);
  assert.throws(() => createGeometryComponent("not-a-component"));
  assert.throws(() => createGeometryComponent("rigidBox", { rect: [0, 0, 4, 4], externalUrl: "https://example.test" }));
});

test("actual SVG frame renders gradients, bounded shape kinds and procedural recipes", () => {
  const plan = load("mosquito");
  const character = plan.characters[0];
  const recipe = composeGeometryComponents([
    { name: "furniturePlane", options: { origin: [-40, 20], width: 80, depth: 12, thickness: 9 } },
    { name: "leafStem", options: { from: [-30, 15], to: [-22, -20], fill: "#35a060" } },
    { name: "wheelSpokes", options: { center: [30, 20], radius: 12, spokes: 6, fill: "#efcc60" } },
    { name: "expressiveFace", options: { center: [0, -20], radius: 18, expression: "surprise" } },
  ]);
  character.visualSpec = VisualSpecSchema.parse({
    geometryRecipe: [
      ...recipe,
      {
        kind: "roundedRect", rect: [-35, -55, 70, 14], cornerRadius: 6,
        gradient: {
          type: "linear", start: [-35, -55], end: [35, -55],
          stops: [{ offset: 0, color: "#e05040" }, { offset: 1, color: "#f1cb45" }],
        },
      },
      { kind: "polygon", points: [[-8, 35], [0, 22], [8, 35]], fill: "#2050a0" },
      { kind: "curve", curveType: "quadratic", from: [-12, 40], control1: [0, 48], to: [12, 40], fill: "none", stroke: "#102030" },
    ],
  });
  const frame = svgFrame(validatePlan(plan), 0.5);
  assert.match(frame, /<linearGradient id="visual-/);
  assert.match(frame, /<rect[^>]+rx="6"/);
  assert.match(frame, /<polygon points=/);
  assert.match(frame, /data-visual-spec="true"/);
  assert.doesNotMatch(frame, /<script|foreignObject|(?:href|src)="(?:https?|file):|url\((?!#)/i);
  assert.ok(frame.length > 2000, "expected a substantial rendered SVG frame");
});

test("registered procedural components are versioned, bounded, and visibly attached in local space", () => {
  const plan = load("mosquito");
  const scene = plan.scenes[0];
  const cast = scene.cast[0];
  const character = plan.characters.find((item) => item.id === cast.characterId);
  character.visualSpec = {
    proceduralComponents: [
      {
        id: "capePanel",
        version: 1,
        componentId: "clothContour",
        options: {
          rect: [-35, -20, 70, 42],
          wave: 5,
          fill: "#b63f45",
          stroke: "#532c36",
        },
        attachment: "torso",
        offset: [0, 0],
        rotation: 0,
        scale: [1, 1],
        layer: "behind",
        zIndex: -2,
      },
      {
        id: "headCrest",
        componentId: "organicRound",
        options: { center: [0, 0], radius: [11, 16], fill: "#f0c84c" },
        attachment: "head",
        offset: [4, -8],
        rotation: -10,
        scale: [1, 1],
        layer: "foreground",
        zIndex: 4,
      },
    ],
  };
  cast.initialPose = { head: [8, -402], hip: [0, -160], bodyAngle: 12 };
  const validated = validatePlan(plan);
  const frame = svgFrame(validated, 0.25);
  assert.match(frame, /data-visual-component-kind="clothContour\/v1"/);
  assert.match(frame, /data-visual-component-kind="organicRound\/v1"/);
  assert.match(frame, /data-visual-attachment="torso"/);
  assert.match(frame, /data-visual-attachment="head"/);
  const backIndex = frame.indexOf('data-visual-layer="behind"');
  const actorIndex = frame.indexOf('data-character-base="true"');
  const frontIndex = frame.indexOf('data-visual-layer="foreground"');
  assert.ok(backIndex >= 0 && backIndex < actorIndex, "behind layer must precede the base character");
  assert.ok(frontIndex > actorIndex, "foreground layer must follow the base character");
  assert.match(frame, /data-visual-procedural-layer="behind" transform="translate\(/);
  assert.match(frame, /data-visual-procedural-layer="foreground" transform="translate\(/);
  assert.match(frame, /fill="#b63f45"/);
  assert.match(frame, /fill="#f0c84c"/);

  const componentTransform = frame.match(
    /data-visual-component-id="headCrest"[^>]+transform="([^"]+)"/,
  )?.[1];
  assert.ok(componentTransform);
  assert.match(componentTransform, /translate\(12 -410\) rotate\(-10\) scale\(1 1\)/);
});

test("procedural component versions/options and per-spec output complexity fail closed", () => {
  const plan = load("mosquito");
  const character = plan.characters[0];
  character.visualSpec = {
    proceduralComponents: [{
      id: "badOptions",
      componentId: "rigidBox",
      options: { externalUrl: "https://example.test/shape.svg" },
    }],
  };
  assert.throws(() => validatePlan(plan), /Invalid procedural visual component.*rigidBox\/v1/);

  character.visualSpec = {
    geometryRecipe: Array.from({ length: 100 }, () => ({
      kind: "ellipse", center: [0, 0], radius: [1, 1],
    })),
    proceduralComponents: [{
      id: "oneMore",
      componentId: "rigidBox",
      options: { rect: [0, 0, 10, 10] },
    }],
  };
  assert.throws(() => validatePlan(plan), /100 generated geometry node limit/);
  assert.throws(() => renderVisualSpec({
    geometryRecipe: Array.from({ length: 100 }, () => ({
      kind: "ellipse", center: [0, 0], radius: [1, 1],
    })),
    proceduralComponents: [{ componentId: "rigidBox", options: {} }],
  }), /100 geometry node limit/);

  character.visualSpec = {
    globalTransform: { position: [0, 0], rotation: 0, scale: [1, 1] },
    proceduralComponents: [{
      id: "floatingHead",
      componentId: "organicRound",
      attachment: "head",
      options: { radius: [5, 5] },
    }],
  };
  assert.throws(() => validatePlan(plan), /Bone-attached procedural components require the character's local transform/);
});

test("labels cannot satisfy required object support without drawable geometry", () => {
  const plan = load("mosquito");
  const scene = plan.scenes[0];
  plan.propDesigns.push({
    id: "blankCard",
    name: "Blank drawing card",
    type: "drawing",
    color: "#ffffff",
    label: "CUP",
    nodes: [],
  });
  scene.props.push({ designId: "blankCard", x: 200, y: 700, scale: 1 });
  const labelOnlyPlan = structuredClone(plan);
  delete labelOnlyPlan.requirements;
  const labelOnlyFrame = svgFrame(validatePlan(labelOnlyPlan), 0.25);
  assert.doesNotMatch(labelOnlyFrame, />CUP<\/text>/);
  plan.requirements = [{
    description: "A visible cup-shaped object is required",
    sceneId: scene.id,
    propId: "blankCard",
    label: "CUP",
  }];
  assert.throws(() => validatePlan(plan), /label alone is not object support/);

  scene.props = scene.props.filter((placement) => placement.designId !== "blankCard");
  assert.throws(() => validatePlan(plan), /Required prop is absent/);
});