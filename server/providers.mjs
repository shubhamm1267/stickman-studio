import {stripGeneratedPlacementIds} from '../shared/normalize-directed-scene.mjs';
import {studioStyleOptions} from "../shared/reference-style.mjs";
import {compileScene} from "./scene-compile.mjs";
import {setTimeout as delay} from "node:timers/promises";
import{durationInstruction,assertOutlineDuration}from"../shared/duration.mjs";
import{directSceneSounds}from"./sound-director.mjs";
import {assertDistinctCast} from "../shared/character-design.mjs";
import { evaluate } from "../renderer/engine.mjs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {createHash} from 'node:crypto';
import { inspectPlan, planHash } from "./inspect.mjs";
import {
  OutlineSchema,
  SceneSchema,
  jsonSchema,
  validatePlan,
  ACTIONS,
  HookSchema,
} from "../shared/schema.mjs";
import {assertAdultCategoryCast,comedyCategoryInstructions, normalizeComedySettings} from "../shared/comedy-category.mjs";
export function providerRetryDelay(header,message,attempt,now=Date.now()){
  let suggested;
  if(header){const seconds=Number(header);suggested=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-now;}
  if(!Number.isFinite(suggested))try{
    const details=JSON.parse(message).error?.details||[];
    const retry=details.find(d=>typeof d.retryDelay==='string')?.retryDelay;
    if(retry&&/^\d+(?:\.\d+)?s$/.test(retry))suggested=parseFloat(retry)*1000;
  }catch{}
  return Math.max(1000,Math.min(120000,Number.isFinite(suggested)?suggested:1000*2**attempt));
}
export async function request(
  url,
  { signal, timeout = 90000, ...init } = {},
  fetcher = fetch,
) {
  let last;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetcher(url, {
        ...init,
        signal: AbortSignal.any([
          AbortSignal.timeout(timeout),
          ...(signal ? [signal] : []),
        ]),
      });
      if (r.ok) return r;
      const message = await r.text();
      if ((r.status === 429 || r.status >= 500) && i < 4) {
        const wait=providerRetryDelay(r.headers.get('retry-after'),message,i);
        await delay(wait, undefined, {signal});
        continue;
      }
      throw Error(`Provider HTTP ${r.status}: ${message.slice(0, 450)}`);
    } catch (e) {
      last = e;
      if (signal?.aborted || i === 4 || /Provider HTTP/.test(e.message))
        throw e;
    }
  }
  throw last;
}

async function geminiRequestWithBackup(
  url,
  options,
  credentials,
  fetcher = fetch
) {
  try {
    // Primary key already has automatic retries
    return await request(url, options, fetcher);

  } catch (error) {

    const backupKey =
      process.env.GEMINI_API_KEY_BACKUP?.trim();

    const primaryKey = credentials.gemini?.trim();

    // Backup only for temporary provider failures
    const temporaryFailure =
      /^Provider HTTP (502|503|504):/.test(error.message);

    // No backup, same key, or non-retryable error
    if (
      !backupKey ||
      backupKey === primaryKey ||
      !temporaryFailure
    ) {
      throw error;
    }

    console.warn(
      "Gemini primary failed after retries. Switching to backup key."
    );

    // Retry the SAME request using backup key
    return await request(
      url,
      {
        ...options,
        headers: {
          ...options.headers,
          "x-goog-api-key": backupKey,
        },
      },
      fetcher
    );
  }
}

export async function geminiJSON(
  prompt,
  schema,
  credentials,
  signal,
  fetcher = fetch,
  mediaParts = [],
  formatAttempt = 0,
) {
  signal?.throwIfAborted();
  if (!credentials.gemini) throw Error("Gemini API key is required.");
  const model = credentials.geminiModel || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw Error("Invalid Gemini model ID.");
  // Complex animation schemas exceed provider grammar limits. JSON mode plus
  // the complete schema in the prompt keeps local Zod validation authoritative.
  let r = await geminiRequestWithBackup(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": credentials.gemini },
      body: JSON.stringify({
        contents: [{role:"user",parts:[...mediaParts,{text:prompt+"\nReturn one JSON object matching this JSON Schema exactly. Omit optional fields when unused; never use null unless permitted.\n"+JSON.stringify(jsonSchema(schema))}]}],
        generationConfig: {responseMimeType:"application/json",maxOutputTokens:32768},
      }), signal,
    }, credentials, fetcher,
  );
  let body = await r.json();
  if (body.candidates?.[0]?.finishReason === "MAX_TOKENS")
    throw Error("Gemini output was truncated; reduce scene complexity or duration.");
  let text = body.candidates?.[0]?.content?.parts?.filter(x=>!x.thought).map(x=>x.text||"").join("") ||
    body.output_text || body.outputs?.map(x=>x.text||"").join("") ||
    body.steps?.filter(x=>x.type==="model_output").flatMap(x=>x.content||[]).map(x=>x.text||"").join("");
  if (!text){
    const reason=body.promptFeedback?.blockReason||body.candidates?.[0]?.finishReason||body.error?.status||'empty response';
    if(formatAttempt<2&&!/SAFETY|PROHIBITED|RECITATION/.test(reason))return geminiJSON(prompt+'\nReturn the requested JSON as text; no tool calls or explanations.',schema,credentials,signal,fetcher,mediaParts,formatAttempt+1);
    throw Error('Gemini returned no structured text ('+reason+').');
  }
  let value;
  try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*|```$/g, "").trim());}
  catch(e){if(!(e instanceof SyntaxError)||formatAttempt>=2)throw e;return geminiJSON(prompt+'\nYour previous response was malformed JSON ('+e.message+'). Return valid JSON only: double-quoted keys and strings, no trailing commas or markdown.',schema,credentials,signal,fetcher,mediaParts,formatAttempt+1);}
  // A single-item envelope is harmless only if its exact item validates.
  if(Array.isArray(value)&&value.length===1&&!schema.safeParse(value).success&&schema.safeParse(value[0]).success)value=value[0];
  if(typeof schema.normalizeGeneratedValue==='function')value=schema.normalizeGeneratedValue(value);
  try { return schema.parse(value); }
  catch(e) { e.generatedValue=value; throw e; }
}
export async function planStory(
  options,credentials,signal,progress=()=>{},fetcher=fetch,
){
  if(options.referenceStyle)options=studioStyleOptions(options);
  if(options.productionMode==='dialogue-toon'&&!credentials.cartesia){
    progress('Cartesia unavailable: directing a coloured visual story with Freesound SFX',1);
    options={...options,productionMode:'silent-sfx',artStyle:'toon',voice:false,directionMode:'dynamic'};
  }
  if(options.directionMode==='dynamic')return (await import('./dynamic-director.mjs')).planDynamicStory(options,credentials,signal,progress,fetcher);
  if(options.directionMode==='semantic'&&options.productionMode!=='dialogue-toon')return (await import('./semantic-director.mjs')).directSemanticStory(options,credentials,signal,progress,fetcher);
  const original=!options.story?.trim();let last;
  for(let attempt=0;attempt<(original?3:1);attempt++){
    try{return await planStoryAttempt({...options,_previousFailure:last},credentials,signal,progress,fetcher);}
    catch(e){if(!original||signal?.aborted||/Provider HTTP|API key is required|fetch failed/.test(e.message))throw e;last=e.message;progress(`Original story attempt ${attempt+1}/3 could not be animated faithfully; choosing a new feasible gag`,8);}
  }
  throw Error('Original comedy could not pass animation checks after 3 attempts: '+last);
}
async function planStoryAttempt(
  options,
  credentials,
  signal,
  progress = () => {},
  fetcher = fetch,
) {
  options={...options};
  options.story = options.story?.trim() || 'Create an ORIGINAL short visual slapstick comedy, choosing your own distinctive characters, setting and props within the supported renderer capabilities. Use a visible setup, escalating physical attempts, a surprising causal payoff and a final reaction. Keep the story feasible for the target duration: for 10 seconds use one setting, at most two characters, one main prop and 3 to 5 atomic visible events. Prefer clearly staged supported physical actions; avoid requiring elaborate acrobatics in a short clip. Do not reuse the bundled superhero, mosquito, banana-peel or jar stories. Include precisely timed nonverbal vocal reactions and effects, with no intelligible dialogue.';
  if(options._previousFailure)options.story+=' Previous original gag failed animation checks. Choose a different, simpler gag avoiding these failures: '+options._previousFailure.slice(0,2000);
  if(options.productionMode){options.voice=options.productionMode==="dialogue-toon";options.artStyle=options.voice?"toon":"pencil";}
  const seconds = options.duration,
    language = options.language || "hi",
    rules =
      (await readFile(
        new URL("../prompts/comedy-director.md", import.meta.url),
        "utf8",
      )) +
      "\n" +
      (await readFile(
        new URL("../prompts/action-reference.md", import.meta.url),
        "utf8",
      )) +
      (options.humorProfile === "adult-relatable"
        ? "\n" +
          (await readFile(
            new URL("../prompts/adult-relatable.md", import.meta.url),
            "utf8",
          ))
        : "") +
      (options.category ? "\n" + comedyCategoryInstructions(options) : "");
  const styleGuide = await readFile(new URL("../prompts/visual-style.md",import.meta.url),"utf8")+"\n"+await readFile(new URL("../prompts/reference-modes.md",import.meta.url),"utf8")+`\nPRODUCTION MODE: ${options.productionMode||"legacy"}.`;
  let outline, outlineError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      outline = await geminiJSON(
        `${rules}\n${styleGuide}\nYou are a comedy cartoon director. Write a visual, understandable story in ${language} based EXACTLY on: ${options.story}. Preserve supplied events, characters, objects. Output format ${options.format}; use #Shorts only for shorts. ${durationInstruction(options)} No captions; dialogue ${options.voice ? "optional, short" : "must be empty"}. Humor profile ${options.humorProfile || "clean"}. Output humorProfile and a first-three-seconds hook when the profile is specified. Adults only for adult-relatable. ${options.category ? comedyCategoryInstructions(options) : ""} For adult-comedy and romantic-comedy, every human cast character must include explicit integer ageYears >= 18; never leave an age ambiguous. Setup/action/reaction/payoff, no random actions. Characters: man/woman/grandma/child/dog/cat/lion, original pencil-style, variable colors/proportions. Props cap,can,bottle,jar,cup,phone,table,bench,dumbbell,balloon,car,chair,toilet,paperRoll,door,banana,peel,dustbin,sign,rubberDuck,headphones,gasMask,newspaper,drawing. Any other object MUST be a drawing using safe SVG path/ellipse/line nodes; physical labels only through prop.label, no images, scripts, external assets. Supported actions ${ACTIONS.join(",")}; unsupported complex requirements must go in blockedReasons, never silently substitute. Include precise story-event-to-scene coverage and relevant YouTube SEO (3 title variants, description, total tags <=500 characters, hashtags, pinned comment, thumbnail text). Requirements.action is optional: omit it for visual outcomes such as an object landing on a head (use worn plus attachment), and never require jar-only hold/struggle/tap/open for a non-jar object. Always fill the comedy blueprint. Omit coverage beatIndices until directing the scenes. Return schema JSON only. ${outlineError ? "Correct these previous outline errors: " + outlineError : ""}`,
        OutlineSchema,
        credentials,
        signal,
        fetcher,
      );
      if(options.category){
        outline.category=options.category;
        outline.comedySettings=normalizeComedySettings(options.category,options.comedySettings);
        if(options.category==='adult-comedy')outline.adultModeAcknowledged=options.adultOptIn===true;
        if(['adult-comedy','romantic-comedy'].includes(options.category))assertAdultCategoryCast(outline.characters,options.category);
      }
      for (const r of outline.requirements || []) {
        if (["hold","struggle","tap","open"].includes(r.action) && outline.propDesigns.find(p=>p.id===r.propId)?.type!=="jar")
          throw Error(`Requirement ${r.description}: ${r.action} is jar-only. Omit action for visual placement requirements; use worn/head attachment for objects landing on heads, and custom/perform for generic poses.`);
      }
      if(options.productionMode){outline.productionMode=options.productionMode;assertDistinctCast(outline.characters);}
      if (options.humorProfile && !outline.hook)
        throw Error("Missing first-three-seconds visual hook.");
      if (options.humorProfile) outline.humorProfile = options.humorProfile;
      if (
        outline.hook &&
        (outline.hook.sceneId !== outline.scenes[0].id ||
          outline.hook.end <= outline.hook.start)
      )
        throw Error(
          "Opening hook must use the first scene and an increasing time window.",
        );
      if (!outline.comedy) throw Error("Missing comedy blueprint.");
      assertOutlineDuration(outline,options);
      break;
    } catch (e) {
      if (signal?.aborted || /Provider HTTP|API key is required/.test(e.message)) throw e;
      outlineError = e.message;
      outline = null;
    }
  }
  if (!outline)
    throw Error("Story outline failed after repairs: " + outlineError);
  if (outline.blockedReasons.length)
    throw Error("Story needs changes: " + outline.blockedReasons.join("; "));
  if(options.strictStoryAudit){
    progress('Extracting independent story action contract',9);
    const contract=await geminiJSON(`Independently extract EVERY atomic visible event from the original request and the complete generated story. Do not trust the existing requirements or coverage: they may omit events. Bind events to existing scene, character and prop IDs only. CRITICAL: hold/struggle/tap/open are JAR-ONLY. For holding or straining on a non-jar object omit action and describe the visible grip/strain; the scene must implement it with a custom pose and attachment. For explicit supported verbs such as jump, walk, slip, laugh, cry, pick, place, wave, punch require the exact action; a leap must have jump, a second slip must be a separate requirement. Omit action only for outcomes requiring custom poses, motions or attachments; Use worn:true ONLY when an OBJECT comes to rest ON TOP OF a character head, like a hat. A character hitting something headfirst is NOT headwear; omit worn for collisions. Preserve all attempts, number of objects, actors and ending. Do not invent extra actions or reinterpret an attempted miss as successful reach. If the story cannot fit the scenes, report it instead of dropping events. Return requirements, with one concise description per atomic event. ORIGINAL REQUEST: ${options.story}. STORY BIBLE: ${JSON.stringify(outline)}.`,z.object({requirements:OutlineSchema.shape.requirements.unwrap().min(1)}).strict(),credentials,signal,fetcher);
    for(const r of contract.requirements){
      if(!outline.scenes.some(s=>s.id===r.sceneId)||r.characterId&&!outline.characters.some(c=>c.id===r.characterId)||r.propId&&!outline.propDesigns.some(p=>p.id===r.propId))throw Error('Story contract references an unknown scene, character or object: '+r.description);
    }
    for(const r of contract.requirements)if(['hold','struggle','tap','open'].includes(r.action)&&outline.propDesigns.find(p=>p.id===r.propId)?.type!=='jar')delete r.action;
    outline.requirements=[...contract.requirements].filter((r,i,a)=>a.findIndex(q=>JSON.stringify(q)===JSON.stringify(r))===i);
    outline.coverage=[...outline.coverage,...contract.requirements.map(r=>({storyEvent:r.description,sceneId:r.sceneId}))].filter((r,i,a)=>a.findIndex(q=>q.storyEvent===r.storyEvent&&q.sceneId===r.sceneId)===i);
  }
  // Outline beat indices are guesses: real beats do not exist until direction.
  outline.coverage = outline.coverage.map(({beatIndices, ...entry}) => entry);
  if (outline.hook) outline.hook = {...outline.hook, beatIndices: []};
  outline.characters = outline.characters.map(c=>({...c,...(options.productionMode?{rigVersion:2}:{}),artStyle:options.artStyle||"pencil"}));
  let scenes = [];
  for (let i = 0; i < outline.scenes.length; i++) {
    progress(
      `Directing scene ${i + 1}/${outline.scenes.length}`,
      10 + Math.round((35 * i) / outline.scenes.length),
    );
    let prompt = `MANDATORY: reach/pick/place/throw/swat/drink/hold/struggle/tap/open must specify targetId of an object placed in this scene. hold/struggle/tap/open are jar-only actions; use custom for holding other items. Actor root position is cast.position, not x/y. Every beat requires intent. Use custom poses for arbitrary gestures. Create a precise animated scene for this story bible: ${JSON.stringify(outline)}. ONLY generate scene ${JSON.stringify(outline.scenes[i])}. Previous scene end state (use cast.initialPose/emotion and prop open/angle for continuity unless the location/time changes): ${scenes.length ? JSON.stringify(evaluate(scenes.at(-1), scenes.at(-1).duration, outline.propDesigns)) : "Opening scene"}. ${rules} ${styleGuide} Stage coordinates x0..540, floor y780. Adult root at y780, head local[0,-405], hip[0,-160], shoulders[0,-305], arms length98+102, legs86+86. Female scale .76-.9; normal actor x160/400. No narration/captions. ${options.voice ? "Short relevant dialogue permitted." : "dialogue MUST be []."} Camera focus is WORLD coordinates: wide [270,530] zoom1.05, head close [actorX,390] zoom1.7; shots must continuously cover scene. Hands macro shot detail=hands and actorIds. Actor kinds and props use bible IDs only. Jar center typically [310,570], table[310,600], cup[365,580]. Built-in hold/struggle/tap/open targetId=jar; hand contact is solved automatically. Actions begin at start for duration, endpoints persist; new actions overwrite previous channels. Flex raises both arms + inflates muscles. React lowers arms, emotion is specified. Deflate shrinks muscles. Walk/run uses to WORLD ROOT[x,y]; point/custom pose uses LOCAL coordinates relative root. Pick uses targetId and hand and attaches prop at end; place uses to WORLD object position and detaches at end. Custom pose supports local head,hip,leftHand,rightHand,leftFoot,rightFoot,headAngle,muscle. Free props can use motions: targetId,start,duration,to WORLD position,arc (positive rises),angle final degrees,optional scale. Sequential motions persist; never overlap motion tracks for the same object. Never animate a held prop with motions. swat targets any prop: wind-up 0..42%, swing42..64%, contact64%, recover64..100%; SFX at64%. sneeze inhale until60%, blast68%, recover; duck lowers whole upper rig, stand restores it. wave and dance are rhythmic actions. Prop drawing nodes are geometry only. Put all story-specific objects in props. Sound cues can set beatIndex and syncTo=contact for swat/tap/sneeze, or syncTo=footfalls for walk/run, to use exact engine timing. Use trimSilence=true for new effects; sourceStart is a source-file offset, not scene time. Sound queries must describe the literal action and be short English Freesound queries. No irrelevant laugh/fart track. Every action and cue must fit duration. Include multiple dynamic expressions and clear holds/anticipation/recoil. Return exact Scene schema, no explanatory text.`;
    prompt += ` Each bible.requirements entry with action requires an EXACT beat.kind equal to action, actorId equal to characterId and targetId equal to propId when those fields are specified (even for gestures). Every cast characterId and props designId appears ONCE only; animate the same prop using motions rather than duplicate placements. walk/run/jump/fall/throw/slip/place MUST have to:[worldX,worldY]. Omit syncTo/beatIndex on sound cues unless you can prove an engine-defined contact. Use explicit sound start seconds instead. A valid minimal scene EXAMPLE (replace all IDs, timings, geometry and actions with the current story): {"id":"example","summary":"A man reacts to a moving object.","duration":10,"background":"custom","backgroundNodes":[],"cast":[{"characterId":"hero","x":270,"y":780,"scale":0.85,"facing":1,"emotion":"curious"}],"props":[{"designId":"object","x":360,"y":400,"scale":1,"angle":0,"open":0}],"motions":[{"targetId":"object","start":1,"duration":1,"to":[270,300],"arc":50,"angle":45}],"beats":[{"actorId":"hero","kind":"custom","start":0,"duration":1,"pose":{"rightHand":[70,-350]},"intent":"He raises his hand toward the object."},{"actorId":"hero","kind":"react","start":2,"duration":1,"emotion":"shock","intent":"He watches the moving object."}],"shots":[{"start":0,"end":10,"focus":[270,530],"zoom":1}],"sounds":[{"query":"boing","start":1,"duration":0.5,"volume":0.2,"required":true}],"dialogue":[]}.`;
    let scene, last, previous, repairErrors=[];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        scene = await geminiJSON(
          prompt + (last ? "\nRepair this previous scene JSON: " + JSON.stringify(previous) + "\nFix ALL errors, preserving previous corrections: " + last : ""),
          SceneSchema,
          credentials,
          signal,
          fetcher,
        );
        scene=directSceneSounds(compileScene(scene));
        scene.id = outline.scenes[i].id;
        if (Math.abs(scene.duration - outline.scenes[i].duration) > 0.05)
          throw Error(
            "Scene duration must remain " +
              outline.scenes[i].duration +
              " seconds.",
          );
        if (!options.voice && scene.dialogue.length)
          throw Error("Dialogue is disabled; dialogue must be empty.");
        let draft = {
          ...outline,
          version: 1,
          format: options.format,
          language,
          scenes: [
            ...scenes,
            scene,
            ...outline.scenes.slice(i + 1).map((s) => ({ ...scene, id: s.id })),
          ],
        };
        const pendingRequirements=draft.requirements;delete draft.requirements;
        scene = validatePlan(draft).scenes[i];
        draft.requirements=pendingRequirements?.filter(r=>r.sceneId===scene.id);
        let local = {
          ...draft,
          scenes: [scene],
          coverage: outline.coverage.filter((c) => c.sceneId === scene.id),
        };
        delete local.hook;
        delete local.humorProfile;
        let geometry = inspectPlan(local);
        if (!geometry.ok) throw Error(JSON.stringify(geometry.issues.filter(x=>x.severity==="error")));
        break;
      } catch (e) {
        if (signal?.aborted || /Provider HTTP|API key is required/.test(e.message)) throw e;
        previous = e.generatedValue || scene || previous;
        progress(`Repairing scene ${i+1}, attempt ${attempt+1}/5: ${e.message.slice(0,180)}`, 30);
        let feedback = e.message + (/unreachable-contact/.test(e.message) ? "\nCONCRETE REPAIR: For floor pick/place, BEFORE contact insert a custom crouch pose hip:[0,-50],head:[0,-275] and keep it until the object contact completes. Upright shoulder is 300px above root; arms only reach200px. Move actor horizontally near the object. For a missed reach use custom, not reach. Do not repeat the same standing contact with only small position changes." : /Jar-specific/.test(e.message) ? "\nFor generic holding or straining use kind:custom with an explicit pose, e.g. pose:{leftHand:[-30,-200],rightHand:[30,-200],headAngle:5}, emotion:strain. Do not use hold/struggle/tap/open on a non-jar prop." : /Custom action needs/.test(e.message) ? "\nEvery kind:custom MUST include pose with real local rig coordinates, e.g. pose:{leftHand:[-60,-220],rightHand:[60,-220],headAngle:8}. Intent alone cannot animate." : "");
        repairErrors.push(feedback.slice(0,4000));last=[...new Set(repairErrors)].slice(-5).join("\n");
        scene = null;
      }
    }
    if (!scene) throw Error(`Scene ${i + 1} validation failed: ${last}`);
    scenes.push(scene);
  }
  return reviewAndRepair(
    validatePlan({
      ...outline,
      sourceIdea: options.story,
      version: 1,
      ...(options.productionMode?{renderFps:options.renderFps||(options.productionMode==="silent-sfx"?60:30)}:options.renderFps?{renderFps:options.renderFps}:{}),
      ...(options.durationMode?{durationMode:options.durationMode}:{}),
      format: options.format,
      language,
      scenes,
    }),
    credentials,
    signal,
    progress,
    fetcher,
  );
}
const ReviewSchema = z
  .object({
    hook: HookSchema.optional(),
    coverage: z
      .array(
        z
          .object({
            storyEvent: z.string(),
            sceneId: z.string(),
            beatIndices: z.array(z.number().int().min(0)).max(100),
          })
          .strict(),
      )
      .min(1),
    issues: z
      .array(
        z
          .object({
            sceneId: z.string(),
            problem: z.string().min(5),
            repair: z.string().min(5),
          })
          .strict(),
      )
      .max(40),
    summary: z.string().min(10).max(1500),
  })
  .strict();
export async function reviewAndRepair(
  input,
  credentials,
  signal,
  progress = () => {},
  fetcher = fetch,
) {
  if(input.planningMode==='dynamic')return (await import('./dynamic-director.mjs')).reviewDynamicPlan(input,credentials,signal,progress,fetcher);
  let p = validatePlan(input),
    allowDialogue = p.productionMode!=="silent-sfx" && p.scenes.some((s) => s.dialogue.length);
  delete p.review;
  let requiredEvents = p.coverage.map((c) => ({
    storyEvent: c.storyEvent,
    sceneId: c.sceneId,
  }));
  let last = "",
    guide = await readFile(
      new URL("../prompts/action-reference.md", import.meta.url),
      "utf8",
    );
  guide += "\n" + await readFile(new URL("../prompts/visual-style.md",import.meta.url),"utf8")+"\n"+await readFile(new URL("../prompts/reference-modes.md",import.meta.url),"utf8");
  for (let pass = 0; pass < 3; pass++) {
    progress(`Story fidelity review ${pass + 1}/3`, 48 + pass * 5);
    const r = await geminiJSON(
      `Act as a strict animation continuity editor. ${guide} If plan.hook exists, return hook with real opening beatIndices; verify that the problem/contrast is actually visible by second3, not just a promise in intent. Reject a static idle/talk opening or a meaningless movement labelled a hook. Judge cause/effect, escalating attempts, embarrassment/reaction and earned payoff for the selected humorProfile. Read the ORIGINAL user instruction in plan.sourceIdea (or plan.story when sourceIdea is absent), then read the generated complete plan.story and every actual beat, prop motion, shot and SFX. Do not infer an action merely from summary/intent. Check every explicit user event, object, actor, location and ending; check anticipation, readable contact, causal escalation, payoff and callback. Compare supported action semantics: pick attaches after completion; place detaches; swat contacts at64%; motions move free props; only jar hold/struggle/tap/open actually open a jar; custom changes only the listed pose. Static drawing geometry cannot implement unseen actions. Do not approve an arbitrary fantasy action by renaming its intent. Return hook whenever FULL PLAN has hook; copy sceneId/start/end/intent and add actual beatIndices. Return exact required coverage entries with real zero-based beatIndices, preserving storyEvent and sceneId. For a missing event use beatIndices:[] and report an issue; never invent a beat index. Add missing user events as coverage and report the scene requiring them. Every issue needs the existing sceneId and concrete repair. No issues only if actions really implement the story. Required coverage: ${JSON.stringify(requiredEvents)}. Previous repair context: ${last}. FULL PLAN: ${JSON.stringify(p)}`,
      ReviewSchema,
      credentials,
      signal,
      fetcher,
    );
    for (const c of requiredEvents)
      if (
        !r.coverage.some(
          (v) => v.storyEvent === c.storyEvent && v.sceneId === c.sceneId,
        )
      )
        throw Error("Fidelity review dropped story event: " + c.storyEvent);
    if (p.hook && !r.hook) {
      last = "REQUIRED: Return hook exactly with sceneId/start/end/intent and actual beatIndices. Existing opening hook: " + JSON.stringify(p.hook);
      if(pass===2) throw Error("Review must link the opening hook after retries.");
      continue;
    }
    if (r.hook) p.hook = r.hook;
    requiredEvents = r.coverage.map((c) => ({
      storyEvent: c.storyEvent,
      sceneId: c.sceneId,
    }));
    p = validatePlan({ ...p, coverage: r.coverage });
    let geometry = inspectPlan(p, { requireCoverage: true });
    let problems = [
      ...r.issues,
      ...geometry.issues
        .filter((i) => i.severity === "error")
        .map((i) => ({
          sceneId: i.sceneId,
          problem: i.message,
          repair: "Fix rig positions/timing while preserving the story.",
        })),
    ];
    if (!problems.length) {
      p.review = {
        method: "gemini",
        planHash: planHash(p),
        summary: r.summary,
      };
      return validatePlan(p);
    }
    last = JSON.stringify(problems);
    if (pass === 2)
      throw Error(
        "Story review still has unresolved problems after repairs: " + last,
      );
    for (const sceneId of new Set(problems.map((i) => i.sceneId))) {
      let index = p.scenes.findIndex((s) => s.id === sceneId);
      if (index < 0) throw Error("Review referenced unknown scene " + sceneId);
      progress("Repairing story scene " + sceneId, 51 + pass * 5);
      const fixed = await geminiJSON(
        `Repair this scene. ${guide} Preserve the opening hook where this is the first scene. Preserve original story and all required events. Do not invent unsupported actions. Fix exactly these problems: ${JSON.stringify(problems.filter((x) => x.sceneId === sceneId))}. Keep scene id and duration. Stage x0..540 floor780; root normal780; head local-405, shoulders-305, arms98+102; move actor into reach of props. Camera shots cover whole scene. Every free prop motion references a placed prop. Original scene: ${JSON.stringify(p.scenes[index])}. Story bible: ${JSON.stringify(p)}. Return Scene JSON only.`,
        SceneSchema,
        credentials,
        signal,
        fetcher,
      );
      if (!allowDialogue && fixed.dialogue.length)
        throw Error("Repair introduced dialogue into an SFX-only story.");
      if (
        fixed.id !== sceneId ||
        Math.abs(fixed.duration - p.scenes[index].duration) > 0.01
      )
        throw Error("Repair changed scene identity or duration");
      p.scenes[index] = directSceneSounds(compileScene(stripGeneratedPlacementIds(fixed)));
    }
    // Beat indices may change during repair; semantic reviewer relinks them on next pass.
    p.coverage = requiredEvents.map((c) => ({ ...c }));
    if (p.hook) p.hook = { ...p.hook, beatIndices: [] };
    p = validatePlan(p);
  }
  throw Error("Story fidelity review failed.");
}
export async function searchSound(query, key, signal, fetcher = fetch, selection={}) {
  if (!key)
    throw Error("Freesound API key is required to resolve new sound effects.");
  const alternatives = [query];
  const synonyms = [
    [/\b(?:fan|ventilator)\b/i, 'electric fan'],
    [/\b(?:fan|ventilator)\b/i, 'fan'],
    [/\b(?:engine|motor|bmw|tractor|truck)\b/i, 'engine'],
    [/\b(?:switch|button)\b.*(?:click|press)|(?:click|press).*\b(?:switch|button)\b/i, 'switch click'],
    [/\b(?:door|hinge)\b/i, 'door'],
    [/gibberish|mutter|mumbl|babbl/i, 'gibberish'],
    [/punch|impact|slap|fist/i, 'punch'],
    [/flight|wind|air rush|gust/i, 'wind'],
    [/swish|whoosh/i, 'whoosh'],
    [/foot|steps|walking/i, 'footsteps'],
    [/plop|landing/i, 'plop'],
    [/cloth|flag|flap/i, 'cloth'],
    [/cry|sobb/i, 'crying'],
    [/gasp|gasasp|shock|surpris/i, 'gasp'],
    [/laugh|chuckl|giggl/i, 'laughter'],
    [/grunt|effort|strain/i, 'grunt'],
    [/boing|bounce/i, 'boing'],
    [/squeak|rubber.*duck|toy.*squeal/i, 'squeak'],
    [/pop|burst/i, 'pop'],
    [/creak/i, 'creak'],
    [/jar|lid|bottle.*open/i, 'jar open'],
    [/clink|glass|cup/i, 'clink'],
    [/crash|fall|thud/i, 'thud'],
    [/splash|water/i, 'splash'],
    [/rip|tear/i, 'ripping'],
    [/stretch|elastic/i, 'stretch'],
    [/buzz|mosquito|insect/i, 'buzz'],
    [/snore/i, 'snoring'],
    [/fart|flatulen/i, 'fart'],
    [/sneez/i, 'sneeze'],
    [/plastic.*(?:pickup|pick up|object|handling)|(?:pickup|handling).*plastic/i, 'plastic handling'],
    [/plastic.*(?:pickup|pick up|object|handling)|(?:pickup|handling).*plastic/i, 'plastic tap'],
    [/wood.*(?:pick[\s-]*up|handling|object)|(?:pick[\s-]*up|handling).*wood/i, 'wood tap'],
    [/metal.*(?:pick[\s-]*up|handling|object)|(?:pick[\s-]*up|handling).*metal/i, 'metal clink'],
  ];
  for (const [pattern, term] of synonyms)
    if (pattern.test(query) && !alternatives.includes(term)) alternatives.push(term);
  for (const search of alternatives) {
    const u = new URL("https://freesound.org/apiv2/search/text/");
    u.searchParams.set("query", search);
    u.searchParams.set("filter", 'license:"Creative Commons 0" duration:[0.05 TO 20]');
    u.searchParams.set("fields", "id,name,username,license,previews,duration,url,tags,description");
    u.searchParams.set("page_size", "15");
    const r = await request(u, {headers:{Authorization:`Token ${key}`},signal}, fetcher);
    const j = await r.json();
    const words=query.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2&&!['sound','effect','cartoon','funny'].includes(w));
    const candidates=(j.results||[]).filter(x=>String(x.license).includes('/publicdomain/zero/')&&x.previews?.['preview-hq-mp3']).filter(x=>selection.role!=='nonverbal'||!/\b(music|song|lyrics|narration|sentence|conversation)\b/i.test(x.name||'')).map(item=>{
      const name=(item.name||'').toLowerCase(),tags=(item.tags||[]).join(' ').toLowerCase();
      let score=words.reduce((n,w)=>n+(name.includes(w)?4:tags.includes(w)?2:0),0);
      if(selection.duration&&item.duration)score-=Math.abs(Math.log(item.duration/selection.duration))*.3;
      return{item,score};
    }).sort((a,b)=>b.score-a.score);
    if(candidates.length){const best=candidates.filter(x=>x.score>=candidates[0].score-.2);const seed=createHash('sha256').update(String(selection.seed||query)).digest().readUInt32LE(0);return best[selection.seed?seed%best.length:0].item;}
  }
  throw Error("No CC0 Freesound match for: " + query + ". Use a shorter literal sound query.");
}
export async function cartesiaBytes(
  text,
  voiceId,
  credentials,
  language,
  signal,
  fetcher = fetch,
) {
  if (!credentials.cartesia || !voiceId)
    throw Error(
      "Cartesia key and a voice ID for each speaking character are required.",
    );
  const r = await request(
    "https://api.cartesia.ai/tts/bytes",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.cartesia}`,
        "Cartesia-Version": credentials.cartesiaVersion || "2026-08-14",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: credentials.cartesiaModel || "sonic-3.6",
        transcript: text,
        voice: voiceId,
        language,
        output_format: {
          container: "wav",
          encoding: "pcm_s16le",
          sample_rate: 44100,
        },
      }),
      signal,
    },
    fetcher,
  );
  return Buffer.from(await r.arrayBuffer());
}
