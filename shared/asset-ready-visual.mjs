import { z } from "zod";
import {
  NodeSchema,
  ProceduralVisualComponentSchema,
  VisualAssetSourceSchema,
  VisualSpecSchema,
} from "./visual-spec-schema.mjs";
import { createGeometryComponent } from "./geometry-library.mjs";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);
const finite = z.number().finite();
const point = z.tuple([finite.min(-250).max(250), finite.min(-250).max(250)]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const interactionAnchor = z.object({
  id,
  position: point,
}).strict();
const anchorList = z.array(interactionAnchor).max(16).superRefine((anchors, ctx) => {
  const seen = new Set();
  for (const [index, anchor] of anchors.entries()) {
    if (seen.has(anchor.id))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "id"],
        message: `Duplicate interaction anchor ${anchor.id}.`,
      });
    seen.add(anchor.id);
  }
});

/**
 * A human-readable description paired with explicit, typed shape recipes.
 * The description is never interpreted as code or used to fetch an asset.
 */
export const AssetReadyVisualDescriptionSchema = z.object({
  description: z.string().min(5).max(500),
  silhouetteFamily: z.enum([
    "humanoid", "animal", "round", "rectangular", "organic", "custom-vector",
  ]).default("custom-vector"),
  normalizedDimensions: z.object({
    width: finite.min(0.001).max(2000).default(100),
    height: finite.min(0.001).max(2000).default(100),
  }).strict().default({ width: 100, height: 100 }),
  material: z.enum(["flat", "paper", "fabric", "metal", "glass", "organic", "custom"]).default("flat"),
  paint: z.object({
    fill: z.union([color, z.literal("none")]).default("none"),
    stroke: color.default("#293329"),
    outlineThickness: finite.min(0).max(20).default(1.5),
  }).strict().default({}),
  palette: z.array(color).max(16).default([]),
  geometryRecipe: z.array(NodeSchema).max(100).default([]),
  proceduralComponents: z.array(ProceduralVisualComponentSchema).max(32).default([]),
  motionAnchors: z.array(interactionAnchor).max(16).default([]),
  interactionAnchors: anchorList.default([]),
  assetSource: VisualAssetSourceSchema,
}).strict().superRefine((value, ctx) => {
  if (!value.geometryRecipe.length && !value.proceduralComponents.length)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["geometryRecipe"],
      message: "A visual description must compile to at least one safe shape recipe.",
    });
});

const countNodes = (nodes) => nodes.reduce(
  (total, node) => total + 1 + (node.children ? countNodes(node.children) : 0),
  0,
);

/**
 * Compile a structured art brief into the renderer's safe visual-spec DSL.
 * Registered procedural components are expanded once for validation and then
 * retained as rig-attached recipes; the renderer regenerates those same nodes
 * at frame time. Raster sources remain provenance-only and are not loaded.
 */
export function compileAssetReadyVisual(input) {
  const brief = AssetReadyVisualDescriptionSchema.parse(input);
  let generatedNodeCount = 0;
  for (const component of brief.proceduralComponents) {
    generatedNodeCount += countNodes(
      createGeometryComponent(component.componentId, component.options),
    );
  }
  const staticNodeCount = countNodes(brief.geometryRecipe);
  if (staticNodeCount + generatedNodeCount > 100)
    throw new TypeError("Asset-ready visual exceeds the 100 geometry node limit.");

  const visualSpec = VisualSpecSchema.parse({
    silhouetteFamily: brief.silhouetteFamily,
    normalizedDimensions: brief.normalizedDimensions,
    material: brief.material,
    paint: brief.paint,
    palette: brief.palette,
    geometryRecipe: brief.geometryRecipe,
    proceduralComponents: brief.proceduralComponents,
    motionAnchors: brief.motionAnchors,
    assetSource: brief.assetSource,
  });
  return {
    description: brief.description,
    visualSpec,
    interactionAnchors: brief.interactionAnchors,
    sourceStatus: {
      kind: brief.assetSource.kind,
      rightsStatus: brief.assetSource.rightsStatus,
      ...(brief.assetSource.assetId ? { assetId: brief.assetSource.assetId } : {}),
      ...(brief.assetSource.sha256 ? { sha256: brief.assetSource.sha256 } : {}),
      ...(brief.assetSource.sourceRef ? { sourceRef: brief.assetSource.sourceRef } : {}),
    },
  };
}