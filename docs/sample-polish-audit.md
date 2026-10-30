# Existing sample detail versus the dynamic generation flow

Audit date: 2026-10-30. Scope: source plans, native drawing functions, action
evaluation, dynamic asset generation, camera/SFX direction and the HTTP render
route. This is an audit of these paths, not proof that every project feature or
every possible story was exhaustively verified.

## Source identification

- `examples/superhero-v9.json`: 16.5 seconds, 60 fps, two characters, four scenes.
  The runtime/style/story agree with the supplied Superhero Return Gift video.
  Its review explicitly says `authored-example` and not a live Gemini output.
  `examples/make-v9.mjs` builds it from the earlier superhero plan and adjusts
  flight, gravity, impacts and recorded effects. Exact MP4 byte provenance was
  not established.
- `examples/dadi-jar.json`: the related Dadi versus Bodybuilder jar sample,
  26 seconds, two characters. The supplied WhatsApp video is 20.832993 seconds
  at 24 fps and has different character colours. This plan is a useful source
  for the gag/mechanics, but is not confirmed as that exact export's JSON.
- The nine inspected StickLaugh project directories contain byte-identical
  versions of these example files: 18 copies, two distinct file hashes.
  Older V9.1 saved job plans were also inspected. The matching jar jobs found
  there describe a different Superman/old-man gag at 12 seconds; they do not
  establish the WhatsApp video's exact source.

## What supplies the existing polish

| Plan | Timed beats | Shots | Sound cues | Important implementation |
|---|---:|---:|---:|---|
| Dadi–jar | 21 | 11 | 23 | hold, struggle, flex, defeat, walk, place, two taps, open, pickup and tea poses |
| Superhero V9 | 14 | 17 | 14 | flight performance keys, rant, landing, punch/duck timing, free-object motion and head attachment events |
| Recent directed-onset test | 2 | 3 | 1 | one idle/body beat plus directed facial performance |

The latest test is a deliberately simpler one-character ten-second story. Those
counts explain its narrower exercise of the engine; they are not a fair matched
story comparison or a rule that more shots/SFX automatically mean better comedy.

The example JSON does not contain all the artwork. In `renderer/draw.mjs`, native
characters and props supply additional detail:

- Superhero costume geometry includes cape curves/folds, chest emblem, belt,
  coloured boots and muscular limb contours. The plan selects those features
  with costume, wardrobe, hair, face-shape and proportion fields.
- The native pencil/coloured faces include distinct hair shapes, face shapes,
  glasses, elderly details, teeth, tongue and expression-specific mouth contours.
- Native jar/cup/table and kitchen code draws recognizable silhouettes and
  details even when their JSON `nodes` arrays are empty.
- `renderer/engine.mjs` supplies coordinated struggle vibration, wrist motion,
  strain colouring state, muscle inflation/deflation, tapping and lid opening.
- Precisely staged hands/object positions and dedicated hand close-ups make
  contact readable. The superhero sample explicitly stages object ownership and
  gravity; an intent string is not doing that work.
- Bundled demos select prepared recorded clips via `fixture` fields. Production
  live rendering searches Freesound instead. The two audio selection paths have
  different quality evidence; fixture-rich samples do not prove live search
  will find equally suitable recordings for every cue.

## Confirmed gaps

1. **Elastic face loses existing appearance features.** With the same evaluated
   pose and design, changing round/square face shape or sidepart/curly hair
   changes native pencil/toon SVG output but not elastic-face SVG output. With
   identical hair/accessory fields, woman/grandma also render identically in
   the elastic face. Its strain face ignores the native `red` state. A same-plan
   comparison at 8.8 seconds additionally shows native gritted teeth becoming a
   flat elastic mouth. These are concrete renderer differences, not missing
   Gemini keys. See `artifacts/sample-detail-audit/superhero-source.png` and
   `superhero-elastic.png`.
2. **Native prop mechanics are not automatically inherited by replacement art.**
   Dynamic prop design goes through the blueprint service for existing prop
   designs too. A `visualSpec.renderMode: replace` skips the native prop drawing.
   Native `open` may update `p.open`, but replacement lid geometry needs actual
   part tracks; an `objectBehaviors` operation declaration alone does not animate
   it. Current behavior handling stores declarations and validates limits.
3. **Recent verification was too narrow for the sample quality target.** Gaze,
   facial timing, ownership checks and framing improved, but the simple reaction
   test did not exercise the examples' multi-character gag choreography,
   detailed costume choices, coordinated jar mechanics or full comic payoff.
   Those examples need matched-story regression scenes, including rendered
   inspection, alongside unseen-story tests to avoid template-only success.
4. **HTTP render dispatch mixed score formats — fixed during this audit.** A
   reviewed dynamic plan with its new `directionScore` entered the old semantic
   upgrade branch because it had no semantic `directionVersion`. A real local
   HTTP reproduction returned 202 then failed schema validation before either
   audio or rendering ran. `server/index.mjs` now excludes dynamic plans from
   that semantic upgrade. The new HTTP regression test proves the dynamic plan
   reaches the audio stage and retains legacy semantic upgrade handling. No
   provider request or full MP4 render was used for this dispatch test.

## Recommended implementation order

1. Preserve character identity, hair, age features, strain and mouth-shape detail
   across the selected styles. Keep the original expressive native drawings
   while using the newer gaze, timing and blink controls.
2. Reuse native detailed props and mechanics when they match the request. For
   custom props, compile declared part operations into real event-timed tracks
   and validate that the visible part changes, not only that metadata exists.
3. Transfer the examples' reusable choreography principles into the director:
   atomic physical events, contact poses, anticipation, effort, recovery,
   ownership transitions and camera coverage. Preserve story-specific entities
   and timing rather than substituting these two fixed stories.
4. Check both sample stories through the actual UI/API pipeline and compare
   rendered action/contact/expression frames with their sources. Separately test
   unrelated new stories; a fixed example passing does not prove generality.
5. Continue Freesound-only selection with reviewed source windows and actual
   cropped-cue checks. A missing reviewed sound remains an unresolved cue;
   passing technical checks must not hide that limitation.

## Evidence and validation

- Machine-readable plan counts, source copies and SVG comparison results:
  `artifacts/sample-detail-audit/audit.json`.
- Before-fix HTTP failure: `artifacts/sample-detail-audit/http-render-route-repro.json`.
- Dadi candidate source summaries: `artifacts/sample-detail-audit/dadi-candidate-plans.json`.
- Source Dadi and Superhero plans pass current schema and geometry inspection.
- After the dispatch fix, 32 relevant HTTP/API, production and dynamic-director
  tests pass, including two new score-format route cases.
- This audit has not made arbitrary generated videos equal to these samples.
