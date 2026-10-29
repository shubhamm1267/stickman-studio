# Point 6 — stable entity IDs, frame-based Scene IR, and versioning

## Contract

- New canonical artifacts are Story IR v2, Scene IR v2 and Performance IR v2.
  They retain the Point 5 deterministic IDs and graph validation.
- `timebase.fps` is the integer output FPS (`renderFps`, default 30). Global
  frame 0 is the start of the story; each scene has its own local frame 0.
- Scene durations are accumulated as exact decimal rationals. Each cumulative
  boundary is rounded to the nearest output frame once; the next scene begins
  at that exact integer boundary. This is the same schedule used by preview,
  Remotion and the audio mix.
- Scene/action/camera/prop-motion/reaction windows are half-open intervals:
  `[startFrame,endFrame)`. Authored instant events select the first output
  frame at or after the source timestamp. Every event carries a scene-local
  frame and its corresponding global frame (or a global offset for an event
  list resolved at render time).
- Action contacts use the registered Plan v1 action-event phase. `react`
  primitives additionally produce a reaction record whose window is the
  reaction action's half-open interval. Transition `atGlobalFrame` is the
  source scene's end boundary and is a cut, not a crossfade.
- Unlinked SFX and dialogue use their authored start timestamps; `syncTo:
  start` uses the linked action's start; `syncTo: contact` emits the linked
  action's contact instants. Durations are rounded up to frames. Footfall
  synchronization is resolved from the renderer's 120 Hz crossing samples,
  then rounded up to the first output frame at/after each crossing. The
  renderer's sampling policy is included in the IR rather than claiming a
  precomputed crossing list.
- Mouth-envelope values use clip-relative offsets quantized to the nearest
  output frame. They are not story-global event timestamps.
- Exact base-10 rational conversion is implemented in
  `shared/frame-clock.mjs`; `shared/timeline.mjs` uses those same cumulative
  boundaries. Timeline events are not accumulated in floating-point seconds.

## Semantic and technical fields

- Actor semantics are `displayName` and optional `description`; execution uses
  a registered `rigProfile` and explicit supported-control `capabilities`.
- Prop semantics are `displayName` and optional `description`; rendering uses
  a registered `shapeDefinition` and declared rendering/attachment
  `capabilities`.
- Actions expose a registered `primitiveAction` ID. Technical IDs are
  independent of display text, person names, prop labels and story titles.
- The v2 projection is built from validated technical Plan v1 enum values.
  Unknown profiles, shapes or primitives fail closed. No text matching of
  character names, prop display names, or story titles is used to select a
  technical mapping.

## Version migration and compatibility

`planToStoryIR()` emits v2. `validateStoryIR()` validates v2 projections and
their compatibility source. `storyIRToPlan()` accepts both v2 and the previous
Story IR v1. V2 contains `compatibility.storyIR` (schema v1), which is the
explicit exact-seconds adapter needed by the existing Plan v1 renderer. The
frame projections are deterministically regenerated from and checked against
that adapter; altering a frame, type mapping or reference without updating the
source is rejected.

Plan v1 input, stable IDs, and render behavior remain compatible. The
compatibility adapter remains a runtime boundary: the renderer is not yet a
direct Story IR v2 executor, and Plan v1 has not been deleted. Existing older
plans without child IDs still receive deterministic IDs based on their first
canonicalization; insertion into a never-canonicalized legacy array can change
those generated IDs.

## Verification boundaries

The canonical IR, fractional cut preview, integer frame clock, offline audio
scheduling and actual Remotion render are the relevant Point 6 checks. Provider
behavior is not needed to exercise this deterministic migration; no provider
response is synthesized or represented as a live test. See `CHECKPOINT.md` for
the exact commands and artifact verification.