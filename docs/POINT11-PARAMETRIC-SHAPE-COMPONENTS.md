# Point 11 — parametric shape components and layering

Point 11 adds versioned, renderer-backed procedural components to the existing
bounded visual-spec DSL. It keeps the Point 10 node vocabulary and legacy
`geometryRecipe`, `facialComponents`, `apparel`, `accessories`,
`decorativeMarks`, and built-in prop renderers.

## Capability contract

`shared/visual-capability-manifest.mjs` is the source for the visual contract.
Capability discovery publishes the contract ID/version, supported visual
attributes, the registered procedural component IDs and versions, bounded
complexity, built-in prop types, and actionable fallback/error guidance.
The geometry registry rejects implementations that are not in the manifest;
tests compare the manifest with the active registry so declarations cannot
silently overstate support.

Supported geometry components are `organicRound`, `taperedLimb`, `rigidBox`,
`furniturePlane`, `curvedFood`, `cylinder`, `fold`, `clothContour`, `leafStem`,
`wheelSpokes`, `fabricLayers`, `doorHinge`, and `expressiveFace`, all version 1.
Each component validates its own options and enforces its published output-node
maximum before the renderer draws it.

## Local component contract

A visual spec may add up to 32 `proceduralComponents`. Each entry identifies a
registered `componentId` and `version`, its validated `options`, an attachment,
local offset/rotation/scale, an occlusion `layer`, and a bounded `zIndex`.
Geometry coordinates are relative to the attachment point in the rig's local
coordinate system. Character anchors include root, head, torso, hands, and
feet; prop components must use the prop root. Bone-attached components cannot
use a global visual transform, which would otherwise detach the costume from
the animated character.

Layers render behind the base entity, as an overlay, or in the foreground. The
character's base body and held-item hand overlays retain their established
ordering; prop details use the live prop transform, including its movement and
rotation. Existing visual-spec node lists keep their prior coordinate scale and
rendering order.

## Validation and non-capabilities

The schema and typed scene graph revalidate component IDs, versions, options,
attachment spaces, unique IDs, `zIndex`, and a 100-node cumulative geometry
budget per visual spec. The renderer also fails closed if a raw, unvalidated
spec exceeds the limit. Unsupported components are rejected rather than
silently replaced.

Object support requires a typed, placed prop design with renderer geometry.
For custom `drawing` props, a requirement cannot be met by a label: it needs
actual geometry nodes or a drawable visual spec. Empty legacy drawing props may
remain as invisible technical markers, but their label is not rendered as an
object.

This remains a 2D vector system: materials are descriptive metadata, not
lighting; no arbitrary plugins, remote assets, 3D geometry, cloth simulation,
or general physics are provided.