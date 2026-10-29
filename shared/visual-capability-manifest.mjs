export const PROCEDURAL_COMPONENTS = Object.freeze([
  { id: "organicRound", version: 1, purpose: "Rounded organic forms", maxNodes: 5 },
  { id: "taperedLimb", version: 1, purpose: "Tapered limb silhouettes", maxNodes: 1 },
  { id: "rigidBox", version: 1, purpose: "Rigid rounded boxes", maxNodes: 1 },
  { id: "furniturePlane", version: 1, purpose: "Layered furniture planes", maxNodes: 2 },
  { id: "curvedFood", version: 1, purpose: "Curved food silhouettes", maxNodes: 1 },
  { id: "cylinder", version: 1, purpose: "Simple cylindrical forms", maxNodes: 3 },
  { id: "fold", version: 1, purpose: "Cloth folds", maxNodes: 1 },
  { id: "clothContour", version: 1, purpose: "Wavy fabric silhouettes", maxNodes: 1 },
  { id: "leafStem", version: 1, purpose: "Leaves with stems and veins", maxNodes: 4 },
  { id: "wheelSpokes", version: 1, purpose: "Wheels and spokes", maxNodes: 14 },
  { id: "fabricLayers", version: 1, purpose: "Layered fabric panels", maxNodes: 12 },
  { id: "doorHinge", version: 1, purpose: "Door panels and hinges", maxNodes: 7 },
  { id: "expressiveFace", version: 1, purpose: "Bounded expressive face parts", maxNodes: 7 },
]);

export const RENDERED_PROP_TYPES = Object.freeze([
  { id: "cap", version: 1, requiresGeometry: false },
  { id: "can", version: 1, requiresGeometry: false },
  { id: "bottle", version: 1, requiresGeometry: false },
  { id: "banana", version: 1, requiresGeometry: false },
  { id: "peel", version: 1, requiresGeometry: false },
  { id: "dustbin", version: 1, requiresGeometry: false },
  { id: "sign", version: 1, requiresGeometry: false },
  { id: "rubberDuck", version: 1, requiresGeometry: false },
  { id: "headphones", version: 1, requiresGeometry: false },
  { id: "gasMask", version: 1, requiresGeometry: false },
  { id: "newspaper", version: 1, requiresGeometry: false },
  { id: "jar", version: 1, requiresGeometry: false },
  { id: "cup", version: 1, requiresGeometry: false },
  { id: "phone", version: 1, requiresGeometry: false },
  { id: "table", version: 1, requiresGeometry: false },
  { id: "bench", version: 1, requiresGeometry: false },
  { id: "dumbbell", version: 1, requiresGeometry: false },
  { id: "balloon", version: 1, requiresGeometry: false },
  { id: "car", version: 1, requiresGeometry: false },
  { id: "chair", version: 1, requiresGeometry: false },
  { id: "toilet", version: 1, requiresGeometry: false },
  { id: "paperRoll", version: 1, requiresGeometry: false },
  { id: "door", version: 1, requiresGeometry: false },
  { id: "drawing", version: 1, requiresGeometry: true },
]);

export const VISUAL_CAPABILITY_MANIFEST = Object.freeze({
  id: "sticklaugh.visual-components",
  contractVersion: 1,
  componentSchemaVersion: 1,
  coordinateSpaces: Object.freeze([
    {
      id: "visual-local/v1",
      description: "Geometry coordinates are local to their declared attachment point.",
    },
    {
      id: "visual-spec/v1",
      description: "Legacy geometryRecipe and visual-spec node lists use normalizedDimensions.",
    },
  ]),
  complexity: Object.freeze({
    geometryNodesPerVisualSpec: 100,
    nestedGroupDepth: 4,
    proceduralInstancesPerVisualSpec: 32,
    generatedNodesPerInstance: 14,
    supportedFallback:
      "Keep the registered base character/prop and use a supported component or bounded geometryRecipe; never replace missing geometry with a label.",
    unsupportedComponent:
      "Reject the component with its registry diagnostic. Do not silently substitute a different shape.",
  }),
  attributes: Object.freeze([
    { id: "silhouetteFamily", version: 1, supported: true },
    { id: "normalizedDimensions", version: 1, supported: true },
    { id: "material", version: 1, supported: true, note: "Metadata only; no lighting simulation." },
    {
      id: "assetSource",
      version: 1,
      supported: true,
      note: "Source, hash, verification and rights metadata are preserved; linked raster/SVG data is not loaded.",
    },
    { id: "paint.fill", version: 1, supported: true, fallback: "Use a solid hex fill or none." },
    { id: "paint.stroke", version: 1, supported: true, fallback: "Use a solid hex stroke." },
    { id: "paint.outlineThickness", version: 1, supported: true, fallback: "Use a width from 0 to 20." },
    { id: "palette", version: 1, supported: true, fallback: "Use up to 16 solid hex colors." },
    { id: "gradient", version: 1, supported: true, fallback: "Use a bounded linear gradient on a closed shape." },
    { id: "motion", version: 1, supported: true, fallback: "Flutter and scene-scoped group transform keyframes are supported." },
    { id: "localTransform", version: 1, supported: true, fallback: "Use localTransform or globalTransform, not both." },
    { id: "globalTransform", version: 1, supported: true, fallback: "Use localTransform or globalTransform, not both." },
    { id: "zIndex", version: 1, supported: true, fallback: "Use an integer from -1000 to 1000." },
  ]),
  proceduralComponents: Object.freeze(
    PROCEDURAL_COMPONENTS.map((component) =>
      Object.freeze({
        ...component,
        attachmentSpaces: Object.freeze(["root", "head", "torso", "leftHand", "rightHand", "leftFoot", "rightFoot"]),
        layers: Object.freeze(["behind", "overlay", "foreground"]),
        fallback:
          "Use this component's bounded options or draw an equivalent with the supported geometryRecipe node kinds.",
      }),
    ),
  ),
  builtInPropTypes: Object.freeze(
    RENDERED_PROP_TYPES.map((propType) =>
      Object.freeze({
        ...propType,
        labelIsNotGeometry: true,
        fallback: propType.requiresGeometry
          ? "Add at least one supported geometry node or procedural component; a label alone does not make a drawing visible."
          : "Use the registered prop type's renderer and its supported properties.",
      }),
    ),
  ),
  unsupported: Object.freeze([
    "arbitrary executable expressions",
    "remote asset loading, arbitrary SVG, or runtime plugins",
    "3D geometry, cloth simulation, and general physics",
    "automatic anatomy inference; custom joints require explicit nested group geometry",
  ]),
});