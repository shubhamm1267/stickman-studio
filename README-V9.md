# StickLaugh Studio V9

Script-directed Remotion cartoons, with reviewed scene plans, original procedural character rigs, CC0 recorded sound effects and optional Cartesia dialogue.

## What changed

- **Automatic length** is the default for new stories. Gemini chooses scene durations from anticipation, action/contact, reaction and payoff; the manual seconds field is ignored in this mode. The outline total is validated (10–1200 seconds); action/voice fitting is checked later. Manual target remains available. Existing authored examples retain their authored duration.
- **60 / 120 fps** selections are carried through request validation, queue persistence, planning, preview, composition metadata and H.264 export. Seconds stay unchanged. Changing only fps preserves an already current story review; it cannot validate an edited story.
- **Visible hands and forearms.** Reaching limbs are drawn above the actor's face and ordinary held props before ownership changes. A self-head pick travels around the face through a straight outer reach before changing elbow branch. Custom objects can declare an edge/handle `gripOffset`; carry preserves it. Deliberate foreground scenery remains foreground.
- **Semantic motion.** `beat.motionEffect="flight"` adds moving air streaks and a CC0 wind bed. Root movement/pose still comes from the scene's animation. `motion.timing="gravity"` accelerates a falling prop, draws descent streaks, and `impactOnEnd=true` adds landing particles. These features work by schema fields, without superhero/egg/poop IDs in the renderer.
- **Contact effects.** Connected punches target the actual cheek with recoil and a foreground flash; swish precedes contact and the impact recording lands at 42% of the beat. A miss produces no impact flash, sound or victim recoil.
- **Relevant recordings.** Added a CC0 air gust and an actual wet rag/sponge plop for the falling mess. Retained real whoosh and impact recordings for punches. Credits include source pages and licences.
- **Recorded gibberish.** The existing real CC0 vocal phrases and waveform-derived mouth motion remain. Cartesia uses per-character voice IDs when explicitly enabled; no Cartesia render was used for the bundled samples.

## Run

Use Node 22.12+ or Node 24, FFmpeg/ffprobe and Chrome/Chromium.

```sh
npm ci
npm run doctor
npm run build
npm start
```

If Chrome is elsewhere, set `CHROME_PATH` to its executable. Open the localhost address printed by the server. New story planning needs your Gemini key; the tested examples and curated CC0 sounds work without keys. Unresolved Freesound searches need a Freesound key. Keep keys out of exported files.

```sh
npm test
node examples/make-v9.mjs
npm run samples
```

`examples/superhero-v9.json` renders at 60fps (16.5s). `examples/cool-cap-v9.json` renders at 120fps (17.6s). `deliverables/` includes the two actual project renders, plans, review reports, thumbnails, descriptions and credits. Older examples are regression fixtures. V8 reports describe earlier releases; use `docs/V9-VALIDATION.md` for this release.

## Scope

Story content selects actors, custom vector props, poses, camera shots, actions and sound cues automatically during planning/review. This is a bounded cartoon engine, not a universal text-to-video model. Human rigs plus dog/cat/lion rigs are supported, up to six cast members. Unrelated people must have distinct appearance descriptors; visual requirements can verify labels, colours, props and actions. Unsupported actions must be reported or repaired, never silently claimed as animated. Live Gemini behavior was tested with provider mocks in this environment; bundled sample stories were authored and then compiled/rendered by the project.

Frame rate and passing tests do not establish comedy quality or equality with a reference animator. Review the exported video for readability, comic timing and your audience. Reference footage is used for analysis only and is not redistributed in this package.
