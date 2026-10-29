# Motion IR v1 — partial dynamic-core milestone

The existing Plan v1 remains the project container for identity, assets, instances,
story coverage, camera, sounds and export settings. A scene may now contain a
strict `motionIR` envelope. It is a first motion slice of the requested Animation
IR, not a replacement for every legacy action or a complete physics/asset system.

## Actual callers

`web/src/main.ts` posts to `/api/plan`. Silent stories enter
`server/semantic-director.mjs`, which gives Gemini a capability manifest derived
from the actual pose schema. `server/choreographer.mjs` builds the scene, migrates
performance keys into canonical tracks, validates and samples it. Plan review and
render use those same tracks. `/api/preview` and `renderer/index.tsx` both call
`renderer/engine.mjs` → `evaluate`/`svgFrame`. Audio playback remains a separate
Remotion Audio layer; seeking the evaluator emits no playback side effects.

The specification's `design-compiler.mjs`, `interaction.mjs`, `motions.mjs`,
`sound-director.mjs` and `visual-review.mjs` do not exist in this workspace.
Their relevant existing behavior is in schema/draw, engine/choreographer,
providers/media and video-review. No new framework or dependency was introduced.

## Canonical ownership and units

- `motionIR.schemaVersion` is 1. `seed` is a bounded uint32 reproducibility field;
  this first slice does not introduce stochastic motion or seed-based variation.
- Logical stage is 540 × 960 for the portrait layout, x right/y down. Export
  resolution is independent (for example 1080 × 1920).
- Times are seconds. Frame fraction `at` runs from 0 to 1 over track duration.
- Pose joints/end effectors are actor-local stage units. `position` is world
  stage position. Angles are degrees. Local points are scaled, rotated by
  bodyAngle, then translated by position. Existing head-local transforms remain.
- Tracks own their keyframes. A `perform` beat contains `motionTrackId`, actor,
  timing, intent and optional contact metadata; it cannot also own inline keys.
  Beat indices remain stable for story coverage and sound references.
- Sparse channels interpolate independently with smooth/snappy/gentle easing;
  final values hold. Discrete legacy face/hand presets change at their key time.
- `migrateMotionIR(plan)` is pure and idempotent. Inline legacy performance keys
  remain readable without migration. It never executes generated expressions.

## Validation and conflicts

Schemas reject unknown controls/fields, unsupported versions, nonfinite and
out-of-range values, >100 tracks/scene, >24 keys/track, invalid key endpoints,
missing cast/track IDs, duplicate IDs/references, unreferenced tracks and timing
disagreement between a beat and its track. Every IR track must affect at least
one supported channel. Referenced performance keys are also included in geometry
preflight sampling; hiding keys in IR cannot bypass reach checks.

This version rejects overlapping active tracks that own the same actor control.
It does not implement additive layers or arbitrary priority blending. Different
nonconflicting channels may overlap. Earlier completed tracks hold until a later
track changes their channels. Legacy named actions retain their compatibility
evaluation order; converting all those branches is explicitly unfinished.

The only new constraint is `ground`: after sampling a pose, translate its root
so the lowest selected hip/foot/hand point lies on `floorY`. There is at most one
such constraint per track; duplicate contact points are rejected. It is a bounded
kinematic correction, not dynamics, collision detection or a physics engine.
Existing held-prop ownership is resolved by the existing engine afterward.

## Data presets and new combinations

`assets/motion-presets.json` contains reusable pose data. The generic instantiator
copies initial channels, fits optional root travel and creates a ground constraint.
Semantic fall/slip intents now compile into ordinary performance tracks; the
action-specific executable `shared/fall.mjs` was removed. Old saved fall/slip
beats delegate to the same generic evaluator as compatibility behavior.

`examples/motion-ir-lantern.json` is an explicitly hand-authored runtime fixture:
a custom turquoise vector lantern, a bow, a pause, gaze, squint and head tilt.
It uses the existing generic drawing nodes and motion tracks, with no new prop or
action renderer branch. It proves runtime composition, not AI story generation.
Regenerate with `node scripts/make-motion-ir-fixture.mjs`. Export with
`node scripts/render-motion-ir-proof.mjs` (60 fps full and 120 fps draft).

## Remaining architectural work

The full requested asset scene graph, arbitrary validated rig definitions,
generic layer priorities, category/content validation and all four requested
integration stories remain later milestones. Existing named props, expressions
and many action branches still limit variation. Live spoken dialogue is disabled
by this project configuration. Neither this document nor a passing fixture
means “everything is dynamic.”


## Continuous facial-control extension (checkpoint 02, partial)

The canonical humanoid pose schema now includes `eyeOpenLeft`/`eyeOpenRight` (0–1), `browHeight` and `browTilt` pairs, `mouthWidth` (0.5–1.5), `mouthCurve` (-1–1), and `mouthAperture` (0–1). Pair order is character-left, character-right; positive brow height raises a brow, positive mouth curve forms a smile, and positive aperture opens the mouth. Sparse channels interpolate with the same track easing and absolute-time evaluator. Pencil, classic and toon humanoid renderers consume brow/mouth controls; the existing emotion names still work when these optional fields are absent. The capability manifest reports controls per rig. Animal rigs accept only root position, body/head angle, eye openness and gaze; they do not render humanoid hands, feet, head/hip offsets, brow/mouth geometry, hand shapes, or ground constraints. Motion IR validation rejects those unsupported animal channels instead of accepting data that the renderer ignores. This does not provide viseme-based lip sync.

## Bounded vector groups (checkpoint 03, partial)

Drawing props now accept nested `group` nodes as validated data. A group may
contain up to 100 combined primitive/group nodes per prop and can set a local
translation (`position`), local `pivot`, `rotation` in degrees, positive
two-axis `scale` (0.1–5), and `opacity` (0–1). Group nesting is limited to
four levels. Leaves are bounded SVG path, ellipse, and line primitives; path
data uses the existing restricted path-character grammar, and the schema now
requires each primitive's geometry. The renderer composes the group transform
about its pivot and recursively draws children in source order. Existing prop
instance `layer` ordering is unchanged.

This is a reusable visual-composition capability: geometry variations can be
authored in a plan and rendered by the existing SVG path for both preview and
Remotion export. It is not a general animated scene graph: group transforms
are static, named rigid prop types and their behaviors still use legacy
branches, and geometry groups are not interaction geometry. Checkpoint 04 adds
separate named interaction anchors; it does not infer them from visible vector
geometry or animate a group's transform.

## Bounded prop interaction anchors and handoff data (checkpoint 04, partial)

`PropSchema.interactionAnchors` is optional, limited to 16 unique named anchors
per prop, and stores local vector-space points bounded to ±250 on each axis.
These points are separate from `nodes`: they are not drawn, and changing one
does not change the visible prop geometry. Timed or initial attachment data may
reference an anchor with `propAnchorId`. Validation rejects duplicate anchor
IDs, out-of-bounds points, and attachment references to an undeclared anchor,
with scene/prop/event context.

The existing absolute-time `attachmentEvents` timeline now supports an optional
world-space release/place `position` and final `angle`; those fields are invalid
on an attach/transfer event. The shared evaluator aligns the named prop point
to the specified actor bone plus actor-local offset, applying actor scale,
body/bone rotation, prop scale, and prop rotation. Existing plans without named
anchors retain their former placement behavior. A release without a destination
preserves the evaluated world transform. Preview and Remotion export continue
through `svgFrame()` and therefore consume the same evaluated attachment data.

`examples/prop-exchange.json` is a clearly labeled hand-authored two-character
fixture using a custom bounded vector parcel and a named handle anchor. Its
timed data demonstrates pickup, carry, transfer, release/place and facial
reactions. Tests verify anchor contact on each actor (including different
actor scales/facing), handoff position/orientation/size continuity for the
authored aligned hands, deterministic seeking, schema bounds/references, and
the HTTP preview endpoint. Representative shared-renderer frames were also
rendered and visually inspected.

This is not yet a general contact solver: an authored transfer must place the
receiver's hand and orientation at the handoff point, and the engine does not
automatically bend limbs or reject a geometrically discontinuous transfer.
Legacy `pick`/`place`/`throw` action branches remain; the fixture's generic
pickup/transfer/release/place sequence uses the existing data-driven attachment
event timeline. It does not add physics, umbrella mechanics, arbitrary animated
parts, image generation, or new character anatomy.


## Canonical Story / Scene / Performance IR (Points 5–6)

`shared/canonical-story-ir.mjs` emits Story IR v2, Scene IR v2 and Performance
IR v2. Durable entity IDs and reference validation from Point 5 remain. Actor
and prop records separate `displayName`/`description` from technical
`rigProfile`, `shapeDefinition` and `capabilities`; executable action records
use registered `primitiveAction` IDs. Technical mappings are registered from
the validated Plan v1 enum, never from display labels or prewritten story
names.

V2's `timebase` is integer frames with an explicit FPS and story/scene origins.
Scene cuts use cumulative exact-decimal duration sums rounded to the nearest
output frame. Scene-local timed intervals are half-open
`[startFrame,endFrame)`; event instants select the first output frame at or
after authored time. Action windows, contact instants, reaction windows,
camera windows, prop-motion windows, attachment events, dialogue/SFX starts,
and transition cuts carry local and global frame coordinates. Mouth-envelope
samples carry clip-relative frame offsets. Footfall-synchronized SFX record the
renderer crossing policy (120 Hz evaluation followed by ceiling to the output
frame); the event list is resolved at render time from evaluated footfalls.
`shared/frame-clock.mjs` uses exact base-10 rational arithmetic before frame
quantization, avoiding cumulative binary floating-point drift.

Plan v1 and Story IR v1 remain readable compatibility inputs. V2 embeds its
explicit `compatibility.storyIR` v1 adapter so the existing renderer can
preserve old behavior and exact source seconds. The adapter is the only place
where legacy second-based timeline fields are retained; v2 frame projections
are checked against it on validation. `storyIRToPlan()` accepts both versions.
This does not yet remove the Plan v1 runtime evaluator or make it execute v2
payloads directly. See `POINT5-CANONICAL-PIPELINE.md` for the previous request
trace and `POINT6-FRAME-IR.md` for this migration's exact rules and limits.
