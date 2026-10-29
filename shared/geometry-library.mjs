import { z } from "zod";
import { NodeSchema } from "./visual-spec-schema.mjs";
import { PROCEDURAL_COMPONENTS } from "./visual-capability-manifest.mjs";

const point = z.tuple([z.number().finite().min(-1500).max(2000), z.number().finite().min(-1500).max(2000)]);
const positive = (max = 1500) => z.number().finite().min(0).max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const common = {
  fill: color.default("#c9b68a"),
  stroke: color.default("#293329"),
  outlineWidth: positive(20).default(1.5),
};
const withCommon = (shape) => shape.extend(common).strict();
const createRegistry = () => new Map();
const registry = createRegistry();

export function registerGeometryComponent(name, { schema, build }) {
  if (!/^[a-z][a-zA-Z0-9-]{1,48}$/.test(name) || registry.has(name))
    throw new TypeError("Geometry component names must be unique safe identifiers.");
  if (!PROCEDURAL_COMPONENTS.some((component) => component.id === name))
    throw new TypeError(`Geometry component ${name} is not registered in the visual capability manifest.`);
  if (!schema || typeof schema.parse !== "function" || typeof build !== "function")
    throw new TypeError("Geometry components require a Zod input schema and builder.");
  registry.set(name, { schema, build });
}

function addComponent(name, schema, build) {
  registerGeometryComponent(name, { schema, build });
}

const vec = (a, b) => [b[0] - a[0], b[1] - a[1]];
const length = (v) => Math.hypot(v[0], v[1]) || 1;
const normal = (v) => [-v[1] / length(v), v[0] / length(v)];
const plus = (p, v, scale = 1) => [p[0] + v[0] * scale, p[1] + v[1] * scale];
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const xy = (p) => `${Number(p[0].toFixed(3))} ${Number(p[1].toFixed(3))}`;
const solid = (fill, stroke, width) => ({ fill, stroke, width });
const group = (children, position = [0, 0], scale = [1, 1]) => ({
  kind: "group", position, scale, children,
});

addComponent("organicRound", withCommon(z.object({
  center: point.default([0, 0]),
  radius: z.tuple([positive(750), positive(750)]).default([24, 18]),
  lobes: z.number().int().min(0).max(4).default(0),
})), (o) => {
  const nodes = [{ kind: "ellipse", center: o.center, radius: o.radius, ...solid(o.fill, o.stroke, o.outlineWidth) }];
  for (let index = 0; index < o.lobes; index++) {
    const angle = (Math.PI * 2 * index) / o.lobes;
    const radius = Math.min(o.radius[0], o.radius[1]) * 0.4;
    const center = [o.center[0] + Math.cos(angle) * o.radius[0] * 0.72, o.center[1] + Math.sin(angle) * o.radius[1] * 0.72];
    nodes.push({ kind: "ellipse", center, radius: [radius, radius], ...solid(o.fill, o.stroke, o.outlineWidth) });
  }
  return nodes;
});

addComponent("taperedLimb", withCommon(z.object({
  from: point.default([0, 0]),
  to: point.default([0, 70]),
  startWidth: positive(300).default(20),
  endWidth: positive(300).default(10),
})), (o) => {
  const direction = vec(o.from, o.to);
  const perpendicular = normal(direction);
  const a1 = plus(o.from, perpendicular, o.startWidth / 2);
  const a2 = plus(o.from, perpendicular, -o.startWidth / 2);
  const b1 = plus(o.to, perpendicular, o.endWidth / 2);
  const b2 = plus(o.to, perpendicular, -o.endWidth / 2);
  const bulge = Math.min(o.startWidth, o.endWidth) * 0.2;
  const c1 = plus(midpoint(o.from, o.to), perpendicular, o.startWidth / 2 + bulge);
  const c2 = plus(midpoint(o.from, o.to), perpendicular, -o.startWidth / 2 - bulge);
  return [{
    kind: "path",
    d: `M${xy(a1)} Q${xy(c1)} ${xy(b1)} L${xy(b2)} Q${xy(c2)} ${xy(a2)} Z`,
    ...solid(o.fill, o.stroke, o.outlineWidth),
  }];
});

addComponent("rigidBox", withCommon(z.object({
  rect: z.tuple([z.number().finite().min(-1500).max(2000), z.number().finite().min(-1500).max(2000), positive(1500), positive(1500)]).default([0, 0, 80, 55]),
  cornerRadius: positive(750).default(4),
})), (o) => [{ kind: "roundedRect", rect: o.rect, cornerRadius: o.cornerRadius, ...solid(o.fill, o.stroke, o.outlineWidth) }]);

addComponent("furniturePlane", withCommon(z.object({
  origin: point.default([0, 0]),
  width: positive(1500).default(120),
  depth: positive(500).default(24),
  thickness: positive(500).default(15),
})), (o) => {
  const [x, y] = o.origin;
  const top = [{ kind: "polygon", points: [[x, y], [x + o.depth, y - o.depth * 0.35], [x + o.width + o.depth, y - o.depth * 0.35], [x + o.width, y]], ...solid(o.fill, o.stroke, o.outlineWidth) }];
  const front = { kind: "polygon", points: [[x, y], [x + o.width, y], [x + o.width, y + o.thickness], [x, y + o.thickness]], ...solid(o.fill, o.stroke, o.outlineWidth) };
  return [...top, front];
});

addComponent("curvedFood", withCommon(z.object({
  center: point.default([0, 0]),
  length: positive(500).default(100),
  thickness: positive(200).default(24),
  bend: z.number().finite().min(-200).max(200).default(18),
})), (o) => {
  const [x, y] = o.center;
  const half = o.length / 2;
  const top = y - o.thickness / 2;
  const bottom = y + o.thickness / 2;
  return [{
    kind: "path",
    d: `M${x - half} ${y} Q${x - half / 2} ${top - o.bend} ${x + half} ${top} Q${x + half * 1.15} ${y} ${x + half} ${bottom} Q${x} ${bottom + o.bend} ${x - half} ${y} Z`,
    ...solid(o.fill, o.stroke, o.outlineWidth),
  }];
});

addComponent("cylinder", withCommon(z.object({
  center: point.default([0, 0]),
  radius: positive(500).default(25),
  height: positive(1200).default(80),
})), (o) => {
  const [x, y] = o.center;
  return [
    { kind: "roundedRect", rect: [x - o.radius, y - o.height / 2, o.radius * 2, o.height], cornerRadius: Math.min(o.radius, 12), ...solid(o.fill, o.stroke, o.outlineWidth) },
    { kind: "ellipse", center: [x, y - o.height / 2], radius: [o.radius, o.radius * 0.35], ...solid(o.fill, o.stroke, o.outlineWidth) },
    { kind: "curve", curveType: "quadratic", from: [x - o.radius, y + o.height / 2], control1: [x, y + o.height / 2 + o.radius * 0.35], to: [x + o.radius, y + o.height / 2], fill: "none", stroke: o.stroke, width: o.outlineWidth },
  ];
});

addComponent("fold", withCommon(z.object({
  from: point.default([-35, 0]),
  control: point.default([0, 12]),
  to: point.default([35, 0]),
})), (o) => [{
  kind: "curve", curveType: "quadratic", from: o.from, control1: o.control, to: o.to,
  fill: "none", stroke: o.stroke, width: o.outlineWidth,
}]);

addComponent("clothContour", withCommon(z.object({
  rect: z.tuple([z.number().finite().min(-1500).max(2000), z.number().finite().min(-1500).max(2000), positive(1500), positive(1500)]).default([-40, -20, 80, 60]),
  wave: positive(100).default(8),
})), (o) => {
  const [x, y, w, h] = o.rect;
  const wave = Math.min(o.wave, h / 2);
  return [{
    kind: "path",
    d: `M${x} ${y} Q${x + w * 0.25} ${y + wave} ${x + w * 0.5} ${y} Q${x + w * 0.75} ${y - wave} ${x + w} ${y} L${x + w * 0.92} ${y + h} Q${x + w * 0.75} ${y + h - wave} ${x + w * 0.55} ${y + h} Q${x + w * 0.25} ${y + h + wave} ${x} ${y + h} Z`,
    ...solid(o.fill, o.stroke, o.outlineWidth),
  }];
});

addComponent("leafStem", withCommon(z.object({
  from: point.default([0, 40]),
  to: point.default([0, -35]),
  leafWidth: positive(160).default(22),
})), (o) => {
  const direction = vec(o.from, o.to);
  const perpendicular = normal(direction);
  const mid = plus(o.from, direction, 0.66);
  const tip = o.to;
  const leafA = plus(mid, perpendicular, o.leafWidth / 2);
  const leafB = plus(mid, perpendicular, -o.leafWidth / 2);
  const controlA = plus(midpoint(mid, tip), perpendicular, o.leafWidth / 2);
  const controlB = plus(midpoint(mid, tip), perpendicular, -o.leafWidth / 2);
  return [
    { kind: "curve", curveType: "quadratic", from: o.from, control1: plus(o.from, direction, 0.55), to: tip, fill: "none", stroke: o.stroke, width: o.outlineWidth },
    { kind: "path", d: `M${xy(mid)} Q${xy(controlA)} ${xy(tip)} Q${xy(controlB)} ${xy(mid)} Z`, ...solid(o.fill, o.stroke, o.outlineWidth) },
    { kind: "curve", curveType: "quadratic", from: mid, control1: plus(mid, direction, 0.4), to: tip, fill: "none", stroke: o.stroke, width: Math.max(0.5, o.outlineWidth * 0.65) },
    { kind: "path", d: `M${xy(leafA)} Q${xy(plus(leafA, direction, 0.4))} ${xy(tip)} Q${xy(plus(leafB, direction, 0.4))} ${xy(leafB)} Z`, ...solid(o.fill, o.stroke, o.outlineWidth) },
  ];
});

addComponent("wheelSpokes", withCommon(z.object({
  center: point.default([0, 0]),
  radius: positive(500).default(32),
  spokes: z.number().int().min(3).max(12).default(8),
})), (o) => {
  const nodes = [{ kind: "ellipse", center: o.center, radius: [o.radius, o.radius], fill: "none", stroke: o.stroke, width: o.outlineWidth }];
  for (let index = 0; index < o.spokes; index++) {
    const angle = (Math.PI * 2 * index) / o.spokes;
    const end = [o.center[0] + Math.cos(angle) * o.radius * 0.88, o.center[1] + Math.sin(angle) * o.radius * 0.88];
    nodes.push({ kind: "line", from: o.center, to: end, stroke: o.stroke, width: Math.max(0.5, o.outlineWidth * 0.7) });
  }
  nodes.push({ kind: "ellipse", center: o.center, radius: [o.radius * 0.12, o.radius * 0.12], fill: o.fill, stroke: o.stroke, width: o.outlineWidth });
  return nodes;
});

addComponent("fabricLayers", withCommon(z.object({
  rect: z.tuple([z.number().finite().min(-1500).max(2000), z.number().finite().min(-1500).max(2000), positive(1000), positive(1000)]).default([-50, -30, 100, 60]),
  layerFills: z.array(color).min(1).max(6).default(["#b98565", "#d2a17d", "#ecc7a0"]),
})), (o) => {
  const [x, y, w, h] = o.rect;
  return o.layerFills.map((fill, index) => {
    const offset = index * Math.min(8, w / (o.layerFills.length * 2));
    return {
      kind: "group", position: [0, 0], children: [{
        kind: "path",
        d: `M${x + offset} ${y + offset} Q${x + w / 2} ${y - offset} ${x + w - offset} ${y + offset} L${x + w - offset} ${y + h - offset} Q${x + w / 2} ${y + h + offset} ${x + offset} ${y + h - offset} Z`,
        ...solid(fill, o.stroke, o.outlineWidth),
      }],
    };
  });
});

addComponent("doorHinge", withCommon(z.object({
  rect: z.tuple([z.number().finite().min(-1500).max(2000), z.number().finite().min(-1500).max(2000), positive(900), positive(1500)]).default([-35, -90, 70, 180]),
  hingeCount: z.number().int().min(2).max(4).default(3),
})), (o) => {
  const [x, y, w, h] = o.rect;
  const nodes = [
    { kind: "roundedRect", rect: o.rect, cornerRadius: Math.min(4, w / 8), ...solid(o.fill, o.stroke, o.outlineWidth) },
    { kind: "line", from: [x + w * 0.72, y + 4], to: [x + w * 0.72, y + h - 4], stroke: o.stroke, width: Math.max(0.5, o.outlineWidth * 0.65) },
    { kind: "ellipse", center: [x + w * 0.55, y + h * 0.55], radius: [Math.max(1, w * 0.025), Math.max(1, w * 0.025)], fill: o.stroke, stroke: o.stroke, width: 0 },
  ];
  for (let i = 0; i < o.hingeCount; i++) {
    const hingeY = y + h * (0.18 + 0.64 * i / Math.max(1, o.hingeCount - 1));
    nodes.push({ kind: "roundedRect", rect: [x + w * 0.68, hingeY - 4, w * 0.12, 8], cornerRadius: 2, fill: "#d9d2ba", stroke: o.stroke, width: Math.max(0.5, o.outlineWidth * 0.6) });
  }
  return nodes;
});

addComponent("expressiveFace", withCommon(z.object({
  center: point.default([0, 0]),
  radius: positive(500).default(40),
  expression: z.enum(["calm", "smile", "surprise", "sad"]).default("calm"),
})), (o) => {
  const [x, y] = o.center;
  const r = o.radius;
  const nodes = [
    { kind: "ellipse", center: o.center, radius: [r, r * 1.08], ...solid(o.fill, o.stroke, o.outlineWidth) },
    { kind: "ellipse", center: [x - r * 0.34, y - r * 0.12], radius: [r * 0.09, r * 0.13], fill: o.stroke, stroke: o.stroke, width: 0 },
    { kind: "ellipse", center: [x + r * 0.34, y - r * 0.12], radius: [r * 0.09, r * 0.13], fill: o.stroke, stroke: o.stroke, width: 0 },
  ];
  const browY = y - r * 0.38;
  const browRise = o.expression === "surprise" ? -r * 0.12 : o.expression === "sad" ? r * 0.1 : 0;
  nodes.push(
    { kind: "curve", curveType: "quadratic", from: [x - r * 0.54, browY], control1: [x - r * 0.34, browY + browRise], to: [x - r * 0.14, browY], fill: "none", stroke: o.stroke, width: Math.max(1, r * 0.07) },
    { kind: "curve", curveType: "quadratic", from: [x + r * 0.14, browY], control1: [x + r * 0.34, browY + browRise], to: [x + r * 0.54, browY], fill: "none", stroke: o.stroke, width: Math.max(1, r * 0.07) },
  );
  if (o.expression === "surprise") {
    nodes.push({ kind: "ellipse", center: [x, y + r * 0.4], radius: [r * 0.13, r * 0.2], fill: "#542e2a", stroke: o.stroke, width: Math.max(0.5, o.outlineWidth * 0.6) });
  } else {
    const curve = o.expression === "smile" ? r * 0.3 : o.expression === "sad" ? -r * 0.22 : 0;
    nodes.push({ kind: "curve", curveType: "quadratic", from: [x - r * 0.32, y + r * 0.38], control1: [x, y + r * 0.38 + curve], to: [x + r * 0.32, y + r * 0.38], fill: "none", stroke: o.stroke, width: Math.max(1, r * 0.07) });
  }
  return nodes;
});

export const geometryComponentNames = Object.freeze([...registry.keys()]);
const geometryNodeCount = (items) => items.reduce(
  (count, node) => count + 1 + (node.children ? geometryNodeCount(node.children) : 0),
  0,
);

export function createGeometryComponent(name, input = {}) {
  const entry = registry.get(name);
  if (!entry) throw new RangeError(`Unknown semantic geometry component: ${name}`);
  const options = entry.schema.parse(input);
  const geometry = entry.build(options);
  const contract = PROCEDURAL_COMPONENTS.find((component) => component.id === name);
  if (!Array.isArray(geometry))
    throw new TypeError(`Geometry component ${name} returned an invalid or oversized recipe.`);
  const parsed = geometry.map((node) => NodeSchema.parse(node));
  if (geometryNodeCount(parsed) > contract.maxNodes)
    throw new TypeError(`Geometry component ${name} returned an invalid or oversized recipe.`);
  return parsed;
}

export function getGeometryComponentManifest() {
  return PROCEDURAL_COMPONENTS.map((component) => ({
    ...component,
    registered: registry.has(component.id),
  }));
}

export function composeGeometryComponents(components) {
  if (!Array.isArray(components) || components.length > 100)
    throw new TypeError("A geometry composition must be an array of at most 100 components.");
  return components.flatMap(({ name, options }) => createGeometryComponent(name, options));
}

export const geometryComponentInputSchema = (name) => registry.get(name)?.schema || null;