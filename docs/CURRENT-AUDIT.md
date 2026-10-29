# Current animation audit

## Point 5 — canonical pipeline and timing parity

See `POINT5-CANONICAL-PIPELINE.md` for the verified request trace, IR boundary,
compatibility limits and test commands. Story/Scene/Performance IR v1 now has
stable IDs and validated graph references; legacy Plan v1 remains the lowering
contract for the current renderer. Preview, Remotion frames and mixed audio use
the same rounded frame clock. A fractional scene boundary that could make the
first exported frame select the previous scene is covered by an HTTP preview
parity regression.

Point 5 verification used offline provider tests and the actual bundled render
smoke. No live Gemini, Freesound or Cartesia call was made. The downloadable
Point 5 checkpoint intentionally contains the user's supplied `.env` byte for
byte; keep that archive private and do not publish it.

## Dynamic core checkpoint

See `ANIMATION-IR.md` for the new versioned canonical motion tracks and compatibility adapter. Semantic fall/slip now compile to generic tracks from JSON data. This is a partial core slice; the full asset/interaction/category architecture remains unfinished. `DYNAMIC-ROADMAP.md` records exact next steps.

## Latest correction

The user correctly identified hidden arms and a rigid fall in `docs/original-encoded-review/final-corrected.jpg`. The older `deliverables/final-original-story` output is superseded by `deliverables/arms-fall-corrected/downloaded-video.mp4`.

Raised bare hands now bring their connected arms above the face, with outward elbows. Falls and slips use anticipation, knee compression, loss of balance, a bracing hand, a grounded hip landing and recoil. Seated recovery starts from every actual fallen limb position. Fall camera bounds sample 61 phases and include the head outline and hands. Semantic direction version 3 recompiles older reviewed scores when rendering from the website.

## Verified current evidence

- `deliverables/arms-fall-corrected/website-test.json`: real server render, browser automatic download and attachment endpoint passed. It reused the existing Gemini original story to conserve credits, recompiling its choreography. This was not a fresh story generation test.
- `deliverables/arms-fall-corrected/encoded-quality-report.json`: complete decode, 1080x1920, 60 fps, 600 frames, 10 seconds, zero clipped audio samples.
- `deliverables/arms-fall-corrected/video-review.json`: independent blind observation followed by story comparison passed, using actual MP4 observations. This is model evidence, not a guarantee of reference-level polish.
- `docs/original-encoded-review/final-arms-fall-corrected.jpg`: contact sheet extracted from the actual downloaded MP4; both arms remain visible in the final head-hold.
- `docs/arms-fall-web-build.txt`: Angular production build passed.
- `docs/arms-fall-final-tests.txt`: current complete test run. Geometry covers grounded falls at both 60 and 120 fps, connected foreground arms, full head/hand framing and provider/retention behavior.

## Coloured dialogue category

The local environment has Gemini and Freesound credentials, but no Cartesia key or cast voice IDs. Live spoken dialogue cannot be verified with these credentials. The website now reports the missing speech provider before requesting a Gemini story. Each speaker still requires a distinct voice ID.

The authored COOL cap coloured demo can render with its bundled recorded nonverbal vocal fixtures. That is a preview of the coloured renderer and download flow, not newly generated spoken dialogue. See `deliverables/coloured-cartoon-preview/website-test.json` and `docs/coloured-preview-live-render.txt` for its actual final status. Bundled previews bypass the live Gemini video review; technical QA and human frame inspection are separate evidence.

GET polling and POST actions now use separate rate-limit budgets. Previously, frequent history reads could make a later Generate/Render request incorrectly return HTTP 429. A regression test sends 125 history reads and then successfully queues a generation request.

## Pipeline and retention

Silent stories use Gemini Flash-Lite semantic direction, literal action contracts, story audit, independent sound direction and the procedural choreographer. Original drafts may be revised if infeasible; explicit user stories are not silently replaced. Freesound resolves action-specific recordings. Audio envelopes drive mouth movement. Remotion and FFmpeg render the chosen frame rate; encoded QA fully decodes the result. The live production gate first observes the MP4 without the story, then compares those observations to the requested checks. One bounded repair is allowed.

Server-generated media expires ten minutes after rendering completes. Timers, requests and restart cleanup enforce expiry; JSON metadata and already downloaded copies remain. `docs/live-retention-verification.json` records an earlier actual ten-minute deletion and HTTP 410 check. Current retention regressions also run in the full suite. Review alone does not extend expiry.

## Earlier findings and limits

The pen draft in `deliverables/semantic-original-repaired/video-first-attempt.mp4` was falsely approved by the old story-informed reviewer; the blind review correctly rejected it. The older duck story in `deliverables/semantic-user-story` also failed the newer blind review and is not an approved current sample.

This is a finite procedural engine, not unrestricted text-to-video. Human and dog/cat/lion rigs, rigid props and authored pose channels do not automatically implement arbitrary anatomy, deformation, disassembly, liquids or machinery. Some stories fail validation or visual review. Passing technical checks does not guarantee comedy quality or perfect sound choice. No current run proves every possible story works.

## Run

Run `npm start` and open http://127.0.0.1:3001. Keep the existing `.env` and the Point 5 archive private; do not publish the archive. A blank story requests an original gag. Automatic MP4 download is enabled by default.

`npm run check` runs tests and the web build. `scripts/live-website-test.mjs` supports actual Generate tests, supplied-plan render/download checks (`SAMPLE_PLAN`) and clearly labelled bundled previews (`SAMPLE_BUNDLED_EXAMPLE`). `scripts/check-dialogue-prerequisites.mjs` verifies the missing speech credentials path without spending Gemini planning credits.

## Checkpoint 03 source audit (2026-10-25)

The inspected `StickLaugh_Dynamic_02_RigCapabilities_Partial.zip` had 209 entries, passed ZIP CRC validation, contained no absolute or traversal entry paths, and has SHA-256 `04f0d857837fd13321a3986a460b995ed96af1ce6c2e75a138ba40134b8fa403`. It was extracted separately; the supplied archive was not modified.

### Verified source path and field consumption

1. `web/src/main.ts` `generate()` posts story, production mode, art style, format, duration, fps, language, category, opt-in and comedy settings to `/api/plan`.
2. `server/index.mjs` parses request options, normalizes settings, applies adult-category request checks, and queues the configured planner.
3. `server/providers.mjs` routes semantic, non-dialogue plans to `server/semantic-director.mjs`. The director sends the `MOTION_CAPABILITIES` manifest to Gemini, requests structured score output through Zod schemas, checks actor/object action contracts and story coverage, and fails when declared unsupported requirements remain. Provider output is parsed as data; the reviewed path does not execute model output as code.
4. `server/choreographer.mjs` compiles the semantic score to the current Plan v1, then `migrateMotionIR()` canonicalizes supported performance keys into Motion IR v1 tracks and `validatePlan()` checks the resulting plan. Legacy named actions are still evaluated by specialized branches.
5. The UI installs the returned plan and calls `updatePreview()`. `/api/preview` validates the plan and calls `svgFrame()`; rendering consumes actual track values in `renderer/engine.mjs` and visual data in `renderer/draw.mjs`.
6. `/api/render` validates the submitted plan, applies the review gate for live renders, queues `produceFilm()`, and persists the reviewed plan. `server/render.mjs` passes the plan to Remotion. `renderer/index.tsx` calls the same `svgFrame()` at `offset + frame / fps`; audio is a separate Remotion Audio layer followed by the existing FFmpeg timing/mux path.
7. On completion, `web/src/main.ts` can invoke `downloadVideo()` automatically. It uses `/api/files/:id/video.mp4?download=1`; `server/index.mjs` serves that endpoint as an attachment. This is a source trace; actual local browser evidence is recorded below.

### New verified geometry path

`PropSchema.nodes` now accepts validated nested `group` objects with bounded translation, pivot, rotation, positive scale and opacity. A total of at most 100 geometry nodes per prop and at most four group levels are accepted. `renderer/draw.mjs:nodes()` recursively consumes the groups and restricted path/ellipse/line children. The hand-authored lantern fixture now exercises a group in its ordinary rendered output. The same `svgFrame()` call path serves preview and Remotion; focused tests verify generated SVG contains the transformed group and primitives. Group transforms are static, not animated parts or interaction anchors.

### Explicitly unverified this session

No `GEMINI_API_KEY`, `FREESOUND_API_KEY`, or `CARTESIA_API_KEY` was configured in the process environment, and the extracted project has no `.env`. A fresh provider-generated story, new adult-comedy output, live-provider review, or speech synthesis was therefore not attempted. The historical delivery files referenced earlier in this document are not included in this partial source archive and were not reopened or revalidated here. The local bundled browser/export checks below prove only the hand-authored renderer workflow, not Gemini generation or arbitrary-character likeness.


### Final fixture QA evidence

- The hand-authored `examples/motion-ir-lantern.json` was exported through the website UI in bundled-demo mode. Browser automatic MP4 download passed; `/api/files/:id/video.mp4?download=1` returned an attachment. The measured `automaticDownloadLatencyMs` was **1,143 ms**, measured from Playwright's browser download event until `saveAs()` completed on this local test environment; it is not an “instant” guarantee or a network-independent benchmark.
- The downloaded file fully decoded: H.264, 1080×1920, 60 fps, 240 frames, 4.000 s; AAC stereo 48 kHz, 4.011 s; 0 clipped audio samples. The fixture's audio is intentionally silent (`audioPeak: 0`). A representative frame was extracted and visually inspected; the transformed lantern group is visible.
- The same final fixture also rendered and fully decoded at 120 fps in draft resolution, 540×960, 480 frames, 4.000 s; AAC stereo 48 kHz, 4.011 s; 0 clipped samples. This is a technical fixture check, not a production-quality assessment.
- The `/api/preview` regression test requests `motion-ir` and asserts the transformed-group marker and geometry are present. Source and test evidence show preview and export use the same `svgFrame()` path. The website's bundled demo mode bypasses Gemini planning/review; no fresh generated story, live-provider review, Adult Comedy output, or speech synthesis was tested.

## Checkpoint 04 source audit — bounded prop interaction anchors (2026-10-25)

The supplied `StickLaugh_Dynamic_03_SceneGraphGroups_Partial.zip` was checked
before extraction: 224 entries, ZIP CRC test passed, no absolute/traversal paths
or symlink entries. Its SHA-256 was
`22c916414b29172870c14cc43361431c962d70f7fb8c7d4264e10faad9b6ee0b`. It was
extracted into a separate working directory; the attached archive was left
unchanged.

### New verified interaction path

- `shared/schema.mjs` adds optional `PropSchema.interactionAnchors`, limited to
  16 unique IDs with local positions bounded to ±250. Initial attachment and
  timed attachment events may reference an anchor through `propAnchorId`.
  Validation rejects undeclared anchors with scene, prop and event context.
- Timed release events may optionally provide a world-space `position` and
  final `angle`; a placement transform on an attachment/transfer event is
  rejected.
- `renderer/engine.mjs` resolves a named prop point against the actor bone,
  actor-local offset, actor scale, body/bone angles, prop scale and prop angle.
  Without a named anchor, legacy attachment placement is unchanged. Release
  without a destination preserves the evaluated world transform.
- `examples/prop-exchange.json` is generated by
  `node scripts/make-prop-exchange-fixture.mjs`. It uses one custom vector
  parcel, two characters with different scales/facing, a named handle, timed
  pickup/carry/transfer/place data, and visible reactions. It is hand-authored;
  it is not a Gemini-generated result.
- `tests/interaction-anchors.test.mjs` checks schema bounds and references,
  anchor alignment during carry and transfer, handoff position/orientation/
  scale continuity for the fixture's deliberately aligned hands, release/place,
  repeated absolute-time evaluation, visible face changes, shared SVG output,
  and HTTP `/api/preview`. All seven focused tests passed.
- Four representative SVG frames from the shared renderer were rasterized and
  visually inspected. Pickup/carry, transfer, ground placement, and the two
  reactions are visible. The preview and Remotion paths both call `svgFrame()`;
  an MP4 export for this fixture has not yet been recorded.

### Verification and provider availability

- Baseline before edits: `npm test` — 6,282 passed, 0 failed; `npm run build`
  passed.
- After edits: `npm run check` — 6,289 passed, 0 failed; Angular production
  build passed. The source ZIP will be created separately from the input ZIP.
- `npm ci --ignore-scripts --no-audit --no-fund` succeeded using the supplied
  lockfile. Node v24.22.1.
- The extracted input included a local `.env`. Its values were never displayed.
  A name-only check found both `GEMINI_API_KEY` and `FREESOUND_API_KEY` present.
  No Cartesia key was checked, read, configured, or used.
- No fresh Gemini story test, Freesound retrieval, live provider review, or
  Cartesia/speech operation has been run for checkpoint 04. The generated
  vector fixture and automated checks are offline.

### Known limits and next work

The fixture authors its receiving-hand position and orientation to make the
handoff continuous. No general geometric continuity solver or validation yet
rejects a discontinuous receiver pose. Existing named `pick`/`place`/`throw`
action branches remain alongside the generic timed attachment data. The
umbrella, tray accident, adult-date and new-combination acceptance fixtures,
broader asset/rig capabilities, full renderer parity MP4 inspection, and a
fresh provider-generated story remain future work.

## Point 1 environment and baseline verification (2026-10-26)

The Point 1 verification record is in `docs/POINT1-VERIFICATION.md`. The
received ZIP passed CRC and safe-path checks, but its SHA-256 differs from the
expected hash supplied for Point 1. Treat the received source as an
unauthenticated variant until the correct archive is provided.

In the extracted working copy, `server/index.mjs` loads `dotenv/config` and the
plan/render routes fall back to `GEMINI_API_KEY` and `FREESOUND_API_KEY` from
the server environment. The private `.env` remained local and was not packaged.
Real Gemini and Freesound requests passed. A live backend plan request reached
the Gemini choreography/audit path but failed because the generated score did
not represent a required pickup action; this did not pass the live Generate
test. The offline suite passed 6,289 tests and the Angular production build;
the seven focused interaction-anchor tests also passed. No MP4 export was
executed or claimed.

## Point 2 — fixed story-noun restrictions audit (2026-10-26)

See [`POINT2-FIXED-NOUN-RESTRICTIONS-AUDIT.md`](POINT2-FIXED-NOUN-RESTRICTIONS-AUDIT.md)
for the source-grounded Generate-to-MP4 trace, fixed vocabularies and
type/action gates, renderer consumers, Plan v1 compatibility plan, and
capabilities still required. This was documentation-only: no application code
or restrictions were removed, and no new entity support or MP4 was claimed.
The configured working `.env` was preserved byte-for-byte and is included in
the updated ZIP at the user's request; treat that archive as private.
