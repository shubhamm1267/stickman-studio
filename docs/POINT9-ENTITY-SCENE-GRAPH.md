# Point 9 — typed entity categories and reusable visual specs

## Renderer-backed graph

`shared/scene-graph.mjs` compiles each evaluated Plan v1 scene frame into a
validated typed graph. The discriminated entity definitions are character,
prop, environment, surface, cameraTarget, effect, and shadow. Every graph
instance carries an ID, pose, world transform, visibility, draw band/z-index,
conservative bounds, and the renderer interactions present for that instance.

The renderer consumes graph visibility, draw ordering, camera target, and
category identities. Existing scene data remains authoritative: character and
prop instances still use the established rigs, actions, vector prop renderer,
and layer bands; backgrounds and the ground line remain the existing vector
draw calls; effects and ground shadows are generated only by their existing
render paths. Lights are not represented because the renderer has no light
simulation or light draw path.

Bounds are conservative display bounds based on rig anchors and the existing
prop geometry families. They are not collision geometry or a physics system.
Supported interactions are derived from actions actually present in the
scene's beats; camera targets expose the existing focus/zoom controls.

## Reusable visual specification

Characters and props may opt into `visualSpec`, validated by
`shared/visual-spec-schema.mjs`. It covers silhouette family, vector geometry
recipe, normalized width/height, material tag, paint fill/stroke/outline,
palette references, facial components, apparel, accessories, decorative
marks, motion anchors, z-index, and either a local or global transform.
Component recipes use the existing safe vector-node grammar and are rendered
as SVG in the evaluated entity frame. Palette indices are validated and feed
actual vector fills. Visual-spec motion anchors may be referenced by existing
prop attachment events and resolve against the renderer's world transform.

The `material` value is a descriptive renderer tag; the current engine remains
a flat vector renderer and does not claim textured or physically based
shading. Z-index orders entities inside their existing draw bands; it does not
override the renderer's semantic back/world/front bands. Visual-spec geometry
is supplemental to the established character/prop drawing, not a replacement
asset pipeline.

## Focused tests and measured output

- `tests/scene-graph.test.mjs` covers category schemas, identity/pose/transform,
  bounds and interaction metadata, actual SVG component output, invalid
  palette and transform-space rejection, attachment-anchor coordinates, and
  legacy deterministic frame equivalence.
- The existing Point 8 frame-replay and interaction-anchor regressions remain
  in place.
- The production path emits category markers into SVG frames. A temporary
  Chromium raster of a fixture with a new palette fill produced measurable
  non-background pixels; no generated proof media is included in the source
  archive.

## Boundaries

No new provider, physics system, external asset loader, lighting system, or
unverified interaction is claimed. Provider testing for Point 9 is OFFLINE.