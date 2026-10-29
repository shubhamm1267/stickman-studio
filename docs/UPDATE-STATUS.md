# Verified scope and remaining work

This is a functional improvement update, not a claim that the entire rebuild specification is complete or that arbitrary stories now succeed. The six supplied videos were treated as category-3 references. Older project verification documents are historical.

## Implemented in executable code

- Native third-style face drawing, with asymmetric eyes/cheeks/jaw, distinct line/torso treatment and a circular shock mouth. It is selected at drawing time by `referenceStyle`; classic is only the compatible stored artStyle value. New SVG regression checks prevent the three styles collapsing to one renderer.
- Elastic performance compilation: absent performance segment easing becomes snappy; explicit easing and held values remain intact. Explicit reaction shots with one native actor center on its evaluated head. Authored contact shots retain their intent and targets. This is used in dynamic planning/review; it is not a complete automatic cinematography system.
- `perform.pose` static channels execute; duplicate pose/keyframe ownership and mouth aliases in one pose are rejected. Motion-IR migration retains static pose values instead of losing them.
- Absolute mouth-open semantics across native renderers. Explicit mouth aperture takes precedence over named-expression defaults. The old pencil-only multiplicative mouth scale was removed.
- Explicit spine articulation and planted world contacts. Supported bow moves hip/torso/head without rotating the global root. Initial/custom spine poses also execute. Existing leg and arm IK are retained, with reach preflight still active.
- Large encoded videos are split at scene boundaries and into <=10-second review clips. Every clip is independently observed, with unique evidence IDs and global timestamps, before story comparison. Oversized input is no longer rejected solely because the whole MP4 exceeds 18 MiB. Audio remains in review clips; an FFmpeg/fetcher integration test exercises this branch.
- Sample CLI now uses the application render endpoint with live review and repair. `render:plan` now uses `produceFilm`; explicitly selected bundled mode remains a technical diagnostic, and is labelled as such.
- Browserless SVG backend with a memory-bounded child process, raw RGBA pipe, 1080p/60fps H.264 output and the same encoded QA. Chromium remains the default. No new paid provider is required.
- Repair-generated placement IDs are stripped before canonical compilation so the compiler owns execution IDs, while actor/design references and scene identity remain intact.

## Verified

Read `deliverables/verification/tests.txt`, `build.txt`, `dependency-check.txt` and `contact-diagnostics.json` for the final evidence. The test count is engineering regression coverage, not an animation-quality score.

Original bow reproduction: maximum floor deviation 9.029705 stage units, global root rotation 10 degrees. Updated designated bow: measured world foot drift, floor error and IK endpoint error recorded at 60 fps in `contact-diagnostics.json`. Tolerance is 1e-6 stage units; portrait export scale is 2 pixels per stage unit. These measurements apply only to that tested stance interval.

Both live provider smoke checks passed on retry. Freesound additionally passed an authenticated CC0 search, real preview download, decode/trim and mix; exact credits and the resulting audio are under `deliverables/live-sound`. An initial Gemini 15-second smoke timed out; the longer retry succeeded.

Technical samples include the same 25-second story in all three styles, a supported acting sequence, a nested excavator/refrigerator interaction and an original eight-arm creature. Each video has an exact saved plan and encoded/render report. The creature's first framing was cropped; its dimensions and framing were corrected and its sequence reinspected. The acting fixture's first reach-like bow placed the face over the prop; later revisions separated the prop and made the bow/closed-lid acting more deliberate. Earlier model findings are retained as failures, not hidden.

## Live/perceptual findings that remain material

The previously unseen story was requested through the actual HTTP planning workflow. Gemini returned HTTP 503 UNAVAILABLE/high demand during design, so no completed new-story render is claimed. See `deliverables/live-workflow/workflow-report.json`.

Independent encoded observation of the initial 25-second third-style comparison rejected story fidelity: the dog looked as though it rushed into the bin rather than stepping aside. The comparison is a technical/style example, not an approved complete comedy film. Its existing story-motion choreography still needs repair. The newer native facial revision is also supplied as `comparison-elastic-meme-r2`; it does not erase the earlier failed fidelity finding.

The production-supported-acting result is recorded separately in `deliverables/production-sample-results.json`. Earlier production runs rejected the bow's readability and subsequently encountered invalid model-repair execution IDs. The ID defect was fixed. The final production retry also FAILED: after one audiovisual repair the observer still interpreted the bow as a laughing forward bend. The numerical support checks passed, but perceptual bow readability did not obtain approval. The failed encoded output is included for diagnosis. Do not infer a production pass from numerical support checks or a playable bundled MP4.

## Partially implemented / unsupported

- This is not a general full-body balance, load, collision or rigid-body solver. New foot planting applies during declared track intervals. Overlapping legacy action ownership and arbitrary multi-contact blends are not universally solved.
- Hand shapes are articulated presets, not a complete wrist/finger rig. Reach/lift/grip/landing beyond the existing native actions still require appropriately authored poses, targets and constraints.
- Native humans have the most complete expressions. Custom replacement creatures need their own geometry/part tracks; arbitrary anatomy is not inferred from a label. The eight-arm example is hand-authored and does not establish universal creature generation.
- Existing hierarchical mechanisms, attachments and release-continuity tests remain supported. The excavator is an approximate generic design, not a verified exact branded vehicle. No exact model likeness is claimed.
- Style-specific drawing and default performance timing are implemented, but reference-level full-body deformation, hair dynamics, hand acting, comedy timing and custom-rig face control remain partial.
- Cross-scene identity is maintained by reusable design IDs, but arbitrary generated pose/appearance consistency is not guaranteed. Women retain existing face/hair/accessory controls; complete every-angle anatomy is not implemented.
- Blind model observation can misidentify objects/actions. Failed or ambiguous results remain failed; the review is not relaxed to manufacture success.
- The simplified UI/prepared-download path was retained and its existing regression suite passed. A new signed-in browser session was not used for this validation run.

The project therefore has concrete rendering, execution-contract, support and review fixes, with real samples and reports, but it still needs further motion/story work to meet every item in the supplied rebuild document.
