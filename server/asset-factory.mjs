import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { compileAssetReadyVisual } from "../shared/asset-ready-visual.mjs";
import { canonicalizePlan, storyIRToPlan, validateStoryIR } from "../shared/canonical-story-ir.mjs";
import { validatePlan } from "../shared/schema.mjs";
import { NodeSchema, VisualSpecSchema } from "../shared/visual-spec-schema.mjs";
import { inspectTransparentPng } from "../shared/raster-asset.mjs";
import { evaluate } from "../renderer/engine.mjs";
import { effect as renderEffect } from "../renderer/draw.mjs";
import { compileSceneGraph } from "../shared/scene-graph.mjs";
import { proceduralAssetProvider, discoverAssetProviders, VISUAL_BRIEF_EXAMPLES } from "./asset-providers.mjs";

const PIPELINE_VERSION = "sticklaugh.asset-factory/v1";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value) => sha256(typeof value === "string" ? value : stable(value));
const semanticId = (storyId, kind, sourceId) => `sem_${sha256(`${storyId}/${kind}/${sourceId}`).slice(0, 32)}`;
const assetId = (value) => `asset_sha256_${digest(value)}`;
const color = "#293329";

const ACTOR_RIG = Object.freeze({
  man: "sticklaugh.rig.humanoid-man.v2", woman: "sticklaugh.rig.humanoid-woman.v2",
  grandma: "sticklaugh.rig.humanoid-grandma.v2", child: "sticklaugh.rig.humanoid-child.v2",
  dog: "sticklaugh.rig.animal-dog.v1", cat: "sticklaugh.rig.animal-cat.v1", lion: "sticklaugh.rig.animal-lion.v1",
});
const SHAPE_FAMILY = Object.freeze({
  banana: "organic-food", peel: "organic-food", can: "beverage-container", bottle: "beverage-container",
  cup: "beverage-container", jar: "beverage-container", car: "vehicle", chair: "furniture", bench: "furniture",
  table: "furniture", sign: "sign-or-brand", cap: "wearable", headphones: "wearable", gasMask: "wearable",
  drawing: "custom-vector", toilet: "household-object", paperRoll: "household-object", newspaper: "printed-paper",
  dustbin: "household-object", rubberDuck: "animal-or-toy", balloon: "round-object", dumbbell: "fitness-object",
  phone: "electronics", door: "architecture",
});
const rendererForProp = (design) => design.type === "drawing"
  ? "sticklaugh.render.vector-nodes/v1"
  : `sticklaugh.render.prop.${design.type}/v1`;

function structuredVisualBrief({ kind, description, silhouetteFamily, features = [], dominantColor, secondaryColor, material = "flat", printedText = null, facing = "front", pivots = [], motion = [] }) {
  return {
    schemaVersion: 1, semanticClass: `${kind}.${silhouetteFamily}`,
    description: String(description || "Renderer-backed visual asset").slice(0, 500),
    shapeLanguage: "StickLaugh 2D cartoon; preserve a readable silhouette",
    outlineStyle: "registered renderer outline; dark uniform stroke when applicable",
    colors: { dominant: dominantColor || "#a2b6a6", secondary: secondaryColor || "#f6f1da" },
    proportions: { width: 100, height: 100, source: "normalized renderer-local design box" },
    material,
    identifiableAttributes: [...new Set(features.map(String))].slice(0, 20),
    printedTextLogo: { text: printedText, logo: null, optional: !printedText },
    viewFacing: { primaryView: "front", facing, sideBackPolicy: "use registered renderer view; do not invent unseen back-side details" },
    pivotPoints: [{ id: "root", position: [0, 0] }, ...pivots.filter((item) => item?.id && Array.isArray(item.position)).slice(0, 15)],
    occlusionLayers: [{ id: "behind", order: 0 }, { id: "base", order: 1 }, { id: "overlay", order: 2 }, { id: "foreground", order: 3 }],
    desiredMotionAffordances: [...new Set(motion.map(String))].slice(0, 20),
  };
}

function constructionManifest({ kind, tier, visualSpec, rendererId, rigInteractionManifest, sourceStatus }) {
  const sourceKind = sourceStatus?.kind || (visualSpec ? "validated-vector-spec" : "registered-renderer");
  const dimensions = visualSpec?.normalizedDimensions || { width: 100, height: 100 };
  const attachmentAnchors = [...(rigInteractionManifest?.interactionAnchors || []), ...(rigInteractionManifest?.visualMotionAnchors || [])];
  const alphaMask = sourceKind === "user-supplied" && visualSpec?.assetSource?.mediaType === "image/png"
    ? { status: "validated-pixel-alpha", source: "CRC-checked RGBA PNG" }
    : sourceKind === "user-supplied"
      ? { status: "validated-vector-alpha", source: "restricted safe SVG geometry" }
      : visualSpec
        ? { status: "geometry-derived", source: "validated transparent vector/raster recipe" }
        : { status: "renderer-output", source: "transparent SVG render frame" };
  return {
    geometry: { sourceKind, rendererId, validation: "pass", visibleGeometry: true, geometryNodeCount: visualSpec?.geometryRecipe?.length ?? null },
    bounds: { coordinateSpace: "renderer-local-normalized", rect: [-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height] },
    alphaMask,
    contactPoint: { anchorId: attachmentAnchors.find((anchor) => anchor.id === "contact")?.id || "root", position: attachmentAnchors.find((anchor) => anchor.id === "contact")?.position || [0, 0] },
    shadowContact: kind === "character"
      ? { policy: "scene-graph-ground-shadow", verifiedRendererFeature: true }
      : { policy: "contact point for placement; native prop renderer does not guarantee a separate drop shadow", verifiedRendererFeature: false },
    attachmentAnchors,
    sideBackViewPolicy: "registered renderer view only; preserve silhouette and do not fabricate unseen details",
    animationLayers: [{ id: "behind", rendererLayer: "behind" }, { id: "base", rendererLayer: "native-base-art" }, { id: "overlay", rendererLayer: "overlay" }, { id: "foreground", rendererLayer: "foreground" }],
    fallbackBehavior: tier === "B"
      ? "Reject imported art if digest, rights, alpha or geometry validation fails; keep the registered native renderer."
      : "Keep registered renderer and procedural geometry; disclose unsupported appearance or motion instead of substituting a label or oval.",
  };
}

function numberList(text, count) {
  const values = String(text || "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length !== count || values.some((value) => !Number.isFinite(value))) throw new TypeError("SVG geometry must use finite numeric attributes.");
  return values;
}
function attributes(text) {
  const out = {};
  let rest = text.trim();
  const pattern = /^([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*/;
  while (rest) {
    const match = rest.match(pattern);
    if (!match) throw new TypeError("SVG attributes must be quoted and well-formed.");
    if (Object.hasOwn(out, match[1])) throw new TypeError(`SVG repeats attribute ${match[1]}.`);
    out[match[1]] = match[2] ?? match[3];
    rest = rest.slice(match[0].length);
  }
  return out;
}
function requireAttrs(attrs, allowed, required) {
  for (const key of Object.keys(attrs)) if (!allowed.includes(key)) throw new TypeError(`SVG attribute ${key} is not in the safe import allowlist.`);
  for (const key of required) if (attrs[key] === undefined) throw new TypeError(`SVG geometry requires ${key}.`);
}
function svgNode(tag, text) {
  const a = attributes(text);
  const common = ["fill", "stroke", "stroke-width"];
  const fillStroke = () => ({
    ...(a.fill === undefined ? {} : { fill: a.fill }),
    ...(a.stroke === undefined || a.stroke === "none" ? {} : { stroke: a.stroke }),
    ...(a["stroke-width"] === undefined && a.stroke !== "none" ? {} : { width: a.stroke === "none" ? 0 : Number(a["stroke-width"]) }),
  });
  if (tag === "rect") {
    requireAttrs(a, ["x", "y", "width", "height", "rx", ...common], ["x", "y", "width", "height"]);
    const rect = numberList(`${a.x} ${a.y} ${a.width} ${a.height}`, 4);
    return NodeSchema.parse({ kind: "roundedRect", rect, ...(a.rx === undefined ? {} : { cornerRadius: Number(a.rx) }), ...fillStroke() });
  }
  if (tag === "ellipse" || tag === "circle") {
    requireAttrs(a, ["cx", "cy", "rx", "ry", "r", ...common], ["cx", "cy", tag === "circle" ? "r" : "rx"]);
    const radius = tag === "circle" ? [Number(a.r), Number(a.r)] : [Number(a.rx), Number(a.ry)];
    return NodeSchema.parse({ kind: "ellipse", center: numberList(`${a.cx} ${a.cy}`, 2), radius, ...fillStroke() });
  }
  if (tag === "line") {
    requireAttrs(a, ["x1", "y1", "x2", "y2", "stroke", "stroke-width"], ["x1", "y1", "x2", "y2"]);
    return NodeSchema.parse({ kind: "line", from: numberList(`${a.x1} ${a.y1}`, 2), to: numberList(`${a.x2} ${a.y2}`, 2), ...fillStroke() });
  }
  if (tag === "polygon") {
    requireAttrs(a, ["points", ...common], ["points"]);
    const values = a.points.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.length < 6 || values.length > 128 || values.length % 2 || values.some((value) => !Number.isFinite(value))) throw new TypeError("SVG polygon requires 3–64 finite points.");
    const points = [];
    for (let i = 0; i < values.length; i += 2) points.push([values[i], values[i + 1]]);
    return NodeSchema.parse({ kind: "polygon", points, ...fillStroke() });
  }
  requireAttrs(a, ["d", ...common], ["d"]);
  return NodeSchema.parse({ kind: "path", d: a.d, ...fillStroke() });
}

/** Convert a deliberately small, non-executable SVG subset into checked renderer geometry. */
export function importSafeSvg(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || "");
  if (bytes.length < 32 || bytes.length > 1_500_000) throw new TypeError("SVG asset must be between 32 bytes and 1.5 MB.");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|<image\b|<use\b|<filter\b|<style\b|\bon[a-z]+\s*=|href\s*=|url\s*\(/i.test(source))
    throw new TypeError("SVG contains executable, external, or unsupported content.");
  const root = source.match(/^\s*(?:<\?xml[^?]*\?>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i);
  if (!root) throw new TypeError("SVG must be one closed svg root with explicit geometry children.");
  const rootAttrs = attributes(root[1]);
  requireAttrs(rootAttrs, ["xmlns", "viewBox", "width", "height", "preserveAspectRatio"], ["viewBox"]);
  if (rootAttrs.xmlns && rootAttrs.xmlns !== "http://www.w3.org/2000/svg") throw new TypeError("SVG namespace is not supported.");
  const [x, y, width, height] = numberList(rootAttrs.viewBox, 4);
  if (width <= 0 || height <= 0 || width > 2000 || height > 2000) throw new TypeError("SVG viewBox must be positive and within 2000x2000.");
  const inner = root[2];
  const nodePattern = /<(path|rect|ellipse|circle|polygon|line)\b([^<>]*?)\s*\/\s*>/gi;
  const geometryRecipe = [];
  let residue = inner;
  for (const match of inner.matchAll(nodePattern)) {
    geometryRecipe.push(svgNode(match[1].toLowerCase(), match[2]));
    residue = residue.replace(match[0], "");
  }
  if (residue.trim() || !geometryRecipe.length || geometryRecipe.length > 100)
    throw new TypeError("SVG must contain 1–100 allowlisted self-closing geometry elements and no text or groups.");
  const fullCanvas = geometryRecipe.some((node) => node.kind === "roundedRect" && node.rect[0] <= x && node.rect[1] <= y
    && node.rect[0] + node.rect[2] >= x + width && node.rect[1] + node.rect[3] >= y + height && node.fill !== "none");
  if (fullCanvas) throw new TypeError("SVG needs a transparent canvas; full-viewBox background rectangles are not imported.");
  return { geometryRecipe, normalizedDimensions: { width, height }, alphaVerified: true, geometryVerified: true };
}

function assetSourceFromBytes({ assetId: sourceAssetId, sourceRef, sha256: sourceHash, mediaType, rightsStatus }, actualHash) {
  if (!sourceAssetId || !/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(sourceAssetId)) throw new TypeError("Provided art needs a stable asset ID.");
  if (!sourceHash || sourceHash !== actualHash) throw new TypeError("Provided art digest does not match the Story IR asset reference.");
  if (!["original", "licensed", "public-domain"].includes(rightsStatus)) throw new TypeError("Provided reusable art requires explicit original, licensed, or public-domain rights.");
  return {
    kind: "user-supplied", assetId: sourceAssetId, sourceRef: sourceRef || `asset:${sourceAssetId}`,
    sha256: actualHash, mediaType, rightsStatus,
  };
}

function resolveProvidedAsset(reference, rightsStatus, providedAssets) {
  if (!reference) return null;
  const supplied = providedAssets instanceof Map ? providedAssets.get(reference.assetId) : providedAssets?.[reference.assetId];
  if (!supplied) return null;
  const bytes = Buffer.isBuffer(supplied.bytes) ? supplied.bytes : Buffer.from(supplied.bytes || []);
  const actualHash = sha256(bytes);
  if (actualHash !== reference.sha256 || supplied.mediaType !== reference.mediaType)
    throw new TypeError(`Provided art ${reference.assetId} does not match its declared digest or media type.`);
  const source = assetSourceFromBytes({ ...reference, sourceRef: supplied.sourceRef, rightsStatus }, actualHash);
  if (reference.mediaType === "image/svg+xml") {
    const imported = importSafeSvg(bytes);
    const compiled = compileAssetReadyVisual({
      description: `Verified reusable SVG asset ${reference.assetId}`,
      silhouetteFamily: "custom-vector", normalizedDimensions: imported.normalizedDimensions,
      geometryRecipe: imported.geometryRecipe, assetSource: source,
    });
    return { sourceTier: "B", assetId: reference.assetId, sha256: actualHash, mediaType: reference.mediaType,
      alphaVerified: imported.alphaVerified, geometryVerified: imported.geometryVerified,
      visualSpec: compiled.visualSpec, verification: "safe-svg-geometry/v1" };
  }
  if (reference.mediaType === "image/png") {
    const inspected = inspectTransparentPng(bytes);
    // The renderer's local art units are approximately a character-head scale.
    const scale = 160 / Math.max(inspected.width, inspected.height);
    const width = Math.max(1, Math.round(inspected.width * scale));
    const height = Math.max(1, Math.round(inspected.height * scale));
    const dataUri = `data:image/png;base64,${bytes.toString("base64")}`;
    const compiled = compileAssetReadyVisual({
      description: `Verified transparent reusable PNG asset ${reference.assetId}`,
      silhouetteFamily: "custom-vector", normalizedDimensions: { width, height },
      geometryRecipe: [{ kind: "rasterImage", rect: [-width / 2, -height / 2, width, height], dataUri }],
      assetSource: source,
    });
    return { sourceTier: "B", assetId: reference.assetId, sha256: actualHash, mediaType: reference.mediaType,
      alphaVerified: inspected.alphaVerified, geometryVerified: true,
      visualSpec: compiled.visualSpec, verification: "png-alpha-geometry/v1" };
  }
  throw new TypeError(`Media type ${reference.mediaType} is not supported by the reusable-asset resolver.`);
}

function silhouette(entityKind, value) {
  if (entityKind === "character") return ["dog", "cat", "lion"].includes(value.kind) ? `animal-${value.kind}` : "humanoid";
  if (entityKind === "prop") return SHAPE_FAMILY[value.type] || "custom-vector";
  if (entityKind === "environment") return `environment-${value.background}`;
  if (entityKind === "scenery") return `vector-${value.kind}`;
  return `transient-${value.kind}`;
}
function specForNodes(description, nodes, source = { kind: "procedural-svg", rightsStatus: "original" }) {
  if (!nodes?.length) return null;
  const compiled = compileAssetReadyVisual({ description: String(description || "Validated storyboard vector art").slice(0, 500),
    silhouetteFamily: "custom-vector", geometryRecipe: nodes, assetSource: source });
  return compiled.visualSpec;
}
function effectSampleTimes(scene) {
  const times = [];
  for (const beat of scene.beats) {
    if (beat.motionEffect === "flight") times.push(beat.start + beat.duration * 0.5);
    if ((beat.accent === "impact" || beat.kind === "punch") && beat.hit !== false && (beat.contactAt !== undefined || beat.kind === "punch"))
      times.push(beat.start + beat.duration * (beat.kind === "punch" ? 0.42 : beat.contactAt) + 0.04);
    if (beat.kind === "tearFree") times.push(beat.start + 0.2);
    if (beat.kind === "fart") times.push(beat.start + beat.duration * 0.35);
  }
  for (const motion of scene.motions || []) {
    if (motion.timing === "gravity") times.push(motion.start + motion.duration * 0.5);
    if (motion.impactOnEnd) times.push(motion.start + motion.duration + 0.1);
  }
  return [...new Set(times.filter((time) => Number.isFinite(time) && time >= 0 && time < scene.duration))].sort((a, b) => a - b);
}

/** Compile Story IR entities into reusable, content-addressed render targets and scene coverage. */
export function compileAssetFactoryPipeline(input, { providedAssets = {} } = {}) {
  let ir;
  if (input?.schemaVersion === 2) ir = validateStoryIR(input);
  else if (input?.schemaVersion === 1 && input?.story && input?.design) ir = input;
  else ir = canonicalizePlan(input).ir;
  const plan = validatePlan(storyIRToPlan(ir));
  const storyId = plan.storyId;
  const assets = new Map();
  const requests = [];
  const coverage = [];
  const renderOverrides = { characters: {}, props: {} };
  const add = ({ kind, sourceId, displayName, sceneId, brief, rendererId, sourceDescriptor, artTier = "A", visualSpec = null, appearances = [], supportedMotionContact = [], rigInteractionManifest = {}, status = "compiled" }) => {
    const semId = semanticId(storyId, kind, sourceId);
    const descriptor = { pipeline: PIPELINE_VERSION, rendererId, sourceDescriptor, visualSpec };
    const id = assetId(descriptor);
    const existing = assets.get(id);
    if (!existing) assets.set(id, {
      assetId: id, contentHash: id.slice("asset_sha256_".length), rendererId, tier: artTier,
      status, validatedArt: visualSpec ? { status: "pass", format: artTier === "B" ? "verified-svg-or-transparent-png" : "validated-vector-spec", geometryNodeCount: visualSpec.geometryRecipe?.length || 0 } : { status: "pass", format: "registered-renderer-art", rendererId },
      ...(visualSpec ? { visualSpec } : {}),
    });
    const visualBrief = structuredVisualBrief({
      kind, description: brief.description, silhouetteFamily: brief.requiredSilhouette, features: brief.requiredFeatures,
      dominantColor: sourceDescriptor?.color || sourceDescriptor?.outfit || (sourceDescriptor?.type ? "#b3bda3" : undefined),
      secondaryColor: sourceDescriptor?.skin || (sourceDescriptor?.label ? "#f1df9a" : undefined),
      material: visualSpec?.material || "flat", printedText: sourceDescriptor?.label || null,
      facing: kind === "character" ? "scene-directed" : "front",
      pivots: [...(rigInteractionManifest?.interactionAnchors || []), ...(rigInteractionManifest?.visualMotionAnchors || [])],
      motion: [...(rigInteractionManifest?.affordances || []), ...(rigInteractionManifest?.rigCapabilities || []), ...supportedMotionContact.map((item) => item.kind).filter(Boolean)],
    });
    requests.push({ semanticEntityId: semId, sourceId, kind, displayName, visualBrief,
      assetPlan: { resolverTier: artTier, rendererId, strategy: artTier === "B" ? "verified-reusable-art" : "existing-validated-procedural-renderer" },
      construction: constructionManifest({ kind, tier: artTier, visualSpec, rendererId, rigInteractionManifest, sourceStatus: visualSpec?.assetSource }),
      rigInteractionManifest, linkedAssetId: id, status });
    if (sceneId) coverage.push({ semanticEntityId: semId, sourceId, entityKind: kind, sceneId,
      displayName, requiredSilhouette: brief.requiredSilhouette, appearances,
      supportedMotionContact, compiledAssetId: id, resolverTier: artTier, status });
    return { semanticEntityId: semId, assetId: id };
  };

  const actorScenes = new Map();
  const propScenes = new Map();
  for (const scene of plan.scenes) {
    for (const cast of scene.cast) {
      if (!actorScenes.has(cast.characterId)) actorScenes.set(cast.characterId, []);
      actorScenes.get(cast.characterId).push({ sceneId: scene.id, cast });
    }
    for (const placement of scene.props) {
      if (!propScenes.has(placement.designId)) propScenes.set(placement.designId, []);
      propScenes.get(placement.designId).push({ sceneId: scene.id, placement });
    }
  }
  for (const actor of plan.characters) {
    const appearances = actorScenes.get(actor.id) || [];
    const provided = actor.visualSpec?.assetSource?.kind === "user-supplied"
      ? resolveProvidedAsset(actor.visualSpec.assetSource, actor.visualSpec.assetSource.rightsStatus, providedAssets)
      : null;
    const visualSpec = provided?.visualSpec || (actor.visualSpec ? VisualSpecSchema.parse(actor.visualSpec) : null);
    const profile = actor.rigRequirement?.profile || ACTOR_RIG[actor.kind];
    const rendererId = provided ? `sticklaugh.render.user-art+${profile}` : profile;
    const rigInteractionManifest = { rigProfile: profile, rigCapabilities: actor.rigRequirement?.capabilities || [], supportedMotionContact: appearances.flatMap(({ sceneId }) => plan.scenes.find((s) => s.id === sceneId).beats.filter((beat) => beat.actorId === actor.id).map((beat) => ({ actionId: beat.id, kind: beat.kind, contactAt: beat.contactAt ?? null, targetId: beat.targetActorId || beat.targetId || null }))) };
    const features = [...(actor.requiredAppearanceFeatures || []), ...(actor.accessory && actor.accessory !== "none" ? [actor.accessory] : []), ...(actor.costume ? [actor.costume] : [])];
    for (const appearance of appearances.length ? appearances : [{ sceneId: "unplaced" }]) {
      add({ kind: "character", sourceId: actor.id, displayName: actor.name, sceneId: appearance.sceneId,
        brief: { description: `${actor.kind} character ${actor.name}`, requiredSilhouette: silhouette("character", actor), requiredFeatures: features },
        rendererId, sourceDescriptor: { kind: actor.kind, rigVersion: actor.rigVersion || 1, visualSpec, features, sourceAssetId: provided?.assetId || null }, artTier: provided ? "B" : "A", visualSpec,
        appearances: appearances.filter((item) => item.sceneId === appearance.sceneId).map(({ cast }) => ({ castId: cast.id, visible: cast.visible !== false, x: cast.x, y: cast.y })),
        supportedMotionContact: rigInteractionManifest.supportedMotionContact, rigInteractionManifest,
        status: appearance.sceneId === "unplaced" ? "compiled-not-instantiated" : "compiled" });
    if (provided && visualSpec) renderOverrides.characters[actor.id] = visualSpec;
    }
  }
  for (const design of plan.propDesigns) {
    const placements = propScenes.get(design.id) || [];
    const provided = resolveProvidedAsset(design.optionalSourceAsset, design.rightsStatus, providedAssets);
    const visualSpec = provided?.visualSpec || (design.visualSpec ? VisualSpecSchema.parse(design.visualSpec) : design.type === "drawing" ? specForNodes(design.name || design.id, design.nodes) : null);
    const rendererId = provided ? "sticklaugh.render.user-art.v1" : rendererForProp(design);
    const motionContacts = placements.flatMap(({ sceneId, placement }) => {
      const scene = plan.scenes.find((item) => item.id === sceneId);
      const attached = [placement.attachment, ...(placement.attachmentEvents || []).map((event) => event.attachment)].filter(Boolean).map((attachment) => ({ type: "attachment", actorId: attachment.actorId, bone: attachment.bone, eventId: attachment.id || null }));
      const beats = scene.beats.filter((beat) => beat.targetId === design.id || beat.actorId === placement.attachment?.actorId).map((beat) => ({ actionId: beat.id, kind: beat.kind, contactAt: beat.contactAt ?? null, actorId: beat.actorId }));
      const motions = (scene.motions || []).filter((motion) => motion.targetId === design.id).map((motion) => ({ motionId: motion.id, timing: motion.timing, start: motion.start, duration: motion.duration }));
      const machine = placement.partAttachment ? [{type:"part-attachment",...placement.partAttachment}] : [];
      return [...attached, ...beats, ...motions, ...machine].map((record) => ({ sceneId, ...record }));
    });
    const rigInteractionManifest = { affordances: design.objectAffordances || [], interactionAnchors: design.interactionAnchors || [], visualMotionAnchors: design.visualSpec?.motionAnchors || [], declaredContactEventIds: design.contactEventIds || [], supportedMotionContact: motionContacts };
    const features = [...(design.visualAssetRequest?.requiredFeatures || []), ...(design.label ? [`physical-label:${design.label}`] : []), ...(design.name ? [`identity:${design.name}`] : [])];
    const occurrences = new Map();
    for (const entry of placements) {
      if (!occurrences.has(entry.sceneId)) occurrences.set(entry.sceneId, []);
      occurrences.get(entry.sceneId).push(entry);
    }
    for (const [sceneId, items] of occurrences.size ? occurrences : [["unplaced", []]]) {
      const appliedSpec = visualSpec;
      const builtAsset = add({ kind: "prop", sourceId: design.id, displayName: design.name, sceneId,
        brief: { description: design.visualAssetRequest?.description || `${design.name} (${design.type})`, requiredSilhouette: silhouette("prop", design), requiredFeatures: features },
        rendererId, sourceDescriptor: { type: design.type, color: design.color, label: design.label || null, nodes: design.nodes, visualSpec: appliedSpec, sourceAssetId: provided?.assetId || null },
        artTier: provided ? "B" : "A", visualSpec: appliedSpec, appearances: items.map(({ placement }) => ({ placementId: placement.id, x: placement.x, y: placement.y, scale: placement.scale, appearAt: placement.appearAt ?? 0, disappearAt: placement.disappearAt ?? null })),
        supportedMotionContact: [
          ...motionContacts.filter((record) => record.sceneId === sceneId),
          ...(design.contactEventIds || []).map((eventId) => ({ sceneId, type: "declared-contact", eventId })),
        ], rigInteractionManifest,
        status: sceneId === "unplaced" ? "compiled-not-instantiated" : "compiled" });
      if (provided && appliedSpec) renderOverrides.props[design.id] = appliedSpec;
    }
  }
  for (const scene of plan.scenes) {
    const environmentId = ir.design.environments.find((item) => item.sceneId === scene.id)?.id || `env_${scene.id}`;
    const envSpec = specForNodes(`Background ${scene.background}`, scene.backgroundNodes || []);
    add({ kind: "environment", sourceId: environmentId, displayName: `${scene.background} background`, sceneId: scene.id,
      brief: { description: `Scene ${scene.id} background ${scene.background}`, requiredSilhouette: silhouette("environment", { background: scene.background }), requiredFeatures: [...(scene.backgroundNodes || []).map((node) => `scenery:${node.kind}`)] },
      rendererId: `sticklaugh.render.background.${scene.background}/v1`, sourceDescriptor: { background: scene.background, nodes: scene.backgroundNodes || [], rendererId: `sticklaugh.render.background.${scene.background}/v1` }, visualSpec: envSpec,
      appearances: [{ sceneId: scene.id, interval: "whole-scene" }], supportedMotionContact: [], rigInteractionManifest: { interactions: [] } });
    for (const node of scene.backgroundNodes || []) {
      const nodeSpec = specForNodes(`Scenery ${node.kind}`, [node]);
      const nodeId = node.id || `${scene.id}_scenery_${digest(node).slice(0, 12)}`;
      add({ kind: "scenery", sourceId: nodeId, displayName: node.name || `Scenery ${node.kind}`, sceneId: scene.id,
        brief: { description: `Scene scenery vector ${node.kind}`, requiredSilhouette: silhouette("scenery", node), requiredFeatures: [] },
        rendererId: "sticklaugh.render.vector-nodes/v1", sourceDescriptor: { node }, visualSpec: nodeSpec,
        appearances: [{ sceneId: scene.id, interval: "whole-scene", nodeId }], supportedMotionContact: [], rigInteractionManifest: { interactions: [] } });
    }
    for (const time of effectSampleTimes(scene)) {
      const evaluated = evaluate(scene, time, plan.propDesigns);
      const shot = scene.shots.find((item) => time >= item.start && time < item.end) || scene.shots[0];
      const graph = compileSceneGraph({ plan, scene, time, states: evaluated.states, props: evaluated.props, effects: evaluated.effects, shot });
      for (const graphEffect of graph.entities.filter((entity) => entity.category === "effect")) {
        const effectData = evaluated.effects.find((item, index) => `${item.kind}_${index + 1}` === graphEffect.id);
        if (!effectData || !renderEffect(effectData, time)) continue;
        const id = `effect_${scene.id}_${effectData.kind}`;
        const sourceActions = scene.beats.filter((beat) =>
          ((beat.kind === "punch" || beat.accent === "impact") && effectData.kind === "impact")
          || (beat.kind === "tearFree" && effectData.kind === "paperBurst")
          || (beat.kind === "fart" && effectData.kind === "stink")
          || (beat.motionEffect === "flight" && effectData.kind === "wind"),
        ).map((beat) => beat.id);
        const sourceMotions = (scene.motions || []).filter((motion) =>
          (motion.impactOnEnd && effectData.kind === "landing")
          || (motion.timing === "gravity" && effectData.kind === "fall"),
        ).map((motion) => motion.id);
        add({ kind: "transient-effect", sourceId: id, displayName: `${effectData.kind} gag effect`, sceneId: scene.id,
          brief: { description: `Transient renderer effect ${effectData.kind}`, requiredSilhouette: silhouette("effect", effectData), requiredFeatures: ["ephemeral-renderer-output"] },
          rendererId: `sticklaugh.render.effect.${effectData.kind}/v1`, sourceDescriptor: { kind: effectData.kind },
          appearances: [{ sceneId: scene.id, sampledAt: time, runtimeGraphEntityId: graphEffect.id }], supportedMotionContact: [
            ...sourceActions.map((actionId) => ({ actionId, kind: effectData.kind })),
            ...sourceMotions.map((motionId) => ({ motionId, kind: effectData.kind })),
          ], rigInteractionManifest: { sourceActionIds: sourceActions, sourceMotionIds: sourceMotions } });
      }
    }
  }
  const coverageRows = coverage.sort((a, b) => a.sceneId.localeCompare(b.sceneId) || a.entityKind.localeCompare(b.entityKind) || a.sourceId.localeCompare(b.sourceId));
  return {
    schemaVersion: 1, pipeline: PIPELINE_VERSION, source: "canonical-story-ir",
    providerStatus: {
      imageGeneration: "unavailable",
      reason: "No image-generation-capable provider is explicitly registered; Gemini storyboard/text credentials do not authorize image generation.",
      providerTesting: "OFFLINE",
      compatibleImageProviderCount: 0,
      proceduralProvider: proceduralAssetProvider.id,
      proceduralExamples: VISUAL_BRIEF_EXAMPLES.filter((visualBrief) => discoverAssetProviders(visualBrief, [proceduralAssetProvider]).some((provider) => provider.supported)).length,
      visualLimits: ["Renderer-native 2D geometry only; no photorealism or general 3D.", "Printed wording/logo is brief metadata unless the renderer has a dedicated mark.", "Side/back details are not fabricated."],
    },
    summary: { requestedEntityCount: requests.length, uniqueCompiledAssetCount: assets.size, coverageRowCount: coverageRows.length,
      uncoveredCount: coverageRows.filter((row) => !row.compiledAssetId).length,
      resolverTiers: { A: requests.filter((request) => request.assetPlan.resolverTier === "A").length, B: requests.filter((request) => request.assetPlan.resolverTier === "B").length, C: 0 } },
    requests, assets: [...assets.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)), coverage: coverageRows,
    renderOverrides,
  };
}

export function applyAssetFactoryOverrides(input, result) {
  const plan = structuredClone(validatePlan(input));
  for (const [id, visualSpec] of Object.entries(result?.renderOverrides?.characters || {})) {
    const entity = plan.characters.find((item) => item.id === id);
    if (entity) entity.visualSpec = VisualSpecSchema.parse(visualSpec);
  }
  for (const [id, visualSpec] of Object.entries(result?.renderOverrides?.props || {})) {
    const entity = plan.propDesigns.find((item) => item.id === id);
    if (entity) entity.visualSpec = VisualSpecSchema.parse(visualSpec);
  }
  return validatePlan(plan);
}
