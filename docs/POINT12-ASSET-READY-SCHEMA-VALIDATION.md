# Point 12 — asset-ready schema validation and visual fixtures

Point 12 extends the existing bounded vector renderer with a deterministic
asset-ready visual compiler and additional typed scene-graph checks. It builds
on Points 9–11; it does not replace Plan v1 or add an external asset loader.

## Description-to-recipe contract

`shared/asset-ready-visual.mjs` accepts a structured visual description paired
with a `geometryRecipe` and/or registered `proceduralComponents`. The
description is editorial context, not executable code and not a prompt that
silently causes an image provider call. The compiler:

- validates primitive nodes with the same bounded SVG-path and geometry schema
  used by the runtime;
- validates registered procedural component IDs/options by expanding each
  through `shared/geometry-library.mjs`;
- enforces one 100-node total across static and generated shape recipes;
- carries `motionAnchors` in the visual spec and named `interactionAnchors` in
  the returned design record, preserving prop-to-hand attachment references;
- rejects a visual description with no safe shape recipe.

The returned procedural components retain their root/head/torso/hand/foot
attachment, local transform, and layer data so the current renderer can rig
them. Existing drawing-node and visual-spec inputs continue to be accepted.

## Source and rights transparency

`assetSource` is strict provenance, not a fetch instruction:

- `procedural-svg` records the safe geometry compiler and original authorship;
- `user-supplied` records a source reference, content SHA-256, media type, and
  rights status;
- `verified-generated` records provider identity and explicit verification
  evidence/time alongside the asset hash and rights status.

The current renderer preserves these fields as escaped SVG data attributes.
It does not load or embed a user-supplied or generated raster/SVG asset; the
visible output remains the validated vector recipe. A caller-provided
`verified-generated` record is provenance metadata only—it is not proof that a
provider was contacted or that the referenced bytes were independently checked.
Restricted-source visual specs are rejected by plan validation.

Materials remain descriptive metadata; there is no lighting, executable
material function, remote SVG, or arbitrary plugin support.

## Typed graph validation

Typed scene-graph transforms now have finite coordinate/scale/rotation bounds.
Optional `entityRefs` must resolve within the graph and form an acyclic graph.
Entity categories are constrained to their renderer layer bands (for example,
camera targets use `camera`, while props use `back`, `world`, or `front`).
Duplicate graph IDs, duplicate references, missing targets, and cycles fail
closed. Existing `sourceId` values remain references into the Plan and are not
interpreted as graph edges.

The Point 12 tests cover malformed and oversized paths, non-finite values,
static/generated node budgets, huge transforms, unsupported material functions,
duplicate IDs, circular/missing entity references, and invalid category/layer
relationships.

## New visual fixtures

`examples/point12-asset-ready-visuals.json` adds eight art-directed,
non-demo combinations: three foods, three household objects, and two signs.
Each recipe varies silhouette, normalized dimensions, color palette, material
metadata, and visible vector texture/detail while carrying named anchors.
`scripts/render-point12-fixtures.mjs` sends each fixture through the actual
`svgFrame()` renderer and captures a 540×960 Chromium raster. The companion
`scripts/check-point12-raster.py` checks image dimensions, nonblank measured
foreground bounds, visible color variation, archive hashes, and pairwise pixel
differences.

Run the focused gate with:

```bash
npm run test:point12
```

Verification for this checkpoint: the focused gate passed (22 Node tests and
all eight 540×960 raster checks); `npm test` passed (6,365 Node tests and 10
Python tests); `npm run build` passed; and `npm run smoke:render` passed with
an offline 540×960, 240-frame H.264/AAC render and FFmpeg decode. No live image,
Gemini, sound, or other provider request was made (**provider testing: OFFLINE**).

The screenshots are renderer output, not provider output. Provider testing
remains offline; no optional image-generation provider is called by these
fixtures.

## Boundaries

This adds a safe structured compiler, provenance fields, and graph validation;
it does not infer drawings from arbitrary natural-language-only input, load
external images, verify third-party licenses, contact image-generation
providers, or implement custom rigs/material functions. New art must have an
explicit bounded recipe to render. The source and rights status stay visible
even when an asset reference is not currently renderable.