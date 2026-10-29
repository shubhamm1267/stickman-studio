# Point 1 — archive, environment, and baseline verification

**Verification date:** 2026-10-26  
**Scope:** Point 1 only. No feature implementation or Point 2 work was started.

## Supplied archive

- File: `StickLaugh_Dynamic_04_InteractionAnchors_Partial_20261025.zip`
- User-specified expected SHA-256:  
  `d2dc6541c962cdc1d3f1f92ba664b8158bbe8f18ef69d7baf932675a4c920468`
- Computed SHA-256 of the supplied file:  
  `124e26b39d2465ffca15ced4fde6a347d8475862d072aaf1ca4603ee4b694a01`
- **Result:** hash mismatch. The received archive must not be represented as
  the expected checkpoint. All source findings below describe the archive that
  was actually attached.
- ZIP test: passed (`unzip -t`; Python `ZipFile.testzip()` returned no bad
  entry); 227 entries.
- Path checks: no absolute paths, `..` traversal components, backslash paths,
  or symlink entries were found. Extraction was performed into a separate
  working directory after rejecting unsafe paths and symlinks.
- Required files were present: `CHECKPOINT.md`, `docs/ANIMATION-IR.md`,
  `docs/CURRENT-AUDIT.md`, root and web package manifests, and the lockfile.
- The original attached ZIP was left unchanged.

## Runtime and dependencies

- Runtime: Node.js `v24.22.1`, Linux `x64`; npm `11.19.1`.
- Browser executable available: Chromium / Chrome for Testing
  `153.0.8010.12` (`chromium` on PATH).
- FFmpeg and FFprobe: `7.0.2`.
- The project's `findBrowser()` returned `NOT_FOUND`, even with the extracted
  project's dotenv configuration loaded. The system Chromium binary is present,
  but no Remotion MP4 export was run in this Point 1 check.
- Root package scripts and dependencies, Angular workspace scripts, and the
  lockfile were inspected. `npm ci --ignore-scripts --no-audit --no-fund`
  installed 623 packages. Its first attempt failed with DNS `ENOTFOUND`; after
  network access was enabled, the exact command completed successfully.
- `npm ls --depth=0` completed successfully.
- Observed metadata drift: root `package.json` reports version `9.1.0`, while
  the root package-lock entry reports `9.0.0`. `npm ci` nevertheless succeeded.

## `.env` and providers

- The received archive contained a real `StickLaughStudio/.env`. It was
  preserved in the extracted working project and its permissions were
  restricted to owner read/write. Its values were never displayed, logged, or
  copied into the delivery ZIP.
- Only the permitted credential names were checked for configured,
  non-empty values: `GEMINI_API_KEY` and `FREESOUND_API_KEY`; both were present.
- `.gitignore` excludes `.env`. `server/index.mjs` imports `dotenv/config`;
  `/api/plan` and `/api/render` use the server environment as a fallback.
- Real live provider requests through the project's provider implementation:
  - Gemini `geminiJSON`: passed.
  - Freesound `searchSound`: returned a usable CC0 sound result.
- The live backend smoke test started `server/index.mjs` with those two key
  variables removed from the inherited process environment and submitted
  `/api/plan` without credentials in the request body. The job reached the
  Gemini choreography and story-audit stages, confirming the server loaded its
  local `.env`. It then failed after four choreography attempts because the
  generated score omitted the required “tries to pick up the small ball”
  action. This is a failed live Generate-plan test, not a provider-auth failure.
- No full Freesound asset download/audio build or Remotion MP4 render was run.
  The direct Freesound search test confirms provider access only; it does not
  verify the complete audio/render pipeline.
- The attached archive's `.env` is the only local configuration inspected
  here. This environment does not imply access to any separate `.env` on the
  user's own machine.

## Source-path review

- Frontend Generate in `web/src/main.ts` submits options to `/api/plan` and
  polls the job. `updatePreview()` submits to `/api/preview`; the render flow
  submits to `/api/render`.
- `server/index.mjs` validates requests, resolves credentials from server-side
  environment configuration, and queues planning/render jobs.
- The shared evaluator and frame renderer are `evaluate()` and `svgFrame()` in
  `renderer/engine.mjs`. `/api/preview` validates a plan and calls
  `svgFrame()`.
- `renderer/index.tsx` uses `svgFrame()` for Remotion frames and Remotion's
  `Audio` layer for the prepared soundtrack. `server/render.mjs` bundles and
  renders via `@remotion/bundler` and `@remotion/renderer`.
- `server/media.mjs` resolves SFX through `searchSound`, downloads validated
  preview URLs, and uses FFmpeg for audio preparation; `server/production.mjs`
  sequences audio, render, encoded QA, and live visual review.
- `docs/ANIMATION-IR.md`'s checkpoint-04 description was checked against
  `shared/schema.mjs`, `renderer/engine.mjs`, and the focused tests. The
  described anchors are bounded data and shared-evaluator behavior, not a
  general contact solver. Existing audit limitations remain.

## Commands and results

| Command / check | Result |
| --- | --- |
| `sha256sum` on attached archive | Actual hash recorded above; expected hash mismatch |
| `unzip -t` and Python ZIP CRC/path/symlink checks | Passed; 227 entries |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed after network access was enabled; 623 packages |
| `npm ls --depth=0` | Passed |
| `npm run check` | Passed; 6,289 tests, 0 failures; Angular production build completed |
| `node --test tests/interaction-anchors.test.mjs` | Passed; 7 tests, 0 failures, including HTTP `/api/preview` |
| Live `geminiJSON` request using `.env` | Passed |
| Live `searchSound` request using `.env` | Passed; usable CC0 search result |
| Live `/api/plan` with server-loaded `.env` | Failed at choreography/story audit; no plan produced |
| Remotion MP4 export | Not run; no claim of live render/export success |

## Delivery and limitations

The Point 1 source ZIP is packaged separately from the attached archive. It
contains the source, lockfile, fixtures, tests, and updated checkpoint
documentation. The configured `.env`, `node_modules`, build output, job data,
and generated media are excluded. No empty `.env.example` is supplied as a
substitute for the local working `.env`.

The key unresolved issue is the supplied archive SHA-256 mismatch. A successful
offline test suite and successful provider calls do not authenticate that
archive or make the failed live story-generation test pass. No MP4 or full
audio-pipeline success is claimed.
