# Three styles + dynamic engine update — 28 October 2026

Studio mein sirf Gemini aur Freesound chahiye. Teenon reference styles SFX-only hain:

1. Silent slapstick: selective colour, expressive close-ups aur readable physical comedy.
2. Coloured cartoon: coloured characters/environments; spoken dialogue ya Cartesia nahi.
3. Elastic meme cartoon: uploaded reference clips se li gayi general direction—muted background, original ink outlines, oversized reactions, snappy actions aur reaction holds. Reference footage/character drawings ko copy karke templates mein nahi lagaya gaya.

Language, animation-planner, comedy-category aur physical-intensity selectors hata diye gaye hain. Bundled-sample/dynamic-joint buttons aur auto-render/auto-download checkboxes bhi hat gaye hain. Story se tone choose hota hai. Consenting adults ki non-graphic relationship comedy supported hai; explicit sexual content supported nahi.

Generate dabane ke baad direction, review aur render automatic hain. Video poora fetch hone ke baad Download video button ready hota hai. Click already prepared browser bytes ko save karta hai; click naya render ya server fetch shuru nahi karta. Automatic download bhi retained hai. Purane spoken plans ko studio SFX story ke roop mein dobara direct karta hai.

## Engine changes

- World-space foot contacts for walking/running, smooth lift/landing and exact resting endpoints; deterministic backward scrubbing.
- Custom upper/lower arm and leg artwork can bind to the same solved joints as the native rig. Native shoulders connect to their arm roots.
- Correct pencil ponytails, differentiated female facial drawing, shirt/suit handling and dynamic shoulder widths.
- Generated root-placement normalization, bounded expression controls, key-time lowering and static state handling reduce recoverable generation errors.
- Dynamic camera fitting protects native heads from accidental cropping. Opening machinery is recognized through actual moving part tracks, with visibility checks.
- Compact shared schema references reduce repeated drawing instructions. Scene schemas constrain actual entity IDs, sound roles and object-specific actions.
- Source identities, event wording, style, category and timing survive repair; coverage is relinked by event index. Completed stages can resume.
- Literal Freesound fallbacks support over-specific generated queries. Unavailable optional cues are recorded in sound-warnings.json; mandatory cues/authentication errors are still reported.

## Start

Extract the complete new ZIP. Open StickLaughStudio, then run START_WINDOWS.bat, or:

    npm ci
    npm run setup
    npm run build
    npm start

Open http://127.0.0.1:3001 and refresh the page after rebuilding. Enter only Gemini and Freesound keys in Connections. The supplied original .env is preserved unchanged in this private checkpoint.

## Evidence and limits

See docs/THREE-STYLES-VERIFICATION.json and the samples directory for the actual saved render plans, sound credits and encoded-video checks. Browser workflow verification mocks providers; live Gemini planning and real Freesound/Remotion renders are verified separately.

The third style is an original procedural 2D interpretation. This engine does not guarantee exact branded-model likeness, arbitrary physics/3D, perfect comedy or successful execution of every possible story. Validation and bounded repair remain necessary; provider outages, quotas, unsupported mechanics and unresolved generated geometry can still fail honestly. A label or feature claim alone is not treated as a successful render.
