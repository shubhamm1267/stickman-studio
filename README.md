> Latest update: read [UPDATE-START-HERE.md](UPDATE-START-HERE.md) and [verified scope / remaining work](docs/UPDATE-STATUS.md). Earlier claims below describe historical versions.

# Current update — three SFX styles and dynamic movement

Start with [README-THREE-STYLES-HINDI.md](README-THREE-STYLES-HINDI.md). The current studio uses Gemini + Freesound for all three styles and has no Cartesia requirement. The notes below describe historical releases.

# V9 update

Start with [README-V9.md](README-V9.md) and [V9 validation](docs/V9-VALIDATION.md). The following notes describe previous releases.

# StickLaugh Studio 8.0

Angular + Node.js + Remotion + FFmpeg, with original procedural 2D character rigs. This release concentrates on the visible problems in V7: small reaction framing, wrist alignment, shoulders moving with head rotation, generic grunt delivery, mismatched effects and slow pacing.

## Run on Windows

Install Node.js 24 LTS, Chrome and FFmpeg/ffprobe, with both FFmpeg executables on PATH. Extract the ZIP, open `StickLaughStudio`, run `START_WINDOWS.bat`, then open http://127.0.0.1:3001.

Manual commands:

```sh
npm ci
npm run setup
npm run build
npm start
```

If Chrome is not detected, copy `.env.example` to `.env`, set `CHROME_PATH`, then rerun setup. No credentials are included. Connections supports session-only keys or optional Remember on this device.

## What changed

- V2 shoulders are anchored to the torso. Head tilt no longer drags the entire arm root sideways.
- Articulated hand silhouettes have a real wrist origin, left/right handedness, finger creases and forearm-following orientation. Gripping hands follow object rotation and render over held objects, including props attached from the first frame.
- Generic `punch` targets a cast member's cheek, with wind-up, short strike, contact hold, recovery and damped victim recoil. `hit:false` means a miss: no phantom impact or victim reaction. `scold` provides varied point/palm/fist gestures.
- Remotion scene `Sequence`s, fps-aware timing and deterministic `spring()` secondary motion share the same seconds clock as audio. Silent demos use60fps; coloured dialogue demos use30fps. Selective hand trails and brief foreground contact accents emphasize fast movement.
- Reaction shots permit closer framing (zoom up to6). The new superhero sample uses larger facial reactions, faster cuts and a clear return-gift reversal.
- Actual CC0 human gibberish recordings replace repetition of a single grunt in the new samples. Nonverbal vocal cues bind to an actor and generate mouth cues from measured audio energy, including pauses.
- Sound direction assigns a literal pre-contact air swish and contact impact to punches. Misses get a swish only. Curated punch/whoosh/gibberish/steps/plop/cloth categories resolve consistently. Unmapped effects can use Freesound search.
- “Listen to this scene's sounds” auditions the actual trimmed, pitched cue before rendering. Unknown sound IDs and invalid ranges are rejected.
- Timed prop attachment events support detach, free motion and reattachment. Detach starts at the evaluated moving bone; head-worn props follow V2 face squash and preserve world size through a handoff.
- Actual generated dialogue durations cannot silently overlap unless an interruption explicitly sets `allowOverlap:true`.
- One frame-rounding rule keeps scene ranges and composition length consistent. A timing normalizer checks final frame counts.

## Modes and ready samples

| Mode | Ready video | Length | Audio |
|---|---|---:|---|
| Silent pencil slapstick | `deliverables/superhero-return/video.mp4` |16.5s,60fps | Real recorded gibberish + contextual CC0 effects; no intelligible dialogue |
| Coloured cartoon | `deliverables/cool-cap-v8/video.mp4` |17.6s,30fps | Genuine recorded gibberish preview voices + CC0 effects |

Both samples were rendered by the real project API at1080×1920, H.264/AAC. Each folder includes MP4, thumbnail, actual rendered plan, creator pack, credits and render/quality reports. The superhero sequence was revised after checking a short action prototype and correcting screen direction.

`npm run samples` reproduces both bundled samples with no API keys. `node scripts/render-v8-samples.mjs superhero-return` renders just that sample. `npm run review:v8` prepares internal pose/audio review frames.

For new stories, use your Gemini key. The planner extracts characters, explicit outfit/prop requirements, actions, shots and sound categories, then validates and reviews the plan. Curated recordings need no Freesound key; effects outside the curated library need one. Unsupported actions must be reported instead of replaced with unrelated gestures.

Cartesia remains the live dialogue provider: set your key and a distinct voice ID for each speaker. To hear the coloured demo's original short Hindi lines, load it and tick **Use live Cartesia cast voices instead of nonverbal preview vocals**. The supplied MP4s use recorded gibberish; they are not live Cartesia or live Gemini outputs. There is no fallback to a different TTS service.

## Verify

`npm test` and `npm run build`. Current results are in `docs/tests-v8.xml`, `docs/ui-v8.json`, `docs/frame-geometry-v8.json`, `docs/encoded-qa-v8.json` and `docs/v8-sample-results.json`. Most of the older parameter tests remain as regression coverage; their count is not a quality score. New tests cover torso anchoring, wrists, punch targets/misses, recorded vocal mouth cues, grip layering, ownership handoffs, sound auditions, speech overlap and frame rounding. Browser checks cover both mode selectors and sound-audition controls.

The ready samples were decoded and their encoded frames visually reviewed. Geometry was evaluated at every output frame. A short action prototype was inspected before the final exports. Automated checks do not establish whether viewers will laugh or whether arbitrary stories match the references artistically.

## Sound sources

New recordings are by frosthardr (gibberish,346638), Reitanna (strained gibberish,343977), velcronator (whoosh,733905) and Paul368 (punch,322250), under CC0. Their public source pages, edits and additional-source credits are recorded in `assets/sfx/manifest.json`. Downloaded HQ preview MP3s and a preparation recipe are included in `assets/sfx-sources/` and `scripts/prepare-sfx-v8.py`. They are public recordings, not the uploaded reference videos' audio. Existing CC0 fixtures remain available for earlier examples.

## Limits

Dynamic generation now requests a separate validated performance-direction JSON
before scene staging. It records one action per required event, anticipation,
contact/release/settle times, support feet, the actual available rig controls,
gaze/reaction intervals, camera intentions and Freesound phase cues. Staging
must implement the action and resolved prop ownership; declarations alone do
not pass. Errors carry scene/event/time/actor and a concrete repair. The score
is retained in `directionScore` and survives canonical replay and full repairs.

Native facial acting compiles into face-only performance keys with deterministic
blinks, an anticipation hold, directed gaze, reaction and optional recovery.
Explicit directed gaze/recovery replaces overlapping staged facial channels;
otherwise existing authored face keys take precedence. Body contacts and coverage
indices are retained. Hold and linear interpolation are available alongside the
eased profiles. Custom/animal art requires its supported part/rig controls;
this does not create arbitrary new skeletons. Object blueprints can declare
part operations and rotation limits, which part-track compilation validates.
Full-plan repairs recompile the saved acting score. Anticipation explicitly keys
the mouth closed so sparse interpolation cannot reveal the reaction early.
Native overlay designs reject named duplicate base anatomy; this heuristic is
not a visual anatomy proof. Contradictory outfit/label requirements are rejected
at the outline stage, before asset generation. Identical standalone and first-key
pose channels normalize to one owner; contradictory values still require repair.

Mechanical Freesound cues replace matching actor vocal cues at the directed
event clock. Effect candidates with voice/speech/grunt metadata are excluded;
metadata cannot prove that a recording contains no speech or fits the joke.
Dynamic production additionally observes each candidate audio recording without
its title/query, then compares audible pitch/timbre/envelope with the cue. It
uses the accepted event onset, caches content-bound reviews and tries up to three
different Freesound recordings on acoustic rejection, changing to a literal
alternate search phrase on retry. The actual cropped/rate-adjusted cue is
independently reviewed too: a matching long recording cannot pass if the used
slice becomes a click or silence. Reports are saved beside
the render as `sound-review-<scene>-<cue>.json`; CC0 credits remain included.
Speech/music are rejected. These model judgments can still misidentify sound;
required cues fail clearly when no reviewed recording fits, rather than silently
using an unrelated sound. No synthesized fallback is introduced.

Directed camera shots now own their cut boundaries and can specify `framing`:
`full-body`, `medium` or `close-up`. The compiler samples actual native human rig
extents and accounts for landscape, portrait and square dimensions when computing
focus/zoom. Style compilation preserves that framing. Custom artwork retains its
authored camera because humanoid extents do not establish arbitrary creature bounds.
The facial compiler uses distinct controls for curiosity, shock, laughter, crying
and the other supported emotions; it respects the renderer's brow-height sign.
An optional scene-local `gazeAt` places the actual eye movement after its cue;
older scores derive a gaze lead from the related sound phase. Gaze starts from
the authored initial pose or forward, rather than already looking at the target.
Explicit face-reaction close-up requests must frame the reaction when it occurs.
When whole-video observations omit the ending, review adds a separate blind tail
clip and merges its independent evidence before comparing with the story.

Every following scene receives the previous evaluated end-state receipt.
Continuous cuts check root positions and prop positions/ownership, actor scale
and facing. Support-foot checks sample world positions. Deliberate location or
time changes require an explicit transition explanation. These checks cover
selected physical invariants; they do not prove every action is natural or
every continuous joint pose is preserved. Rendered visual review remains required.

Prop drawing now has a construction brief (silhouette, connected parts,
proportions and diagnostic details), a rendered PNG observation without the
intended name, and a separate comparison against required features. Missing
feature evidence rejects the candidate even when its broad identity is guessed.
Rejected pixels accompany redraw feedback. Previews fit the actual drawn bounds.
Artifacts are kept under `data/asset-recognition`. These are model checks and can
still miss mistakes; they do not establish universal professional art quality.

Native banana and discarded-peel drawings use original construction artwork in
`shared/prop-construction.mjs`. Dynamic generation uses that artwork only as an
image guide; its prop geometry comes from Gemini JSON, including those types.
`server/object-blueprint.mjs` requests named parts with drawing primitives,
parent connections, pivots, contact anchors and feature-to-part links. It rejects
unknown parts, hierarchy cycles, missing feature links and visibly separated
parent/child bounding boxes. The measured drawing bottom is aligned to its
origin and grip/support anchors follow the same offset. Bounds overlap does not
prove a mechanically correct joint; rendered review remains necessary.

Run `node scripts/generate-object-json.mjs "object description" output-directory`
to exercise the same JSON compiler and recognition checks with live Gemini.
Source blueprints and compiled assets persist in `data/object-blueprints`;
attempt PNGs, reviews and accepted output persist in the selected directory.
Changing the object compiler version invalidates older design-stage checkpoints.

`node scripts/review-prop-design.mjs plan.json propId` exercises isolated object
redraw with live Gemini, saving before/after PNGs and the verdict. It does not
modify the supplied plan. The native construction previews and pickup frames in
`artifacts/construction` are authored engine checks, not an arbitrary-story proof.

This is an original procedural 2D engine with supported rigs/actions and safe vector drawings. It is not a general system that can draw and animate every imaginable story at professional reference quality. Human rigs cover man/woman/grandma/child; dog/cat/lion have separate rigs. Unrelated duplicate human designs are rejected; intentional twins can share an identity group. Text, colours, clothing and object-use requirements have structured checks, while semantic/visual review is still needed. Live Gemini/Cartesia account access was not exercised without supplied credentials. This release adds no3D mode.
