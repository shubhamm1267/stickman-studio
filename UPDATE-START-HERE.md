# Expressive acting update — 28 October 2026

Six attached videos belong to category 3. See `docs/THIRD-STYLE-REFERENCE-STUDY.md` and `docs/UPDATE-STATUS.md` for the inspected references, actual changes and remaining work. Older README/audit files are historical; they do not prove this update passed live generation.

## Start

Requirements: Node 22.12–22.x or Node 24.x, npm, FFmpeg and FFprobe on PATH. Keep the included original `.env` private.

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3001 (or the port printed by the server). Windows: existing `START_WINDOWS.bat` remains available. `npm run dev` starts the Angular development UI and server.

Default video renderer is Chromium/Remotion. If Chrome is unavailable, the optional browserless SVG backend uses the same frame evaluator and encoded QA:

```sh
# Linux/macOS
RENDER_ENGINE=resvg npm start
# Windows PowerShell
$env:RENDER_ENGINE='resvg'; npm start
```

Chromium could not be downloaded in the validation environment (proxy tunnel timeout). Delivered technical examples use the SVG backend; font/filter parity with Chromium is not claimed.

## Verify and reproduce

```sh
npm test
npm run build
npm run smoke:providers
npm run demo:plans
node scripts/contact-diagnostics.mjs
# Real live production route, including encoded observation and repair:
npm run samples -- supported-acting
# A new story via actual HTTP plan/render routes:
node scripts/verify-live-workflow.mjs
```

`npm run samples` now uses the actual application render endpoint, live audio and video review. Provider failures fail the result; they are never converted into a pass. `render:plan` also uses production observation/repair unless explicitly run in bundled diagnostic mode. Old sample runner remains `samples:legacy` for compatibility.

For a local technical-only fixture reproduction, explicitly opt out of online review:

```sh
RENDER_ENGINE=resvg BUNDLED_DEMO=1 npm run render:plan -- examples/supported-acting.json deliverables/local-acting
```

Bundled mode is not proof of an end-to-end production pass. Delivered fixture plans and matching audio credits are beside each video. `deliverables/verification` contains test/build/provider/contact reports; `deliverables/live-workflow` contains the actual new-story workflow result.

## Acting contract

`perform.pose` supplies static channels; keyframes animate distinct channels. Duplicate ownership is rejected. A referenced motion track cannot also have a standalone pose. `mouthOpen` is a legacy absolute alias for `mouthAperture`, clamped to [0,1] in drawing; supplying both in one pose is rejected. Prefer `mouthAperture`. Named expressions set defaults only when no explicit openness owns that feature.

`spineAngle` is degrees, -75..75, actor-local, and bends neck/implicit head around the hip. Explicit head keyframes override implicit head position. `bodyAngle` still rotates the global root. Supported bows use `spineAngle` and `constraints:[{kind:'plant',points:['leftFoot','rightFoot'],floorY:780}]`. `plant` pins each listed point to its incoming world X and floor Y; `ground` retains its older root-height correction semantics. New constraints do not provide a general balance or rigid-body solver.
