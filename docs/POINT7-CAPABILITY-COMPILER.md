# Point 7 — capability compilation and diagnostics

## Compiler contract

- `shared/capability-compiler.mjs` is the technical dispatch boundary for the
  semantic director. A primitive ID and entity ID select implementation;
  character names, prop names, descriptions, and story text never select
  behavior.
- The planner receives the registered capability manifest before generating
  its score. Every semantic primitive declares its validated Plan lowering.
  The compiler then validates the model result against the strict
  `DirectorScoreSchema`; it does not strip unknown fields or widen enums.
- A valid primitive/rig combination is `supported`. Registered 2D
  approximations, including rigid-prop flight, root-height jumps, and the
  side-landing preset, are `approximated_with_disclosure`; their limitations
  are attached to the plan review summary. Unimplemented anatomy, primitives,
  controls, and prop interactions produce `unsupported` diagnostics.
- Diagnostics carry `sceneId`, `entityId`, `actionId`, `unmetCapability`,
  `offendingField`, a stable error code, and safe recovery choices. Async plan
  jobs preserve these records in `capabilityDiagnostics`; the API capabilities
  endpoint exposes the planner manifest.
- A rejected strict Zod result is inspected only for capability-specific
  errors before the provider retry path can discard the generated value.
  Unsupported actions are not reduced to an unstructured string, silently
  skipped, or reinterpreted from descriptions.
- Animal choreography is enabled only for registered primitives consumed by
  the actual animal renderer. The existing humanoid/animal Zod action and
  Motion IR control checks remain strict.

## Compatibility

- Plan v1 stays the renderer contract and its action enum is not deleted.
- `migrateMotionIR()` remains the explicit adapter from inline legacy
  performance keys to one-owner Motion IR tracks.
- `planToStoryIR()` and `storyIRToPlan()` continue to upgrade and round-trip
  Plan v1, saved Motion IR scenes, and Story IR v1 through the existing
  validated adapter. Regression tests compare evaluated legacy frames before
  and after conversion.
- Existing examples remain source fixtures. No fake provider response, media,
  or capability implementation was added. Provider tests and compiler
  verification are OFFLINE.

## Point 7 verification

- `node --test tests/capability-compiler.test.mjs tests/capability-discovery.test.mjs tests/motion-ir.test.mjs tests/canonical-story-ir.test.mjs tests/v4.test.mjs` — PASS, 47 tests.
- `npm test` — PASS, 6,333 Node tests and 10 Python tests.
- `npm run build` — PASS, production Angular bundle.
- `npm run smoke:render` — PASS, offline Remotion render and FFmpeg decode;
  540×960, 240 frames, H.264/AAC.
- No live Gemini, Freesound, or Cartesia request was made. The renderer-frame
  tests use existing authored animal and motion fixtures.

## Scope boundary

This is a deterministic compiler/diagnostic layer over registered primitives,
not a general-purpose text-to-video engine, a full physics simulator, or a
direct Story IR v2 renderer. Plan v1 and its renderer adapter remain in place.