# Point 5 — canonical story-to-video pipeline trace

## Request and runtime trace

1. `web/src/main.ts:generate()` sends the free-text story and render settings to
   `POST /api/plan`. `server/index.mjs` validates/normalizes the request and
   queues `server/providers.mjs:planStory()`.
2. The default silent-SFX route calls `server/semantic-director.mjs`. Gemini
   returns structured director-score data validated by Zod; the pipeline checks
   actor/object action contracts, literal story coverage, and an independent
   audit. A sound-director request maps the accepted events to cue intent.
   Dialogue-toon uses the existing provider planner branch. Provider output is
   data, never executable code. Offline tests use injected fetchers and authored
   fixtures; a live provider response is not claimed for this checkpoint.
3. `server/choreographer.mjs:compileDirection()` resolves the story score to
   characters, prop designs, environments/backgrounds, staged scene cast and
   prop placements, timed actions, camera shots, sound cues and scene coverage.
   `shared/motion-ir.mjs` migrates supported performance keys into the existing
   Motion IR track contract. The action schema/evaluator keeps legacy named
   actions as compatibility behavior.
4. At the server plan/review/preview/render boundaries,
   `shared/canonical-story-ir.mjs:canonicalizePlan()` validates Plan v1, adds
   durable IDs to legacy entities that lacked them, creates Story IR v1 with
   separate design-time intent/designs and executable Scene IR v1 /
   Performance IR v1 records, then validates global IDs and reference edges.
   `storyIRToPlan()` lowers that IR to the current Plan v1 evaluator contract.
   The normalized plan and `story-ir.json` are both persisted for plan/render
   jobs. Existing explicit character, prop-design and scene IDs are preserved.
5. `server/sound-director.mjs` supplies deterministic action-specific cues;
   `server/timing.mjs:expandIndexedCues()` expands beat/footfall synchronization.
   `server/media.mjs:buildAudio()` resolves curated fixtures or Freesound, then
   renders the timed mix with FFmpeg. Scene starts, SFX, dialogue and total audio
   duration now use the same rounded frame clock as the video composition.
6. Browser frame preview posts the selected plan, format, frame rate and time to
   `/api/preview`. The route canonicalizes the plan, converts time to the
   nearest frame, and calls `renderer/engine.mjs:svgFrameAtFrame()`. The visible
   preview is an actual still SVG frame; it is not a realtime video/audio
   playback simulation.
7. `server/production.mjs:produceFilm()` persists the canonical IR and runtime
   plan, builds audio, and calls `server/render.mjs:renderFilm()`. Remotion uses
   `shared/timeline.mjs:timeline()` for cumulative rounded scene frame ranges
   and `svgFrameForScene()` for each scene-local frame. The same underlying
   scene evaluator and SVG renderer power preview and export. Remotion encodes
   H.264 video/AAC audio; FFmpeg/ffprobe timing, stream, decode and quality
   checks run before the job completes.
8. The completed job exposes the video and `story-ir.json` via
   `GET /api/files/:id/:name`; `?download=1` sends an attachment. The website's
   existing `downloadVideo()` path requests the MP4 attachment automatically.

## Inconsistency repaired

Previously, Remotion chose scene boundaries from cumulative durations rounded
into frame indices, but its frame component then passed the rounded start time
back into `svgFrame()`, which chose a scene from unrounded seconds. At a
fractional boundary this can select the *previous* scene for the first frame of
the next Remotion sequence. `/api/preview` also used raw-second scene selection.
For example, at 60 fps a 4.305-second first scene starts the next Remotion
sequence at frame 258 (4.300 seconds), which is still inside the prior scene
under raw-second lookup. Preview and MP4 could therefore disagree at that cut.

The renderer now resolves the exact integer frame range shared by the
composition; the API preview snaps to the same frame clock. Audio cue starts
are rounded up to the first encoded frame at/after their authored local time and
use the rounded scene offset. A regression compares the HTTP preview SVG at a
fractional cut with the renderer's scene-specific boundary frame. The actual
Remotion smoke also generated and decoded an H.264/AAC MP4.

## ID and migration contract

- `storyId` is stored in the returned Plan and persists across subsequent edits.
  Missing child IDs are deterministically assigned and stored for actor
  instances, prop placements, prop geometry/environment elements, prop
  motions, actions, cameras, sound cues, dialogue, attachments and timed
  attachment events. Scene transitions and prop-anchor references receive
  canonical IDs in Story IR v1.
- Story, design, scene, and performance entities use a single global ID space.
  The validator rejects duplicate IDs and missing actor/prop/environment/action/
  camera/cue/attachment/transition references. Old plans remain accepted; their
  missing IDs are generated once at canonicalization.
- Identity-only migration does not invalidate an otherwise current story review:
  `planHash()` excludes generated identity fields but keeps the referenced plan
  semantics.
- This is a compatibility migration, not a completed deletion of Plan v1.
  Scene and Performance IR are the canonical pipeline contract, then lower to
  Plan v1 for the current renderer. Legacy action branches remain. IDs generated
  from old plans without IDs use deterministic scene/type/array-position seeds;
  once serialized in the normalized plan they remain stable through later
  edits. Inserting items into a legacy plan that has never been canonicalized
  can change the newly generated IDs for those items.
- The still-frame UI preview does not play the final mixed audio. Existing SFX
  audition controls play curated fixture clips; the exported mix may also use
  resolved Freesound recordings. They are not presented as an identical live
  audio preview.

## Offline evidence

- Focused tests: `node --test tests/canonical-story-ir.test.mjs` — PASS; stable
  IDs, reference rejection, round-trip compatibility, fractional frame
  boundaries, actual HTTP preview parity and audio timestamp alignment.
- Renderer regression set: canonical Story IR, Motion IR, interaction anchors,
  Point 4 compatibility and story-contract tests.
- `npm run build` — production Angular build.
- `npm run smoke:render` — bundled offline audio generation, actual Remotion MP4,
  H.264/AAC stream check and FFmpeg decode.
- `npm run smoke:download` — actual local API render, MP4 attachment response
  byte equality, Story IR v1 artifact download, stream/frame check and FFmpeg
  decode.
- `npm run smoke:audio-clock` verified a bundled 13-cue mix at 16.500 seconds with a nonzero signal.
- No Gemini, Freesound or Cartesia request was sent for Point 5. Provider testing
  is OFFLINE; the authored bundled sound assets were used in the render smoke.
