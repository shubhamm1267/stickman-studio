import { z } from "zod";
import { VisualSpecSchema } from "./visual-spec-schema.mjs";
import { createGeometryComponent } from "./geometry-library.mjs";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);
const point = z.tuple([z.number().finite(), z.number().finite()]);
const transformPosition = z.tuple([
  z.number().finite().min(-100000).max(100000),
  z.number().finite().min(-100000).max(100000),
]);
const scale = z.tuple([
  z.number().finite().min(0.0001).max(100),
  z.number().finite().min(0.0001).max(100),
]);
const transform = z.object({
  position: transformPosition,
  rotation: z.number().finite().min(-7200).max(7200),
  scale,
}).strict();
const bounds = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).strict();
const layering = z.object({
  band: z.enum(["background", "surface", "shadow", "back", "world", "character", "effect", "front", "camera"]),
  zIndex: z.number().int().min(-20000).max(20000),
}).strict();
const common = z.object({
  id,
  visible: z.boolean(),
  transform,
  layering,
  bounds,
  supportedInteractions: z.array(z.string().min(1).max(64)).max(64),
  entityRefs: z.array(id).max(64).optional(),
}).strict();
const CharacterPoseSchema = z.object({
  head: point,
  hip: point,
  leftHand: point,
  rightHand: point,
  leftFoot: point,
  rightFoot: point,
  emotion: z.string().min(1).max(40),
  facing: z.union([z.literal(-1), z.literal(1)]),
}).strict();
const PropPoseSchema = z.object({ angle: z.number().finite(), open: z.number().finite().min(0).max(1) }).strict();
const EffectKindSchema = z.enum(["wind", "fall", "landing", "impact", "paperBurst", "stink"]);

export const CharacterEntitySchema = common.extend({
  category: z.literal("character"),
  sourceId: id,
  pose: CharacterPoseSchema,
  visualSpec: VisualSpecSchema.optional(),
}).strict();
export const PropEntitySchema = common.extend({
  category: z.literal("prop"),
  sourceId: id,
  designId: id,
  pose: PropPoseSchema,
  visualSpec: VisualSpecSchema.optional(),
}).strict();
export const EnvironmentEntitySchema = common.extend({
  category: z.literal("environment"),
  pose: z.object({ background: z.enum(["hospital", "toiletEntrance", "kitchen", "park", "street", "gym", "room", "office", "bathroom", "custom"]) }).strict(),
}).strict();
export const SurfaceEntitySchema = common.extend({
  category: z.literal("surface"),
  pose: z.object({ surfaceType: z.literal("ground"), elevation: z.number().finite() }).strict(),
}).strict();
export const CameraTargetEntitySchema = common.extend({
  category: z.literal("cameraTarget"),
  sourceId: id,
  pose: z.object({ focus: point, zoom: z.number().finite().positive() }).strict(),
}).strict();
export const EffectEntitySchema = common.extend({
  category: z.literal("effect"),
  sourceId: id,
  pose: z.object({ kind: EffectKindSchema, origin: point, phase: z.number().finite(), amount: z.number().finite().nonnegative() }).strict(),
}).strict();
export const ShadowEntitySchema = common.extend({
  category: z.literal("shadow"),
  sourceId: id,
  pose: z.object({ groundY: z.number().finite(), height: z.number().finite().nonnegative() }).strict(),
}).strict();

export const SceneGraphEntitySchema = z.discriminatedUnion("category", [
  CharacterEntitySchema,
  PropEntitySchema,
  EnvironmentEntitySchema,
  SurfaceEntitySchema,
  CameraTargetEntitySchema,
  EffectEntitySchema,
  ShadowEntitySchema,
]);
export const TypedSceneGraphSchema = z.object({
  version: z.literal(1),
  sceneId: id,
  time: z.number().finite().nonnegative(),
  entities: z.array(SceneGraphEntitySchema).max(300),
}).strict().superRefine((graph, ctx) => {
  const seen = new Set();
  const entitiesById = new Map();
  const layerBands = {
    environment: new Set(["background"]),
    surface: new Set(["surface"]),
    shadow: new Set(["shadow"]),
    character: new Set(["character"]),
    prop: new Set(["back", "world", "front"]),
    effect: new Set(["effect", "front"]),
    cameraTarget: new Set(["camera"]),
  };
  for (const [index, entity] of graph.entities.entries()) {
    if (seen.has(entity.id))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["entities", index, "id"], message: `Duplicate scene graph entity id ${entity.id}.` });
    seen.add(entity.id);
    entitiesById.set(entity.id, entity);
    if (!layerBands[entity.category]?.has(entity.layering.band))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", index, "layering", "band"],
        message: `Invalid layer relationship: ${entity.category} entities cannot use the ${entity.layering.band} band.`,
      });
    const referenceIds = new Set();
    for (const [referenceIndex, targetId] of (entity.entityRefs || []).entries()) {
      if (referenceIds.has(targetId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "entityRefs", referenceIndex],
          message: `Duplicate entity reference ${targetId} on ${entity.id}.`,
        });
      referenceIds.add(targetId);
    }
    const spec = entity.visualSpec;
    if (!spec) continue;
    if (entity.layering.zIndex !== spec.zIndex)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", index, "layering", "zIndex"],
        message: "Scene graph zIndex must match the rendered visual spec.",
      });
    const componentIds = new Set();
    let generatedNodes = 0;
    const countNodes = (nodes) => nodes.reduce(
      (count, node) => count + 1 + (node.children ? countNodes(node.children) : 0),
      0,
    );
    for (const [componentIndex, component] of (spec.proceduralComponents || []).entries()) {
      if (componentIds.has(component.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "visualSpec", "proceduralComponents", componentIndex, "id"],
          message: `Duplicate procedural visual component id ${component.id}.`,
        });
      componentIds.add(component.id);
      if (entity.category === "prop" && component.attachment !== "root")
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "visualSpec", "proceduralComponents", componentIndex, "attachment"],
          message: "Prop visual components must use the prop's local root coordinate system.",
        });
      try {
        generatedNodes += countNodes(createGeometryComponent(component.componentId, component.options));
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "visualSpec", "proceduralComponents", componentIndex],
          message: `Unsupported procedural component ${component.componentId}/v${component.version}: ${error.message}`,
        });
      }
    }
    const staticNodes = [
      "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
    ].reduce((count, key) => count + countNodes(spec[key] || []), 0);
    if (staticNodes + generatedNodes > 100)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", index, "visualSpec"],
        message: "Rendered visual spec exceeds the 100 geometry node limit.",
      });
  }
  for (const [index, entity] of graph.entities.entries()) {
    for (const [referenceIndex, targetId] of (entity.entityRefs || []).entries()) {
      if (!entitiesById.has(targetId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "entityRefs", referenceIndex],
          message: `Entity ${entity.id} references missing entity ${targetId}.`,
        });
    }
  }
  const states = new Map();
  const stack = [];
  const visit = (entity) => {
    if (states.get(entity.id) === 2) return;
    if (states.get(entity.id) === 1) {
      const cycleStart = stack.indexOf(entity.id);
      const cycle = [...stack.slice(cycleStart), entity.id].join(" -> ");
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities"],
        message: `Circular entity references are not allowed: ${cycle}.`,
      });
      return;
    }
    states.set(entity.id, 1);
    stack.push(entity.id);
    for (const targetId of entity.entityRefs || []) {
      const target = entitiesById.get(targetId);
      if (target) visit(target);
    }
    stack.pop();
    states.set(entity.id, 2);
  };
  for (const entity of graph.entities) visit(entity);
});

const PROP_EXTENTS = Object.freeze({
  cap: [-110, -80, 220, 115], can: [-28, -50, 56, 100], bottle: [-30, -72, 60, 125],
  banana: [-55, -42, 110, 80], peel: [-55, -20, 110, 65], dustbin: [-75, -180, 155, 200],
  sign: [-95, -35, 190, 70], rubberDuck: [-52, -65, 105, 90], headphones: [-85, -125, 170, 165],
  gasMask: [-65, -40, 130, 100], newspaper: [-100, -115, 200, 220], jar: [-40, -45, 80, 95],
  cup: [-30, -48, 60, 75], table: [-85, -10, 170, 210], bench: [-75, -75, 155, 145],
  dumbbell: [-70, -40, 140, 80], balloon: [-40, -10, 80, 170], car: [-90, -40, 180, 100],
  chair: [-70, -130, 140, 245], toilet: [-70, -80, 145, 190], paperRoll: [-40, -40, 80, 110],
  door: [-150, -240, 300, 490], drawing: [-110, -110, 220, 220],
});
const BACKGROUND_FURNITURE = new Set(["table", "bench", "chair", "toilet", "door", "dustbin", "sign"]);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const rotate = ([x, y], angle) => {
  const r = angle * Math.PI / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
function boxAt(position, extents, angle = 0, factor = 1) {
  const [left, top, width, height] = extents;
  const corners = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]]
    .map((p) => rotate([p[0] * factor, p[1] * factor], angle).map((v, i) => v + position[i]));
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
function mergeBounds(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
function actorBounds(state, isAnimal) {
  const [x, y] = state.position, factor = state.scale;
  if (isAnimal) return boxAt([x, y], [-145, -265, 290, 315], state.bodyAngle || 0, factor);
  const points = [state.head, state.hip, state.leftHand, state.rightHand, state.leftFoot, state.rightFoot];
  const world = points.map((p) => rotate(p, state.bodyAngle || 0).map((v, i) => v * factor + [x, y][i]));
  const xs = world.map((p) => p[0]), ys = world.map((p) => p[1]), margin = 125 * factor;
  const left = Math.min(...xs) - margin, top = Math.min(...ys) - margin;
  return { x: left, y: top, width: Math.max(...xs) + margin - left, height: Math.max(...ys) + margin - top };
}
function specBounds(spec, basePosition, baseAngle, baseScale, current) {
  if (!spec) return current;
  const local = spec.localTransform;
  const position = spec.globalTransform?.position || (
    local
      ? rotate([local.position[0] * baseScale[0], local.position[1] * baseScale[1]], baseAngle)
        .map((value, index) => value + basePosition[index])
      : basePosition
  );
  const angle = spec.globalTransform?.rotation ?? (baseAngle + (local?.rotation || 0));
  const s = spec.globalTransform?.scale || [baseScale[0] * (local?.scale[0] || 1), baseScale[1] * (local?.scale[1] || 1)];
  const dims = {
    width: spec.normalizedDimensions?.width ?? 100,
    height: spec.normalizedDimensions?.height ?? 100,
  };
  const specBox = boxAt(position, [-dims.width / 2, -dims.height / 2, dims.width, dims.height], angle, Math.max(s[0], s[1]));
  return mergeBounds(current, specBox);
}
function entityId(candidate, fallback) {
  return candidate || fallback;
}
function boundedId(base, suffix) {
  const tail = `_${suffix}`;
  return `${String(base).slice(0, 41 - tail.length)}${tail}`;
}
function uniqueId(base, used) {
  let value = base.slice(0, 41), index = 2;
  while (used.has(value)) {
    const tail = `_${index++}`;
    value = `${base.slice(0, 41 - tail.length)}${tail}`;
  }
  used.add(value);
  return value;
}
function zIndex(spec) { return spec?.zIndex || 0; }

/** Build and validate the deterministic renderer-facing typed graph for one frame. */
export function compileSceneGraph({ plan, scene, time, states, props, effects, shot, camera = null }) {
  const actorsVisible = (cast) => !shot.actorIds || shot.actorIds.includes(cast.characterId);
  const reserved = new Set();
  const envId = uniqueId(boundedId(scene.id, "env"), reserved);
  const surfaceId = uniqueId(boundedId(scene.id, "ground"), reserved);
  const entities = [
    {
      id: envId, category: "environment", visible: true,
      transform: { position: [0, 0], rotation: 0, scale: [1, 1] },
      layering: { band: "background", zIndex: -10000 },
      bounds: { x: -1200, y: 200, width: 2900, height: 600 },
      pose: { background: scene.background }, supportedInteractions: [],
    },
    {
      id: surfaceId, category: "surface", visible: true,
      transform: { position: [0, 788], rotation: 0, scale: [1, 1] },
      layering: { band: "surface", zIndex: -9000 },
      bounds: { x: -1200, y: 782, width: 2900, height: 12 },
      pose: { surfaceType: "ground", elevation: 788 }, supportedInteractions: [],
    },
  ];
  const focus = camera?.focus || shot.focus;
  const zoom = camera?.zoom || shot.zoom;
  const cameraId = uniqueId(boundedId(scene.id, "cam"), reserved);
  entities.push({
    id: cameraId, category: "cameraTarget", sourceId: entityId(shot.id, cameraId), visible: true,
    transform: { position: [...focus], rotation: 0, scale: [zoom, zoom] },
    layering: { band: "camera", zIndex: 20000 },
    bounds: { x: focus[0], y: focus[1], width: 0, height: 0 },
    pose: { focus: [...focus], zoom }, supportedInteractions: ["focus", "zoom"],
  });

  const cast = [...scene.cast].sort((a, b) => a.characterId.localeCompare(b.characterId));
  for (const entry of cast) {
    const state = states[entry.characterId], design = plan.characters.find((item) => item.id === entry.characterId);
    const spec = design.visualSpec;
    const isAnimal = ["dog", "cat", "lion"].includes(design.kind);
    const bounds = specBounds(spec, state.position, state.bodyAngle || 0, [state.scale, state.scale], actorBounds(state, isAnimal));
    const characterEntityId = uniqueId(entry.characterId, reserved);
    entities.push({
      id: characterEntityId, sourceId: entry.characterId, category: "character", visible: actorsVisible(entry),
      transform: { position: [...state.position], rotation: finite(state.bodyAngle), scale: [state.scale, state.scale] },
      layering: { band: "character", zIndex: zIndex(spec) }, bounds,
      pose: {
        head: [...state.head], hip: [...state.hip], leftHand: [...state.leftHand], rightHand: [...state.rightHand],
        leftFoot: [...state.leftFoot], rightFoot: [...state.rightFoot], emotion: state.face || "neutral", facing: state.facing,
      },
      supportedInteractions: [...new Set(scene.beats.filter((beat) => beat.actorId === entry.characterId).map((beat) => beat.kind))],
      ...(spec ? { visualSpec: spec } : {}),
    });
    if (entry.shadow !== false && state.shadow !== false && shot.detail !== "hands") {
      const shadowRadius = isAnimal ? 95 : 60;
      const shadowBounds = boxAt([state.position[0], state.groundY + 5], [-shadowRadius, -5, shadowRadius * 2, 10], 0, state.scale);
      entities.push({
        id: uniqueId(boundedId(entry.characterId, "shadow"), reserved), sourceId: entry.characterId, category: "shadow", visible: actorsVisible(entry),
        transform: { position: [state.position[0], state.groundY + 5], rotation: 0, scale: [state.scale, state.scale] },
        layering: { band: "shadow", zIndex: -8000 }, bounds: shadowBounds,
        pose: { groundY: state.groundY, height: Math.max(0, state.groundY - state.position[1]) }, supportedInteractions: [],
      });
    }
  }

  const designCounts = new Map();
  for (const placement of scene.props)
    designCounts.set(placement.designId, (designCounts.get(placement.designId) || 0) + 1);
  const designOccurrences = new Map();
  for (const [index, placement] of scene.props.entries()) {
    const state = props[placement.designId], design = plan.propDesigns.find((item) => item.id === placement.designId);
    const occurrence = (designOccurrences.get(placement.designId) || 0) + 1;
    designOccurrences.set(placement.designId, occurrence);
    const stableFallback = designCounts.get(placement.designId) === 1
      ? placement.designId
      : `${placement.designId}_${occurrence}`;
    const idValue = uniqueId(entityId(placement.id, stableFallback), reserved);
    const active = time >= (placement.appearAt ?? 0) && time < (placement.disappearAt ?? Infinity) && !state.containedBy;
    const ownerVisible = !state.owner || !shot.actorIds || shot.actorIds.includes(state.owner.actorId);
    const extents = PROP_EXTENTS[design.type] || PROP_EXTENTS.drawing;
    const baseBounds = boxAt(state.position, extents, state.angle || 0, state.scale);
    const visualBounds = specBounds(design.visualSpec, state.position, state.angle || 0, [state.scale, state.scale], baseBounds);
    const band = placement.layer === "front"
      ? "front"
      : placement.layer === "back" || BACKGROUND_FURNITURE.has(design.type)
        ? "back"
        : "world";
    entities.push({
      id: idValue, sourceId: placement.designId, designId: placement.designId, category: "prop", visible: active && ownerVisible,
      transform: { position: [...state.position], rotation: finite(state.angle), scale: [state.scale, state.scale] },
      layering: { band, zIndex: zIndex(design.visualSpec) }, bounds: visualBounds,
      pose: { angle: finite(state.angle), open: finite(state.open) },
      supportedInteractions: [...new Set(scene.beats.filter((beat) => beat.targetId === placement.designId).map((beat) => beat.kind))],
      ...(design.visualSpec ? { visualSpec: design.visualSpec } : {}),
    });
  }
  for (const [index, effect] of effects.entries()) {
    const idValue = uniqueId(`${effect.kind}_${index + 1}`, reserved);
    const radius = effect.kind === "impact" ? 110 : effect.kind === "paperBurst" ? 180 : 100;
    const origin = effect.origin;
    entities.push({
      id: idValue, sourceId: idValue, category: "effect", visible: true,
      transform: { position: [...origin], rotation: 0, scale: [Math.max(0.01, effect.amount || 1), Math.max(0.01, effect.amount || 1)] },
      layering: { band: effect.kind === "impact" ? "front" : "effect", zIndex: effect.kind === "impact" ? 9000 : 1000 },
      bounds: { x: origin[0] - radius, y: origin[1] - radius, width: radius * 2, height: radius * 2 },
      pose: { kind: effect.kind, origin: [...origin], phase: finite(effect.phase), amount: Math.max(0, finite(effect.amount, 1)) },
      supportedInteractions: [],
    });
  }
  const graph = TypedSceneGraphSchema.parse({ version: 1, sceneId: scene.id, time, entities });
  return graph;
}

export function getSceneEntity(graph, category, idValue) {
  return graph.entities.find((entity) => entity.category === category && entity.id === idValue) || null;
}
