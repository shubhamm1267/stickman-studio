# Point 2 — fixed story-noun restrictions audit

**Date:** 2026-10-26  
**Status:** Audit-only partial checkpoint. No application code or enums were
changed; this is not a claim that new story entities are supported.  
**Working source:** the Point 1 extracted project. The attached archive's
computed SHA-256 was
`124e26b39d2465ffca15ced4fde6a347d8475862d072aaf1ca4603ee4b694a01`, not the
user-specified `d2dc6541c962cdc1d3f1f92ba664b8158bbe8f18ef69d7baf932675a4c920468`.
This audit describes the received source variant, not an authenticated copy
of the expected archive. See `docs/POINT1-VERIFICATION.md`.

## Executive finding

The source is not limited by character names: character `name`, prop `name`,
and story text are data fields, and a targeted search found no renderer routing
like `character.name === "Batman"` or `story.includes("crow")`. The real
restrictions are finite character-rig/species, prop-type, background, and
action vocabularies, plus type/action compatibility rules and renderer branches.
Those constraints are repeated across schemas, prompts, choreography,
validation, inspection, and rendering. Removing one enum entry or adding a
new label will not add artwork, anatomy, interaction mechanics, or output support.

## Generate-to-MP4 source path

1. **Generate request:** `web/src/main.ts:166-194` sends story/options to
   `/api/plan`, then `watch()` polls the job (`:200-252`). The UI installs the
   returned plan, updates preview (`:214-223`), and may auto-render.
2. **Plan production:** `server/index.mjs` accepts `/api/plan` and resolves
   server-side credentials (`:153-204`). `server/providers.mjs:106-115` selects
   semantic planning for eligible requests; the legacy outline path supplies
   fixed type examples and instructions (`:153-225`). The semantic director
   (`server/semantic-director.mjs:54-81`) requests a structured score, separately
   audits story requirements, then passes it to `server/choreographer.mjs`.
   Choreography compiles the score to the strict Plan v1, runs
   `migrateMotionIR()`, `validatePlan()`, and `inspectPlan()`
   (`server/choreographer.mjs:268-271`).
3. **Preview:** the UI posts the plan and time to `/api/preview`
   (`web/src/main.ts:261-285`). The server validates it and calls `svgFrame()`
   (`server/index.mjs:240-250`). `renderer/engine.mjs:615-690` evaluates the
   plan and composes the background, props, and actor/animal drawings.
4. **Render request and production:** the UI posts `/api/render`
   (`web/src/main.ts:315-337`). The server validates the plan, applies live
   review/repair gates, and calls `produceFilm()` (`server/index.mjs:252-325`).
   `server/production.mjs:10-36` asserts renderability, saves the plan, builds
   audio, renders, inspects the encoded file, and performs live audiovisual
   review with at most one repair attempt.
5. **Audio and video:** `server/media.mjs:48-145` resolves bundled SFX or
   Freesound results, prepares timing/audio, and handles optional dialogue.
   `server/render.mjs:11-105` bundles the Remotion composition and renders H.264
   video with AAC audio. `renderer/index.tsx:1-14` calls the same `svgFrame()`
   for each frame and adds the audio layer. Timing normalization and encoded
   quality checks run in `server/render.mjs` and `server/encoded-quality.mjs`.
6. **Download:** completed jobs can trigger `downloadVideo()`
   (`web/src/main.ts:240-260`). `/api/files/:id/video.mp4` is served as an
   attachment by `server/index.mjs:326-354`, subject to the job/media expiry.

This is a source trace, not a Point 2 MP4 render test. Point 1's separate
verification record explicitly says no MP4 export was run for that baseline.

## Fixed vocabularies and actual consumers

| Restriction | Source of truth / callers | Actual rendering or behavior consumer | Compatibility consequence |
|---|---|---|---|
| **Character kind/species:** `man`, `woman`, `grandma`, `child`, `dog`, `cat`, `lion`. `CharacterSchema` and scene cast `species` repeat the finite set (`shared/schema.mjs:120-146, 256-315`). The animal check in `validatePlan()` (`:572-576`) and choreography (`server/choreographer.mjs:95`) allow only specified actions for dog/cat/lion. | Generation prompts describe the available cast; `validatePlan()` copies species into scene cast. | `renderer/draw.mjs:251-322` draws humanoids, with explicit woman/grandma and superhero/costume styling; `:765-809` draws dog/cat/lion anatomy. `renderer/engine.mjs` has species-dependent base pose/gait. | A new species cannot pass the current schema and has no rig/anatomy/pose evaluator. A new name alone is accepted but does not select a likeness or new rig. |
| **Character appearance:** finite enums for art style, hair, face shape, pattern, costume, build, wardrobe, and accessory (`shared/schema.mjs:126-146`). | `CharacterSchema`, prompt fields, and renderer conditionals. | `renderer/draw.mjs` consumes these values in face/body drawing; examples include woman/grandma body, hair, glasses, and superhero cape/boots/emblem branches (`:111-120, 251-322`). | Adding an appearance option requires schema, prompt, validation, and SVG consumer support; a valid string is not a visual implementation. |
| **Character names:** arbitrary non-empty string, max 70 (`shared/schema.mjs:122`). Prop names and labels are also user data (`:150-152`). | Names appear in generated text/voice/credits and IDs connect events to designs. No name-based character renderer branch was found in the targeted search. | Labels can be drawn as text; the renderer chooses geometry using type/kind, not a character name. | New names are not the restriction. A name cannot provide geometry, species, behavior, or a copyrighted likeness. |
| **Built-in prop types:** finite list of 24 values: `cap`, `can`, `bottle`, `banana`, `peel`, `dustbin`, `sign`, `rubberDuck`, `headphones`, `gasMask`, `newspaper`, `jar`, `cup`, `phone`, `table`, `bench`, `dumbbell`, `balloon`, `car`, `chair`, `toilet`, `paperRoll`, `door`, `drawing` (`shared/schema.mjs:147-196`). | Schema, provider prompts, choreography staging, story-contract checks, and Plan validation. | `renderer/draw.mjs:335-543` has type-specific vector geometry; `renderer/engine.mjs:615-690` chooses prop rendering and special layers. `drawing` consumes validated custom nodes, not an automatic object model. | A new type fails strict validation until migrated. Reusing `drawing` can show bounded vector art but does not make it an interactive, articulated, semantic prop. |
| **Backgrounds:** `hospital`, `toiletEntrance`, `kitchen`, `park`, `street`, `gym`, `room`, `office`, `bathroom`, `custom` (`shared/schema.mjs:256-274`). | Scene schema, provider prompts, story-contract missing-entity logic. | `renderer/draw.mjs:544-658` has fixed background compositions; `custom` uses scene nodes. | A new background needs a defined scene representation and drawing; `custom` nodes are static geometry and do not imply furniture, doors, or other interactive props. |
| **Legacy action enum:** `ACTIONS` contains a fixed set of beat kinds (`shared/schema.mjs:5-50`); `BeatSchema.kind` enforces it (`:225-245`). | Provider/score compilation, Plan validation, `server/inspect.mjs`, sound synchronization, choreography output. | `renderer/engine.mjs:120-525` contains action-specific evaluation for legacy named beats; SVG frame evaluation consumes those states (`:615-690`). | Old beat names are persisted in Plan v1 and have observable semantics. Removing or renaming one can break saved plans and sound/contact timing. |
| **Director verbs are a second vocabulary:** `DIRECTOR_ACTIONS` is separately enumerated in `shared/director-score.mjs:4-8`; `StoryContractSchema` repeats it and restricts destinations (`server/story-contract.mjs:4`). | `server/semantic-director.mjs` prompts and structured output, `validateStoryContract()`, and `server/choreographer.mjs` map verbs to legacy beats. | Choreographer output is the bridge to the legacy evaluator. `grab` maps to `pick`; `open` is jar-only; `liftAttempt` and contact produce hand-authored performance tracks (`server/choreographer.mjs:120-146`). | The director vocabulary and the renderer's legacy action vocabulary are not interchangeable. Adding a director verb alone does not compile it or render it. |
| **Bound action/type pairs:** `hold`, `struggle`, `tap`, `open` require a jar; `pullPaper`, `wrap`, `tearFree` require a `paperRoll`; `openDoor` requires a `door`; `drink` accepts only cup/can/bottle (`shared/schema.mjs:606-622`). Choreography also rejects unsupported `open` types (`server/choreographer.mjs:131`). | Plan validator and choreography; inspection duplicates contact/target/ownership checks (`server/inspect.mjs:149-251`). | `renderer/engine.mjs` branches on these beat kinds and target designs (including jar state, paper state, door state, drinks, and prop grip/containment). | A noun/type extension must define its affordances and behavior; simply bypassing these guards risks invalid or visually inert actions. |
| **Animal action subsets:** Plan validation and choreography each have allowlists (`shared/schema.mjs:574-576`; `server/choreographer.mjs:95`). | Validation before preview/render and score compilation. | `renderer/engine.mjs` and `renderer/draw.mjs:765-809` have only the existing animal controls/anatomy. | Removing an allowlist does not add limbs, contacts, poses, or correct anatomy. |
| **Finite destinations, poses, and geometry:** story-contract destinations are enumerated (`server/story-contract.mjs:4`); node types are path/ellipse/line/group (`shared/schema.mjs:83-119`). Nodes, nesting, anchors, tracks, keyframes, paths, and transforms have explicit bounds (`shared/schema.mjs:83-119, 147-196`; `shared/motion-ir.mjs:7-8`). | Strict Zod validators and `validateMotionIR()` reject unsupported controls, invalid references, and out-of-range geometry. | `renderer/draw.mjs:nodes()` consumes bounded nodes; Motion IR evaluator consumes only declared pose controls. | Keep the primitive set and numeric/resource bounds validated. Do not add executable expressions, arbitrary rig topology, or unrestricted physical simulation. |

### Exact action vocabularies

- Legacy Plan v1 `ACTIONS` (44 beat kinds), `shared/schema.mjs:5-50`:
  `punch`, `scold`, `drink`, `perform`, `throw`, `slip`, `roar`, `cower`,
  `pawPress`, `idle`, `walk`, `run`, `reach`, `hold`, `struggle`, `tap`, `open`,
  `flex`, `deflate`, `react`, `point`, `pick`, `place`, `jump`, `fall`, `sit`,
  `laugh`, `cry`, `talk`, `swat`, `sneeze`, `duck`, `stand`, `wave`, `dance`,
  `fart`, `nosePinch`, `scoot`, `panic`, `pullPaper`, `wrap`, `tearFree`,
  `openDoor`, `custom`.
- Director `DIRECTOR_ACTIONS` (35 verbs), `shared/director-score.mjs:4-8`:
  `approach`, `walk`, `run`, `press`, `strain`, `liftAttempt`, `grab`, `place`,
  `throw`, `fly`, `punch`, `slip`, `fall`, `jump`, `sit`, `stand`, `headHold`,
  `point`, `duck`, `cower`, `roar`, `pawPress`, `react`, `laugh`, `cry`,
  `scold`, `wave`, `dance`, `sneeze`, `fart`, `nosePinch`, `flex`, `deflate`,
  `open`, `perform`.
- These vocabularies differ by design; `approach`, `press`, `strain`,
  `liftAttempt`, `grab`, `fly`, and `headHold` are director concepts compiled
  into legacy beats or motion data. `custom` exists only in the legacy beat
  set, while `fly` is not a legacy beat kind.
- Major noun/state-specific renderer behavior in `renderer/engine.mjs:120-525`
  includes jar reach/open/tap/struggle state; `drink` offsets for cup/can/bottle;
  `openDoor` state; paper-roll pull/wrap/tear state; pickup/place ownership and
  prop-specific grip/containment offsets; gas-mask face coverage; dustbin
  containment; and species-specific dog/cat/lion locomotion/action behavior.
  The legacy vocabulary is also consumed by `shared/schema.mjs` target,
  destination, animal, contact, and sound-sync validation (`:574-679`) and by
  `server/inspect.mjs` action/contact/ownership checks (`:149-251`).

### Additional noun-coupled restrictions and false positives

- `server/choreographer.mjs:57-65` uses fixed staging coordinates and a
  hardcoded set of `table`, `bench`, `chair`, `toilet`, and `dustbin` as
  collision/support solids. `:199-206` uses a table-specific head-hold rule.
  These are real staging assumptions, not a general surface/affordance model.
- `validatePlan()` has a child-character restriction under `adult-relatable`
  and `naughty` humor profiles (`shared/schema.mjs:512-515`); this is a policy
  gate rather than a renderer limitation.
- `server/story-contract.mjs:7-53` checks story events by IDs and verbs, but
  its `missingEntities` handling compares names against a finite list of
  background names. This is brittle: it can mistake a noun string for a
  recognized setting instead of resolving a typed entity/asset reference.
- `server/semantic-director.mjs:63-68` explicitly asks for unsupported story
  requirements to be reported, including rigid-prop inflation/growth, tearing,
  liquids, machinery, kicks, and arbitrary creature deformation. These are
  honest capability limits in the prompt, not features that exist merely
  because a model can mention them.
- `server/providers.mjs:153-225` includes a legacy prompt with finite kinds and
  prop examples; prompt text is a generation restriction but not a renderer.
  Its sound-query synonym table (`:415-445`) improves Freesound query wording;
  it is not the registry of entities the renderer can create.
- `server/semantic-director.mjs:14` normalizes action aliases. This is another
  compatibility boundary, not an asset capability system.
- No name- or story-substring renderer branch was found by targeted search.
  `Batman`, `crow`, or `boat` are examples, not special cases in this source:
  a name does not create a superhero identity, the current character schema
  rejects a crow rig, and a boat-shaped `drawing` still has no boat-specific
  floating or interaction behavior.

## Existing generic capabilities and limits

- `PropSchema.nodes` permits validated path/ellipse/line/group geometry; a prop
  is capped at 100 total nodes, with at most four group levels, bounded
  transforms, and at most 16 interaction anchors (`shared/schema.mjs:83-119,
  147-196`). It is a safe drawing/anchor path, not a generic model of physics.
- Motion IR is version 1. It supports bounded tracks and keyframes, known
  humanoid pose keys, a smaller animal control set, and validated paths;
  unsupported arbitrary code, rig topology, additive blending, and general
  rigid-body physics are listed in `shared/motion-ir.mjs:7-8, 44-46`.
- `migrateMotionIR()` migrates legacy performance keyframes to canonical
  tracks (`shared/motion-ir.mjs:85-98`). It does **not** migrate new species,
  prop types, backgrounds, action vocabularies, or noun-to-affordance rules.
- The current `PlanSchema` is strict and version 1
  (`shared/schema.mjs:475-490`). Since this Point 2 slice changes no schema,
  existing v1 saved plans keep their current validation/render behavior. No
  `PlanV1 -> canonical` noun/capability adapter has been implemented yet.
- The shared renderer is genuinely reused by preview and Remotion, but it
  still has noun/action-specific branches. Shared code paths are not proof of
  generic entity support.

## Backward-compatible migration plan (not implemented in Point 2)

1. Keep the current strict Plan v1 schema and renderer behavior available as a
   named compatibility contract. Add golden saved-plan fixtures before any
   schema evolution; verify validation, deterministic preview, sound timing,
   and render semantics remain unchanged.
2. Introduce a versioned canonical capability representation for new content:
   entity identity/reference, declarative bounded geometry, rig/control
   capability IDs, and affordances such as contact, grasp/attach/release,
   hinge, slide, or rigid movement. The capability descriptors—not a story
   noun list—must be the shared source consumed by prompts, validator,
   choreographer, inspector, preview, and Remotion.
3. Add an explicit `PlanV1 -> canonical` adapter. Map every legacy kind,
   type, background, action, and special state to its existing capability
   implementation. Preserve IDs, timing, fields, defaults, and rendering
   semantics; reject unrepresentable data with a specific error rather than
   silently dropping it. Keep a version-aware serializer/round-trip path where
   saved v1 plans need to remain editable.
4. Make new extension points data-driven but bounded. Reuse the current safe
   vector primitives and named anchors; require explicit declared controls,
   affordances, numerical ranges, node/track/key/path budgets, and validated
   targets. Implement generic mechanics only when a bounded operation is
   actually consumed by both preview and export. Do not use name/type/story
   substring branches or treat a drawing label as an affordance.
5. Replace the `missingEntities` background-name comparison with typed
   references to declared background/character/prop IDs and explicit
   capability validation. Replace staging's furniture-name checks with
   surfaces/solids declared by the scene/entity data.
6. Keep legacy named actions as adapter mappings until all old plans and
   outputs have regression coverage. Do not remove an enum or branch merely
   to make schema parsing permissive.

## Required capability work before claiming generic support

- **Characters:** extensible rig definitions or explicit supported rig
  capability descriptors with anatomy, controls, contacts, locomotion, and
  face controls; every control must be consumed by the evaluator and renderer.
- **Props:** declarative geometry plus optional bounded affordances/state
  (for example grasp anchors, hinge axis/range, slide axis/range, open state,
  surface/contact regions); a new shape alone must not imply an affordance.
- **Backgrounds/scenes:** data-driven layers, safe geometry, declared surfaces,
  anchors, and collision/staging metadata. A room must not silently invent a
  door, table, or other interactive object.
- **Actions:** shared capability operation definitions that state required
  targets, controls, state transitions, bounds, and audio/contact timing, with
  validation and actual renderer consumers. The semantic planner and legacy
  adapter must both resolve against this same contract.
- **Pipeline:** parity tests for preview and Remotion frames, encoded MP4
  decoding/quality, and audio synchronization. The current Point 2 audit did
  not test or claim a new entity in MP4.

## Existing tests and coverage gaps

Relevant existing suites:

- `tests/schema-engine.test.mjs`: validates plans and includes tests for
  generic drawing geometry and a negative jar-on-phone action case.
- `tests/motion-ir.test.mjs`: legacy migration, bounds, animal controls,
  shared SVG consumption, and bounded scene-graph groups.
- `tests/choreographer.test.mjs`: verb compilation, targets, ownership,
  contacts, and generic custom-prop contact.
- `tests/story-contract.test.mjs`: missing event/action, separate components,
  unsupported deformation, and the room-versus-door distinction.
- `tests/interaction-anchors.test.mjs`: bounded named anchors and the shared
  preview path for the hand-authored exchange fixture.
- `tests/providers.test.mjs` and `tests/production.test.mjs`: mocked provider
  contract/review cases and production repair behavior; these do not establish
  live generation or new-entity rendering.

Coverage gap: these tests protect current semantics and bounded generic
geometry, but do not demonstrate arbitrary new species, prop affordances,
background data, or generated-story-to-MP4 support. Before implementation,
add Plan v1 golden compatibility tests, explicit adapter round trips, a
capability-matrix validation suite, negative boundedness tests, and new
declarative-entity fixtures through both preview and actual MP4 export.

## Point 2 verification and environment

- Application source was not modified. The configured `.env` remains in the
  local working project, matches the received archive byte-for-byte, and is
  included in the updated delivery at the user's request. Treat that ZIP as
  private. A name-only availability check for the permitted Gemini/Freesound
  key names did not expose values; no new live Gemini/Freesound request or MP4
  render was performed during this audit.
- Baseline provider/runtime details remain documented in
  `docs/POINT1-VERIFICATION.md`. The original Point 1 archive SHA mismatch
  remains an unresolved provenance limitation.
- `npm run check` passed: **6,289 tests, 0 failures**, followed by a successful
  Angular production build. ZIP integrity, source manifest, `.env` inclusion
  and byte match, and checks that the permitted key values do not occur outside
  `.env` are recorded in `CHECKPOINT.md` and the adjacent delivery
  `.verification.json`.
- This archive is intentionally labeled **Audit Partial**. Point 2 capability
  implementation and the future Point 3 work have not started.