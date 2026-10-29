# Point 13 — asset factory pipeline and semantic coverage

## Pipeline contract

`server/asset-factory.mjs` compiles canonical Story IR into an explicit pipeline:

1. `AssetRequest` keeps the canonical story entity ID and derives a stable semantic entity ID.
2. `VisualBrief` records a readable identity, required silhouette family, and requested appearance features. Prop names/labels remain content labels, not renderer dispatch keys.
3. `AssetPlan` selects the deterministic Tier A renderer or a Tier B supplied asset only after its content, rights, geometry, and transparency checks succeed.
4. `ValidatedArt` is either an existing renderer-backed rig/prop/background/effect or a safe vector visual spec. Tier B art is converted into the renderer's bounded visual-spec DSL.
5. `RigInteractionManifest` carries the existing actor rig profile, object affordances, anchors, action/contact references, attachments, and prop motion references.
6. `RenderReadyAsset` links the request to `asset_sha256_<digest>`. The digest identifies the renderer version and compiled content. Identical compiled assets are deduplicated.

The compiler is called on the canonical IR during planning and production. Production applies any render-ready override before rendering, and persists `asset-coverage.json` beside `story-ir.json`. Coverage rows include source/semantic IDs, scene, required silhouette, placements/appearance interval, motion/contact references, resolver tier, and the compiled asset ID. Character designs, prop designs (including unplaced designs), scene backgrounds, every top-level custom scenery node, and transient effects actually emitted by the runtime evaluator at relevant action/motion sample times are represented.

## Resolvers and boundaries

- **Tier A — available:** typed native character rigs, registered prop/background/effect renderers, and the existing safe vector-node / procedural visual compiler. Geometry is validated by the existing Story IR, Plan, visual-spec, and renderer contracts.
- **Tier B — implemented and tested:** an in-process `providedAssets` resolver accepts licensed/original/public-domain PNG or a restricted, geometry-only SVG subset. It verifies byte SHA-256 against the Story IR reference and rejects unknown/restricted rights. Server-side PNG import verifies CRCs, dimensions, decoded pixel channels, and both transparent and visible pixels; browser-safe schema validation checks the PNG signature/header and alpha-channel format. Imported raster nodes are rendered inline by the existing SVG renderer. SVG import rejects executable/external content and unsupported shapes, validates the allowlisted geometry through `NodeSchema`, and rejects an opaque full-viewBox rectangle. The resolver is reachable through `compileAssetFactoryPipeline(..., {providedAssets})` and the production `providedAssets` option; this checkpoint does not add a browser upload UI or persistent asset library.
- **Tier C — unavailable/offline:** no image-generation-capable connected service exists in this project. The Gemini integration requests structured text/story JSON only. No image-generation request, fake provider, or generated media is used. The pipeline reports this state explicitly.

The renderer still uses the established character/prop drawing implementations for Tier A rather than claiming arbitrary generated rigs. Materials and motion remain limited to capabilities the current renderer implements. Scene effect coverage is based on runtime effects present at deterministic event samples, not hypothetical effects.

## Verification

Run:

```bash
npm run test:point13
npm run smoke:point13-assets
npm run test:point12
npm test
npm run build
npm run smoke:render
```

`smoke:point13-assets` renders before/after SVG frames in Chromium at 540×960 and measures pixel differences for a verified transparent PNG. Provider testing is OFFLINE. See the checkpoint delivery report for exact command results.
