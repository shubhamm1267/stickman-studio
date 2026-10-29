# Dynamic update — 27 October 2026

User ke kehne par remaining testing pause karke yeh working checkpoint diya gaya hai. Yeh final fully-tested universal engine nahi hai.

## Kya add hua
- UI mein Dynamic designs + articulated parts planner (default API directionMode=dynamic).
- Gemini se story outline, har asset ka actual vector geometry design, per-scene choreography, expressions, Freesound cues aur independent review.
- Named nested parts; position, rotation, scale, opacity animation; once/loop/pingpong; scene-specific tracks; custom replacement character/prop art and bone attachment.
- Moving machine part se object attachment, nested transforms aur release continuity.
- Generic custom designs: object name fixed template se dispatch nahi hota. 11 authored vehicle/appliance examples aur excavator/fridge fixture included.
- Existing 18+ NON-GRAPHIC adult comedy with adult ages and explicit opt-in retained. Explicit sexual content is not supported.
- Silent SFX dynamic flow uses Gemini + Freesound; no image-generation key needed. Existing dialogue mode still requires Cartesia.

## Chalana
1. Node version package.json ke engines ke mutabik install karein; FFmpeg/ffprobe available hon.
2. npm ci
3. npm run setup
4. npm run build
5. npm start
6. Browser: http://127.0.0.1:3001
7. Silent SFX + Dynamic planner select karke story likhein. Preview dynamic joints se authored local fixture dekh sakte hain.

Original .env preserve kiya gaya hai. Source, lockfile, assets, fixtures aur tests included; node_modules/build caches excluded.

## Verified / pending
- Previous full regression run after main changes: 6,384 Node tests and 10 Python tests passed; frontend build passed.
- Authored excavator/fridge sample rendered through Remotion at 1920x1080, 60 fps, 10 seconds; encoded checks passed.
- Browser loaded updated UI and dynamic preview without page errors.
- Live Gemini connectivity and Freesound CC0 search passed.
- Live end-to-end dynamic planning exposed model/schema and part-ID issues. Corrective feedback, leaf-to-group wrapping, a smaller outline schema, and explicit action vocabulary were added. Latest live attempt and final regression rerun were stopped/deferred at the user's request. Do not claim arbitrary-story live generation is verified.

## Limits
2D vector cartoon, not general 3D or photorealism. Exact BMW/Thar/superhero likeness and every possible action are not guaranteed. Arbitrary new parts need correct generated geometry and keyframes. General physics, automatic fluid/cloth simulation, unconstrained anatomy and guaranteed cross-scene continuity remain outside the verified scope. Unsupported requirements should fail visibly instead of silently changing the story. Human visual review remains needed.

## Later checks
npm run test:dynamic
npm test
npm run build
npm run smoke:dynamic:live (uses configured Gemini quota)

See prompts/dynamic-director.md for the executable design/motion contract.
