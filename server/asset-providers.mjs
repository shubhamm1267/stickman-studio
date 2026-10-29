import { compileAssetReadyVisual } from "../shared/asset-ready-visual.mjs";
import { NodeSchema } from "../shared/visual-spec-schema.mjs";

const INK = "#293329", SHADOW = "#d4d4ce", color = /^#[0-9a-fA-F]{6}$/;
const ell = (id, center, radius, fill, stroke = INK, width = 2) => NodeSchema.parse({ id, kind: "ellipse", center, radius, fill, stroke: stroke === "none" ? fill : stroke, width });
const rr = (id, rect, fill, stroke = INK, width = 2, cornerRadius = 4) => NodeSchema.parse({ id, kind: "roundedRect", rect, cornerRadius, fill, stroke: stroke === "none" ? fill : stroke, width });
const poly = (id, points, fill, stroke = INK, width = 2) => NodeSchema.parse({ id, kind: "polygon", points, fill, stroke: stroke === "none" ? fill : stroke, width });
const line = (id, from, to, stroke = INK, width = 2) => NodeSchema.parse({ id, kind: "line", from, to, stroke, width });
const path = (id, d, fill, stroke = INK, width = 2) => NodeSchema.parse({ id, kind: "path", d, fill, stroke, width });
const shadow = () => ell("contact-shadow", [0, 47], [23, 3], SHADOW, SHADOW, 0);

const example = (proceduralTemplate, semanticClass, description, dominantColor, secondaryColor, accentColor, material, identifiableAttributes, extra = {}) => Object.freeze({
  schemaVersion: 1, proceduralTemplate, semanticClass, description,
  shapeLanguage: "bold 2D cartoon with readable silhouette", outlineStyle: "dark uniform outline",
  dominantColor, secondaryColor, accentColor, proportions: Object.freeze({ width: 100, height: 100, aspect: 1 }), material,
  identifiableAttributes: Object.freeze(identifiableAttributes),
  printedTextLogo: Object.freeze(extra.printedTextLogo || { text: null, logo: null }),
  view: Object.freeze({ primary: "front", facing: "right", sideBackPolicy: "preserve silhouette; do not fabricate unseen details" }),
  pivotPoints: Object.freeze([{ id: "root", position: [0, 0] }, { id: "contact", position: [0, 47] }]),
  occlusionLayers: Object.freeze([{ id: "contact-shadow", order: 0 }, { id: "rear-detail", order: 1 }, { id: "body", order: 2 }, { id: "front-detail", order: 3 }]),
  desiredMotionAffordances: Object.freeze(extra.motion || ["idle", "translate", "rotate"]),
});

export const VISUAL_BRIEF_EXAMPLES = Object.freeze([
  example("ufoSaucer", "vehicle.ufo", "Metallic saucer UFO with domed cockpit, rim lights and tractor beam.", "#aeb8b2", "#68777e", "#ffd55a", "metal", ["saucer silhouette", "glass dome", "underside lights", "tractor beam"], { motion: ["hover", "beam", "tilt"] }),
  example("alien", "character.alien", "Alien with nonhuman oversized head, dark almond eyes and antennae.", "#64b66a", "#3d7c4c", "#c8efc5", "organic", ["nonhuman head proportions", "almond eyes", "antennae"], { motion: ["hover", "reach", "tilt"] }),
  example("sodaCan", "prop.branded-soda-can", "Branded soda can with metal lid, label band and logo mark.", "#e35b47", "#f3e3bd", "#f7ce4b", "metal", ["cylindrical can", "pull-tab lid", "label band"], { printedTextLogo: { text: "SODA", logo: "custom-mark" }, motion: ["hold", "drink-from", "shake"] }),
  example("beerBottle", "prop.beer-bottle", "Glass beer bottle with capped neck, shoulders and printed paper label.", "#476e43", "#d0b46d", "#c84c36", "glass", ["narrow neck", "sloped shoulders", "crown cap", "paper label"], { printedTextLogo: { text: "LAGER", logo: null }, motion: ["hold", "drink-from", "tilt"] }),
  example("spacecraft", "vehicle.spacecraft", "Spacecraft with swept wings, cockpit, twin engines and flame.", "#a9b4b8", "#586a80", "#f1a34a", "metal", ["fuselage", "swept wings", "cockpit", "twin engines"], { motion: ["fly", "bank", "land"] }),
  example("multiHeadedFigure", "character.multi-headed", "Three-headed figure with separate necks, shared torso and limbs.", "#d8a77d", "#527a69", "#c75e5e", "fabric", ["three distinct heads", "shared torso", "separate necks"], { motion: ["walk", "gesture", "look-around"] }),
  example("capedHero", "character.caped-hero", "Caped flying hero with distinct cape, mask and chest emblem.", "#3d6eb4", "#e7bf57", "#c64e52", "fabric", ["cape silhouette", "eye mask", "chest emblem"], { motion: ["fly", "hover", "land"] }),
  example("quadruped", "animal.four-legged", "Four-legged animal with torso, muzzle, tail and separated legs.", "#c8894e", "#8c5a39", "#f1d5ac", "organic", ["four legs", "muzzle", "tail", "ear"], { motion: ["walk", "run", "sit"] }),
]);
const byTemplate = new Map(VISUAL_BRIEF_EXAMPLES.map((item) => [item.proceduralTemplate, item]));

function shapes(template, b) {
  const a = b.dominantColor, s = b.secondaryColor, c = b.accentColor;
  const recipes = {
    ufoSaucer: [ell("deck", [0, 12], [42, 12], s), ell("hull", [0, 8], [47, 10], a), ell("dome", [0, 1], [20, 19], "#b9e5e6"), ell("glint", [-6, -4], [4, 7], "#e9ffff", "none", 0), ...[-26, -9, 9, 26].map((x, i) => ell(`light-${i}`, [x, 10], [3, 2], c, INK, 1)), poly("tractor-beam", [[-17, 22], [17, 22], [29, 45], [-29, 45]], "#e2f1b5", "none", 0)],
    alien: [ell("torso", [0, 25], [19, 22], a), line("arm-l", [-16, 20], [-32, 4], a, 7), line("arm-r", [16, 20], [32, 4], a, 7), line("leg-l", [-8, 42], [-14, 49], a, 7), line("leg-r", [8, 42], [14, 49], a, 7), ell("head", [0, -13], [25, 31], a), line("antenna-l", [-10, -39], [-18, -48], a, 3), line("antenna-r", [10, -39], [18, -48], a, 3), ell("eye-l", [-9, -15], [5.5, 9], "#162c3a", "#162c3a", 0), ell("eye-r", [9, -15], [5.5, 9], "#162c3a", "#162c3a", 0), ell("eye-glint", [-10, -18], [1.6, 2.2], "#f8f7ef", "#f8f7ef", 0)],
    sodaCan: [rr("can-body", [-20, -39, 40, 78], a, INK, 2.5, 8), ell("can-top", [0, -38], [19, 5], "#c9cec6"), ell("can-lid", [0, -39], [12, 2.3], "#eef0e9", "#7c827d", 1), ell("can-base", [0, 39], [18, 4], s), rr("label-band", [-18, -10, 36, 24], s, "none", 0, 2), line("label-rule", [-13, -5], [13, -5], c, 2), ell("logo-mark", [0, 4], [6, 6], c, INK, 1), line("can-highlight", [-13, -28], [-13, 23], "#ffffff", 1.5)],
    beerBottle: [path("bottle-glass", "M-12 -45 L12 -45 L12 -30 Q12 -23 20 -17 L20 33 Q20 43 10 46 L-10 46 Q-20 43 -20 33 L-20 -17 Q-12 -23 -12 -30 Z", a), rr("neck", [-11, -46, 22, 18], s, INK, 2, 5), rr("cap", [-12, -49, 24, 7], c, INK, 1.5, 2), rr("paper-label", [-17, -5, 34, 23], "#f1df9a", INK, 1.5, 2), line("label-rule", [-12, 1], [12, 1], s, 1.5), line("glass-glint", [-14, -13], [-14, 28], "#eaf4dd", 2)],
    spacecraft: [poly("wing-l", [[-11, 5], [-48, 31], [-34, -2], [-12, -17]], s), poly("wing-r", [[11, 5], [48, 31], [34, -2], [12, -17]], s), poly("fuselage", [[0, -48], [15, -9], [14, 28], [0, 40], [-14, 28], [-15, -9]], a), ell("cockpit", [0, -14], [9, 12], "#b9e5e6"), rr("engine-l", [-13, 28, 8, 12], c, INK, 1, 3), rr("engine-r", [5, 28, 8, 12], c, INK, 1, 3), poly("flame", [[-9, 40], [0, 50], [9, 40], [0, 45]], "#f2a34a", "none", 0)],
    multiHeadedFigure: [line("leg-l", [-8, 31], [-13, 49], a, 8), line("leg-r", [8, 31], [13, 49], a, 8), ell("torso", [0, 15], [17, 24], s), line("arm-l", [-14, 4], [-31, -8], a, 7), line("arm-r", [14, 4], [31, -8], a, 7), line("neck-l", [-9, -10], [-14, -23], a, 5), line("neck-c", [0, -10], [0, -26], a, 5), line("neck-r", [9, -10], [14, -23], a, 5), ...[[-16, -33], [0, -39], [16, -33]].flatMap(([x,y],i) => [ell(`head-${i}`, [x,y], [10,11], a), ell(`eye-${i}a`, [x-3,y-1], [1.6,2], "#f8f7ef", "#f8f7ef", 0), ell(`eye-${i}b`, [x+3,y-1], [1.6,2], "#f8f7ef", "#f8f7ef", 0)])],
    capedHero: [poly("cape", [[-10,-15],[-34,-5],[-29,34],[-12,23],[0,37],[12,23],[29,34],[34,-5],[10,-15]], c), line("leg-l", [-7,27], [-14,48], s, 8), line("leg-r", [7,27], [14,48], s, 8), ell("torso", [0,4], [16,25], a), line("arm-l", [-13,-3], [-30,-17], s, 7), line("arm-r", [13,-3], [30,-17], s, 7), ell("head", [0,-28], [13,14], "#f0c39c"), rr("mask", [-12,-32,24,7], c, INK, 1, 3), poly("emblem", [[0,-1],[5,5],[0,12],[-5,5]], "#f4df86", INK, 1)],
    quadruped: [ell("body", [0,2], [30,19], a), ell("head", [29,-11], [16,14], a), poly("ear", [[22,-22],[25,-38],[34,-23]], s), line("front-leg-a", [19,12], [18,44], s, 7), line("front-leg-b", [29,11], [30,44], s, 7), line("back-leg-a", [-19,12], [-22,44], s, 7), line("back-leg-b", [-9,13], [-10,44], s, 7), path("tail", "M-27 -2 Q-42 -17 -45 -5 Q-45 1 -39 1", "none", a, 4), ell("eye", [34,-14], [2.2,2.5], INK, INK, 0), ell("muzzle", [41,-6], [6,4], s, INK, 1)],
  }[template];
  if (!recipes) throw new TypeError(`No procedural geometry is registered for ${template}.`);
  return [shadow(), ...recipes];
}

function validBrief(input) {
  if (!input || input.schemaVersion !== 1 || !byTemplate.has(input.proceduralTemplate) ||
      typeof input.semanticClass !== "string" || !input.description ||
      !color.test(input.dominantColor) || !color.test(input.secondaryColor) || !color.test(input.accentColor) ||
      !Number.isFinite(input.proportions?.width) || !Number.isFinite(input.proportions?.height) ||
      !Array.isArray(input.identifiableAttributes) || !Array.isArray(input.desiredMotionAffordances)) throw new TypeError("Invalid structured visual brief.");
  return input;
}
function buildAsset(input) {
  const b = validBrief(input), geometryRecipe = shapes(b.proceduralTemplate, b);
  const anchors = [{ id: "contact", position: [0, 47] }, { id: "grip-left", position: [-22, 8] }, { id: "grip-right", position: [22, 8] }];
  const compiled = compileAssetReadyVisual({ description: b.description,
    silhouetteFamily: b.semanticClass.startsWith("animal.") ? "animal" : b.semanticClass.startsWith("character.") ? "humanoid" : "custom-vector",
    normalizedDimensions: { width: b.proportions.width, height: b.proportions.height }, material: b.material,
    paint: { fill: b.dominantColor, stroke: INK, outlineThickness: 2 }, palette: [b.dominantColor,b.secondaryColor,b.accentColor],
    geometryRecipe, motionAnchors: [{ id: "root", position: [0,0] }, { id: "contact", position: [0,47] }],
    interactionAnchors: anchors, assetSource: { kind: "procedural-svg", generator: "sticklaugh-safe-geometry/v1", rightsStatus: "original" },
  });
  return { providerId: "sticklaugh.procedural-vector/v1", providerKind: "procedural-vector", visualBrief: b, visualSpec: compiled.visualSpec,
    manifest: { bounds: { coordinateSpace: "visual-spec-local", rect: [-50,-50,100,100] },
      alphaMask: { kind: "vector-alpha", derivedFrom: "validated geometryRecipe", transparentCanvas: true },
      contactPoint: { position: [0,47], anchorId: "contact" }, shadow: { nodeId: "contact-shadow", renderedAs: "contact ellipse", bounds: [-23,44,46,6] },
      attachmentAnchors: compiled.interactionAnchors, sideBackViewPolicy: b.view.sideBackPolicy,
      occlusionLayers: b.occlusionLayers,
      animationLayers: [{ id: "body", rendererLayer: "base", supported: true }, { id: "front-detail", rendererLayer: "overlay", supported: true }, { id: "motion", rendererLayer: "motion-anchors", supported: true, affordances: b.desiredMotionAffordances }],
      printedTextLogo: b.printedTextLogo,
      fallbackBehavior: "Use the registered procedural recipe; on validation failure retain the native renderer. Never substitute a label or random oval.",
      geometryNodeCount: geometryRecipe.length, template: b.proceduralTemplate,
    },
  };
}

export function assertAssetProvider(provider) {
  const required = ["supports", "generate", "validate", "provenance", "estimatedCost"];
  if (!provider || typeof provider.id !== "string" || !["procedural-vector", "image-generation"].includes(provider.kind) || required.some((name) => typeof provider[name] !== "function"))
    throw new TypeError(`Asset providers require id, kind, and ${required.join(", ")}.`);
  return provider;
}
export const proceduralAssetProvider = Object.freeze({
  id: "sticklaugh.procedural-vector/v1", kind: "procedural-vector",
  supports(input) { try { return Boolean(byTemplate.has(validBrief(input).proceduralTemplate)); } catch { return false; } },
  generate(input) { return buildAsset(input); },
  validate(asset) {
    try {
      if (!asset?.visualSpec?.geometryRecipe || asset.visualSpec.geometryRecipe.length < 5 || !asset.manifest?.alphaMask?.transparentCanvas || !asset.manifest?.contactPoint || !asset.manifest?.shadow || !asset.manifest?.attachmentAnchors?.length)
        return { status: "failed", reason: "Generated art is missing visible geometry or construction metadata." };
      for (const node of asset.visualSpec.geometryRecipe) NodeSchema.parse(node);
      return { status: "pass", geometryNodeCount: asset.visualSpec.geometryRecipe.length, alphaMask: "vector-alpha", contactPoint: "present" };
    } catch (error) { return { status: "failed", reason: error.message }; }
  },
  provenance(asset) { return { providerId: this.id, sourceKind: "procedural-svg", rightsStatus: "original", generator: asset?.visualSpec?.assetSource?.generator || "sticklaugh-safe-geometry/v1" }; },
  estimatedCost() { return { amount: 0, currency: "USD", basis: "local deterministic geometry; no API request" }; },
});
export function discoverAssetProviders(input, providers = [proceduralAssetProvider]) {
  return providers.map((value) => { const provider = assertAssetProvider(value), supported = Boolean(provider.supports(input)); return { providerId: provider.id, kind: provider.kind, supported, estimatedCost: supported ? provider.estimatedCost(input) : null }; });
}
export async function generateWithAssetProvider(providerInput, input, context = {}) {
  const provider = assertAssetProvider(providerInput);
  if (!provider.supports(input)) throw new TypeError(`Provider ${provider.id} does not support this visual brief.`);
  const asset = await provider.generate(input, context), validation = await provider.validate(asset, input);
  if (validation?.status !== "pass") throw new TypeError(`Provider ${provider.id} returned invalid art: ${validation?.reason || "validation failed"}`);
  return { asset, validation, provenance: await provider.provenance(asset, input), estimatedCost: await provider.estimatedCost(input) };
}
