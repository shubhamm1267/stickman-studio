# Point 8 — legacy plan migration and deterministic replay

## Persisted contract

- The renderer-facing `version: 1` contract remains intact. `schemaVersion: 2`
  marks the Point 8 persisted-plan migration, so existing fixtures still load
  through `validatePlan()` / `migratePlan()`.
- Missing seeds are derived from canonical plan data; `sceneSeed` is stable per
  scene ID. No renderer randomness was introduced. The current evaluator is
  deterministic without consuming random values.
- `canonicalFrame` records each scene's cumulative `[startFrame,endFrame)`
  range at the saved FPS using the existing exact-decimal, nearest-frame clock.
  Duration and FPS edits recompute those ranges.
- `replay` records a SHA-256 fingerprint, seed, FPS, frame count, rounding
  policy, and evaluator identifier. Credentials, provider tokens, URLs, and
  local paths are not replay fields. `verifyReplayPlan()` checks the saved
  record before a saved video review or render reuse.
- The existing review `planHash` intentionally excludes migration bookkeeping,
  preserving prior review validity. Render caching and render reports also use
  the new replay fingerprint.
- Generated/source asset references carry IDs, media type, SHA-256, and rights
  status only. The backend validates and reports those references; it does not
  fetch external media or imply that an asset was generated. Vector plan assets
  remain the renderer's actual visual inputs.

## V3 appearance and event fields

The strict Plan schema now admits appearance requirements, rig profiles and
capabilities, visual-asset requests, object affordances, contact event IDs,
optional hashed source-asset references, rights status, asset capabilities,
measured visual-evidence references, scene seeds, and canonical frame ranges.
Validation rejects unsupported rig/shape capabilities, unknown contact IDs,
restricted assets, and invalid replay references. The deterministic coverage
compiler consumes those fields; display names do not select an implementation.

## Compile-time coverage

`compileCoverageReport()` maps each story coverage event and fidelity
requirement to stable entity IDs, registered rig/shape capabilities, a concrete
animation primitive, a canonical timeline frame, and a SHA-256 digest of the
actual emitted SVG. Renderer output includes stable `data-actor-id` and
`data-prop-id` markers so presence checks inspect rendered output rather than
model claims. Non-legacy generated/authored plans fail preflight when required
links, capabilities, visible actors/assets, or frame changes are missing.
Legacy-migrated plans retain their earlier preflight behavior while the report
still exposes any unresolved coverage for repair.

## Point 8 verification

- `node --test tests/point8-replay.test.mjs tests/inspection.test.mjs tests/capability-compiler.test.mjs tests/motion-ir.test.mjs` — PASS, 44 tests.
- `npm test` — PASS, 6,341 Node tests and 10 Python tests.
- `npm run build` — PASS, production Angular bundle.
- `npm run smoke:render` — PASS, offline Remotion render and FFmpeg decode;
  540×960, 240 frames, H.264/AAC.
- Provider testing was OFFLINE; no Gemini, Freesound, or Cartesia request was
  made for this point.

## Scope boundary

This checkpoint adds deterministic plan persistence, frame-replay checks, and
asset/rig/event coverage diagnostics over the existing vector renderer. It does
not add external raster-asset loading, new media providers, stochastic
animation, or a new physics/runtime system.