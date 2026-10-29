import {SEGMENT_BONES} from "./rig.mjs";
import { z } from "zod";
import { validateSvgPathData } from "./svg-path.mjs";
import { PROCEDURAL_COMPONENTS } from "./visual-capability-manifest.mjs";
import { inspectPngDataUriHeader } from "./raster-asset-schema.mjs";

const num = z.number().finite();
const point = z.tuple([num.min(-1500).max(2000), num.min(-1500).max(2000)]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const nodeId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);
const gradient = z.object({
  type: z.literal("linear"),
  start: point,
  end: point,
  stops: z.array(z.object({
    offset: num.min(0).max(1),
    color,
    opacity: num.min(0).max(1).default(1),
  }).strict()).min(2).max(8),
}).strict().superRefine((value, ctx) => {
  let previous = -1;
  for (const [index, stop] of value.stops.entries()) {
    if (stop.offset < previous)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stops", index, "offset"], message: "Gradient stops must be ordered by offset." });
    previous = stop.offset;
  }
});
const interactionAnchor = z.object({
  id: nodeId,
  position: z.tuple([num.min(-250).max(250), num.min(-250).max(250)]),
}).strict();
const safeReference = z.string().min(1).max(512).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value),
  "Source references must not contain control characters.",
);

/**
 * Provenance is descriptive only: renderer assets are never fetched from this
 * record. Keeping rights and a stable source reference beside the recipe makes
 * future art-provider integrations auditable without enabling remote loading.
 */
export const VisualAssetSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("procedural-svg"),
    generator: z.literal("sticklaugh-safe-geometry/v1").default("sticklaugh-safe-geometry/v1"),
    rightsStatus: z.literal("original"),
  }).strict(),
  z.object({
    kind: z.literal("user-supplied"),
    assetId: nodeId,
    sourceRef: safeReference,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
    rightsStatus: z.enum(["original", "licensed", "public-domain", "unknown", "restricted"]),
  }).strict(),
  z.object({
    kind: z.literal("verified-generated"),
    assetId: nodeId,
    sourceRef: safeReference,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
    rightsStatus: z.enum(["original", "licensed", "public-domain", "unknown", "restricted"]),
    provider: z.string().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/),
    verification: z.object({
      method: z.enum(["human-review", "provider-attestation", "digest-check"]),
      evidenceRef: safeReference,
      verifiedAt: z.string().datetime({ offset: true }),
    }).strict(),
  }).strict(),
]);

export const ProceduralVisualComponentSchema = z.object({
  id: nodeId,
  version: z.literal(1).default(1),
  componentId: z.enum(PROCEDURAL_COMPONENTS.map((component) => component.id)),
  options: z.record(z.string(), z.unknown()).default({}),
  attachment: z.enum([
    "root", "head", "torso", "leftHand", "rightHand", "leftFoot", "rightFoot",
  ]).default("root"),
  offset: z.tuple([num.min(-250).max(250), num.min(-250).max(250)]).default([0, 0]),
  rotation: num.min(-360).max(360).default(0),
  scale: z.tuple([num.min(0.1).max(5), num.min(0.1).max(5)]).default([1, 1]),
  layer: z.enum(["behind", "overlay", "foreground"]).default("overlay"),
  zIndex: z.number().int().min(-1000).max(1000).default(0),
}).strict();

const PartKeySchema = z.object({
  at:num.min(0).max(60), position:point.optional(), rotation:num.min(-36000).max(36000).optional(),
  scale:z.tuple([num.min(0.01).max(20),num.min(0.01).max(20)]).optional(),
  opacity:num.min(0).max(1).optional(), easing:z.enum(["linear","smooth","hold"]).default("smooth"),
}).strict();
export const PartAnimationSchema=z.object({sceneId:nodeId.optional(),playback:z.enum(["once","loop","pingpong"]).default("once"),keys:z.array(PartKeySchema).min(2).max(48)}).strict().superRefine((v,ctx)=>{
  if(v.keys.some((k,i)=>i&&k.at<=v.keys[i-1].at))ctx.addIssue({code:"custom",message:"Part key times must strictly increase."});
  if(!v.keys.some(k=>['position','rotation','scale','opacity'].some(c=>k[c]!==undefined)))ctx.addIssue({code:"custom",message:"Part animation needs executable channels."});
});

function makeNodeSchema(depth = 0) {
  const groupFields = {
    animation:z.array(PartAnimationSchema).max(16).optional(),
    bone:z.enum(["root","head","torso","leftHand","rightHand","leftFoot","rightFoot",...SEGMENT_BONES]).optional(),
    position: point.optional(),
    pivot: point.optional(),
    rotation: num.min(-360).max(360).optional(),
    scale: z.tuple([num.min(0.1).max(5), num.min(0.1).max(5)]).optional(),
    opacity: num.min(0).max(1).optional(),
  };
  return z.object({
    id: nodeId.optional(),
    kind: z.enum(["path", "ellipse", "roundedRect", "polygon", "line", "curve", "rasterImage", "group"]),
    motion: z.enum(["flutter", "none"]).optional(),
    d: z.string().max(8000).optional(),
    dataUri: z.string().max(2_000_000).optional(),
    center: point.optional(),
    radius: z.tuple([num.min(0).max(1500), num.min(0).max(1500)]).optional(),
    rect: z.tuple([num.min(-1500).max(2000), num.min(-1500).max(2000), num.min(0).max(1500), num.min(0).max(1500)]).optional(),
    cornerRadius: num.min(0).max(750).optional(),
    points: z.array(point).min(3).max(64).optional(),
    from: point.optional(),
    to: point.optional(),
    control1: point.optional(),
    control2: point.optional(),
    curveType: z.enum(["quadratic", "cubic"]).optional(),
    fill: z.union([color, z.literal("none")]).optional(),
    gradient: gradient.optional(),
    stroke: color.optional(),
    width: num.min(0).max(20).optional(),
    paletteIndex: z.number().int().min(0).max(15).optional(),
    ...groupFields,
    children: depth < 4 ? z.array(makeNodeSchema(depth + 1)).max(100).optional() : z.never().optional(),
  }).strict().superRefine((node, ctx) => {
    const add = (field, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    if (node.kind === "group") {
      if (!node.children?.length) add("children", "Groups require at least one child node.");
      if (node.d !== undefined || node.dataUri !== undefined || node.center !== undefined || node.radius !== undefined || node.rect !== undefined || node.cornerRadius !== undefined || node.points !== undefined || node.from !== undefined || node.to !== undefined || node.control1 !== undefined || node.control2 !== undefined || node.curveType !== undefined || node.fill !== undefined || node.gradient !== undefined || node.stroke !== undefined || node.width !== undefined || node.motion !== undefined || node.paletteIndex !== undefined)
        add("kind", "Groups may contain transforms and children only.");
      return;
    }
    if (node.animation !== undefined || node.bone !== undefined || node.children !== undefined || node.position !== undefined || node.pivot !== undefined || node.rotation !== undefined || node.scale !== undefined || node.opacity !== undefined)
      add("kind", "Only group nodes may contain children or transforms.");
    const required = {
      path: ["d"],
      ellipse: ["center", "radius"],
      roundedRect: ["rect"],
      rasterImage: ["rect", "dataUri"],
      polygon: ["points"],
      line: ["from", "to"],
      curve: ["from", "to", "control1", "curveType"],
    }[node.kind] || [];
    for (const field of required)
      if (node[field] === undefined) add(field, `${node.kind} nodes require ${field}.`);
    const allowed = {
      path: ["d"],
      ellipse: ["center", "radius"],
      roundedRect: ["rect", "cornerRadius"],
      rasterImage: ["rect", "dataUri"],
      polygon: ["points"],
      line: ["from", "to"],
      curve: ["from", "to", "control1", "control2", "curveType"],
    }[node.kind] || [];
    const geometryFields = ["d", "dataUri", "center", "radius", "rect", "cornerRadius", "points", "from", "to", "control1", "control2", "curveType"];
    for (const field of geometryFields)
      if (node[field] !== undefined && !allowed.includes(field))
        add(field, `${field} is not valid for ${node.kind} nodes.`);
    if (node.kind === "path" && node.d !== undefined && !validateSvgPathData(node.d).valid)
      add("d", `Path data is outside the safe SVG path grammar: ${validateSvgPathData(node.d).reason}.`);
    if (node.kind === "rasterImage" && node.dataUri !== undefined) {
      if (node.rect && (node.rect[2] <= 0 || node.rect[3] <= 0))
        add("rect", "Raster image dimensions must be positive.");
      if (node.fill !== undefined || node.gradient !== undefined || node.stroke !== undefined || node.width !== undefined || node.motion !== undefined || node.paletteIndex !== undefined)
        add("kind", "Raster image nodes accept only image data and positive rectangle geometry.");
      try {
        inspectPngDataUriHeader(node.dataUri);
      } catch (error) {
        add("dataUri", error.message);
      }
    }
    if (node.kind === "curve") {
      if (node.curveType === "cubic" && node.control2 === undefined) add("control2", "Cubic curves require control2.");
      if (node.curveType === "quadratic" && node.control2 !== undefined) add("control2", "Quadratic curves do not accept control2.");
    }
    if (node.gradient && (node.kind === "line" || node.kind === "curve"))
      add("gradient", "Linear gradients are supported only as fills on closed shapes.");
    if (node.gradient && node.fill !== undefined)
      add("gradient", "Specify either a solid fill or a gradient, not both.");
  });
}

export const NodeSchema = makeNodeSchema();
const VisualTransformSchema = z.object({
  position: point.default([0, 0]),
  rotation: num.min(-360).max(360).default(0),
  scale: z.tuple([num.min(0.01).max(100), num.min(0.01).max(100)]).default([1, 1]),
}).strict();
const VisualNodeListSchema = z.array(NodeSchema).max(100).default([]);

export const VisualSpecSchema = z.object({
  renderMode:z.enum(["overlay","replace"]).optional(),
  silhouetteFamily: z.enum([
    "humanoid", "animal", "round", "rectangular", "organic", "custom-vector",
  ]).default("custom-vector"),
  geometryRecipe: VisualNodeListSchema,
  normalizedDimensions: z.object({
    width: num.min(0.001).max(2000).default(100),
    height: num.min(0.001).max(2000).default(100),
  }).strict().default({ width: 100, height: 100 }),
  material: z.enum(["flat", "paper", "fabric", "metal", "glass", "organic", "custom"]).default("flat"),
  paint: z.object({
    fill: z.union([color, z.literal("none")]).default("none"),
    stroke: color.default("#293329"),
    outlineThickness: num.min(0).max(20).default(1.5),
  }).strict().default({}),
  palette: z.array(color).max(16).default([]),
  facialComponents: VisualNodeListSchema,
  apparel: VisualNodeListSchema,
  accessories: VisualNodeListSchema,
  decorativeMarks: VisualNodeListSchema,
  proceduralComponents: z.array(ProceduralVisualComponentSchema).max(32).default([]),
  motionAnchors: z.array(interactionAnchor).max(16).default([]),
  assetSource: VisualAssetSourceSchema.optional(),
  zIndex: z.number().int().min(-1000).max(1000).default(0),
  localTransform: VisualTransformSchema.optional(),
  globalTransform: VisualTransformSchema.optional(),
}).strict().superRefine((spec, ctx) => {
  if (spec.localTransform && spec.globalTransform)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["globalTransform"],
      message: "Visual specs may use a local or global transform, not both.",
    });
  if (
    spec.globalTransform &&
    spec.proceduralComponents.some((component) => component.attachment !== "root")
  )
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["globalTransform"],
      message: "Bone-attached procedural components require the character's local transform.",
    });
  const componentIds = new Set();
  for (const [index, component] of spec.proceduralComponents.entries()) {
    if (componentIds.has(component.id))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proceduralComponents", index, "id"],
        message: `Duplicate procedural visual component id ${component.id}.`,
      });
    componentIds.add(component.id);
  }
  const lists = [
    "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
  ];
  const allNodes = lists.flatMap((key) => spec[key]);
  const countNodes = (items) => items.reduce(
    (count, item) => count + 1 + (item.children ? countNodes(item.children) : 0),
    0,
  );
  if (countNodes(allNodes) > 100)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["geometryRecipe"],
      message: "A visual spec may contain at most 100 geometry nodes across all components.",
    });
  const checkPalette = (items, path = []) => {
    for (const [index, item] of items.entries()) {
      if (item.paletteIndex !== undefined && item.paletteIndex >= spec.palette.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, index, "paletteIndex"],
          message: "paletteIndex must refer to an entry in this visual spec's palette.",
        });
      if (item.children) checkPalette(item.children, [...path, index, "children"]);
    }
  };
  for (const key of lists) checkPalette(spec[key], [key]);
});