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

This is an original procedural 2D engine with supported rigs/actions and safe vector drawings. It is not a general system that can draw and animate every imaginable story at professional reference quality. Human rigs cover man/woman/grandma/child; dog/cat/lion have separate rigs. Unrelated duplicate human designs are rejected; intentional twins can share an identity group. Text, colours, clothing and object-use requirements have structured checks, while semantic/visual review is still needed. Live Gemini/Cartesia account access was not exercised without supplied credentials. This release adds no3D mode.
