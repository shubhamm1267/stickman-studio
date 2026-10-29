# StickLaugh Studio 9.1 — live API fixes

Current audit aur naye fixes: [docs/CURRENT-AUDIT.md](docs/CURRENT-AUDIT.md). Purane release sample ke pass hone ko har nayi story ki guarantee na maanein; actual MP4 review ab generation pipeline ka hissa hai.

## Start
Node.js 24 LTS, FFmpeg aur ffprobe install karein. Windows par START_WINDOWS.bat chalayein; Mac/Linux par bash start.sh. Browser: http://127.0.0.1:3001

Settings mein Gemini aur Freesound keys daalein. Ya .env.example ki copy .env banayein aur GEMINI_API_KEY / FREESOUND_API_KEY set karein. Default Gemini model gemini-3.5-flash-lite hai; Settings mein badal sakte hain. Supplied private keys distributed ZIP mein embed nahi hain.

Silent SFX mode mein TTS ki zarurat nahi. Nonverbal babble Freesound recording se aata hai, kisi language ka dialogue nahi.

## Naya generation flow
Story blank rakhein toh Gemini original gag banata hai; apni poori story bhi de sakte hain. Semantic director aur choreographer actual actions validate karte hain. Clean, adult-relatable aur naughty tone options hain. Auto-download default on hai. Server ki generated media render hone ke 10 minute baad delete hoti hai; downloaded personal copy delete nahi hoti. Har imaginable story ki perfect animation guarantee nahi hai.

## Fixes
- Gemini generateContent response parsing aur JSON mode: large animation schemas ko prompt ke saath diya jata hai; local Zod validation authoritative hai. Provider schema-grammar 400 aur empty text response failures avoid hote hain.
- Outline ke guessed beat indices scene generation se pehle remove; actual indices semantic review mein link hote hain.
- Scene repair ko previous invalid scene JSON, precise errors aur concrete valid format example milta hai. Bounded repair budget hai.
- Temporary HTTP 429/5xx ke liye bounded retries, Retry-After aur cancellation support.
- Live render mein Freesound search/download compulsory for sound cues, even if Gemini selected a curated fixture. Bundled demo is explicitly separate.
- Sound search exact query ke baad related literal synonyms try karta hai; unavailable sound par clear error, fake success nahi.
- Download links server-side attachment headers use karte hain. Preview/range playback stays supported.

## Dynamic support aur limits
Gemini scene timing, cast design options, custom vector props/backgrounds, paths, actor poses/keyframes, object motion, attachment, camera aur sound timing generate karta hai. Ek fixed example story ka output nahi hai.

Current renderer uses a finite rig/action system: human rigs plus dog/cat/lion. Custom drawing objects can depict new things; this does not automatically create a fully articulated new animal or any imaginable physical action. Unsupported requirements should return blockedReasons rather than silently substitute. Arbitrary story fidelity and animation quality still need visual review; zero API/network errors cannot be guaranteed.

## Repeat live test
Set both keys in .env, then: node scripts/live-sample.mjs
Optional SAMPLE_STORY environment variable changes the story. Outputs: deliverables/live-api-sample. The script calls real Gemini, real Freesound and Remotion; it has no bundled fallback. npm run check executes automated tests and web build.

## Earlier release sample (historical)
Gemini + Freesound live run complete: deliverables/live-dance-sample/video.mp4. 10 seconds, 1080x1920, 60fps; Freesound IDs 181220 and 635110, no bundled fallback. 6,216 automated tests passed, web build passed. Details: docs/V9.1-LIVE-VALIDATION.json.
