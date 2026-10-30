import { compileStylePerformance } from '../shared/style-performance.mjs';
import { originalStoryBrief } from '../shared/story-variation.mjs';
import {availableActions} from '../shared/action-capabilities.mjs';
import {reviewPropRecognition,assetPreview,planObjectDrawing} from './asset-recognition.mjs';
import {propConstruction} from '../shared/prop-construction.mjs';
import {generateObjectBlueprint} from './object-blueprint.mjs';
import {directPerformance,continuityReceipt,compileDirectedPerformance,auditDirectedPerformance} from './performance-director.mjs';
import { fitDynamicCameras } from "../shared/dynamic-framing.mjs";
import { referenceStyleInstructions } from "../shared/reference-style.mjs";
import { normalizeDirectedScene, normalizeCastRoots } from "../shared/normalize-directed-scene.mjs";
import { normalizeGeneratedArt } from "../shared/normalize-art.mjs";
import { checkpointRunner } from "./dynamic-checkpoints.mjs";
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { geminiJSON } from './providers.mjs';
import { OutlineSchema, SceneSchema, PlanSchema, VisualSpecSchema, validatePlan, CharacterSchema, PropSchema, BeatSchema, ACTIONS } from '../shared/schema.mjs';
import { PartAnimationSchema } from '../shared/visual-spec-schema.mjs';
import { assertAdultComedyRequest, comedyCategoryInstructions, normalizeComedySettings } from '../shared/comedy-category.mjs';
import {
  durationInstruction,
  normalizeAutoOutlineDuration,
  assertOutlineDuration
} from '../shared/duration.mjs';
import { inspectPlan, planHash } from './inspect.mjs';
import { compileScene } from './scene-compile.mjs';

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);

const DraftOutlineSchema = OutlineSchema.extend({
  requirements: z.array(
    OutlineSchema.shape.requirements.unwrap().element.omit({ action: true })
  ).max(80).optional(),
  characters: z.array(
    CharacterSchema.omit({ visualSpec: true, rigRequirement: true, visualEvidence: true })
  ).min(1).max(6),
  propDesigns: z.array(
    PropSchema.omit({
      visualSpec: true,
      assetCapabilities: true,
      objectBehaviors: true,
      visualEvidence: true,
      contactEventIds: true,
      optionalSourceAsset: true,
      rightsStatus: true
    }).extend({
      nodes: z.array(z.never()).max(0).default([])
    })
  ).max(40)
});

const nativeProperty = z.enum([
  'kind', 'hairStyle', 'hair', 'skin', 'outfit', 'faceShape',
  'wardrobe', 'accessory', 'build', 'headWidth', 'headHeight', 'costume','ageYears'
]);
export function nativePropertyAvailable(design,property){
  if(property==='ageYears')return ['man','woman','grandma'].includes(design.kind)&&design.ageYears>=65;
  if(design[property]!==undefined)return true;
  // These optional values have real renderer defaults. Omitting faceShape
  // does not mean a native face is missing.
  return ['man','woman','grandma','child'].includes(design.kind)&&
    ['faceShape','hairStyle','wardrobe','accessory','build','costume'].includes(property);
}

const featureIdentity = {
  feature: z.string().min(2).optional(),
  featureIndex: z.number().int().min(0).optional()
};

const FeatureSchema = z.union([
  z.object({
    ...featureIdentity,
    nodeIds: z.array(id).min(1),
    nativeProperties: z.array(nativeProperty).default([])
  }).strict(),

  z.object({
    ...featureIdentity,
    nodeIds: z.array(id).default([]),
    nativeProperties: z.array(nativeProperty).min(1)
  }).strict()
]);

const AssetSchema = z.object({
  visualSpec: VisualSpecSchema,
  features: z.array(FeatureSchema).min(1)
}).strict();

AssetSchema.normalizeGeneratedValue = normalizeGeneratedArt;

const DirectedSceneSchema = SceneSchema
  .omit({ motionIR: true })
  .extend({
    beats: z.array(
      BeatSchema.omit({ motionTrackId: true })
    ).min(1).max(100)
  });

export const DynamicSceneSchema = z.object({
  scene: DirectedSceneSchema,
  coverage: z.array(
    z.object({
      storyEvent: z.string().optional(),
      eventIndex: z.number().int().min(0).optional(),
      beatIndices: z.array(
        z.number().int().min(0).max(99)
      ).min(1)
    }).strict()
  ).min(1),
  partTracks: z.array(
    z.object({
      entityId: id,
      nodeId: id,
      animation: PartAnimationSchema
    }).strict()
  ).max(150)
}).strict();

export function sceneSchemaFor(outline) {
  const actorId = z.enum(outline.characters.map(c => c.id));
  const kinds = availableActions(ACTIONS,outline.propDesigns);

  const propId = outline.propDesigns.length
    ? z.enum(outline.propDesigns.map(p => p.id))
    : z.never();

  const element = s => s.element || element(s.unwrap());
  const cue = element(SceneSchema.shape.sounds);

  const sound = z.union([
    cue.extend({
      role: z.literal("effect").default("effect"),
      actorId: z.never().optional()
    }),
    cue.extend({
      role: z.literal("nonverbal"),
      actorId
    })
  ]);

  const scene = DirectedSceneSchema.extend({
    cast: z.array(
      element(SceneSchema.shape.cast).extend({
        characterId: actorId,
        initialPose: element(SceneSchema.shape.cast)
          .shape.initialPose.unwrap()
          .omit({ position: true }).optional()
      })
    ).min(1).max(6),

    props: z.array(
      element(SceneSchema.shape.props).extend({
        designId: propId
      })
    ).max(40).default([]),

    beats: z.array(
      BeatSchema.omit({ motionTrackId: true }).extend({
        kind: z.enum(kinds),
        actorId,
        targetActorId: actorId.optional(),
        targetId: propId.optional()
      })
    ).min(1).max(100),

    sounds: z.array(sound).max(50).default([]),

    motions: z.array(
      element(SceneSchema.shape.motions).extend({
        targetId: propId
      })
    ).max(100).default([])
  });

  const schema = DynamicSceneSchema.extend({ scene:scene.superRefine((value,ctx)=>{
    for(const [index,beat] of value.beats.entries()){
      if(beat.kind!=='perform'&&(beat.keyframes?.length||beat.constraints?.length))ctx.addIssue({code:'custom',path:['beats',index,'kind'],message:`Native ${beat.kind} does not execute performance keys/constraints. Keep the native action with its real parameters; put any additional pose acting in a separate perform beat.`});
      if(['walk','run','slip','throw','place'].includes(beat.kind)&&!beat.to)ctx.addIssue({code:'custom',path:['beats',index,'to'],message:`${beat.kind} needs an explicit world destination to:[x,y]; local foot/hand keys do not move a native actor or object.`});
    }
  }) });
  schema.normalizeGeneratedValue = normalizeDirectedScene;

  return schema;
}

/** Fill an omitted prop reference only when the directed scene identifies one. */
export function linkMissingTargets(scene, designs = [], summary = '') {
  const required = new Set(['drink','throw','pawPress','reach','hold','struggle','tap','open','pick','place','swat','pullPaper','wrap','tearFree','openDoor']);
  const names = new Map(designs.map(d => [d.id, d.name.toLowerCase()]));
  for (const beat of scene.beats || []) {
    if (!required.has(beat.kind) || beat.targetId) continue;
    const props = (scene.props || []).filter(p => p.designId &&
      (p.appearAt === undefined || p.appearAt <= beat.start));
    if (props.length === 1) { beat.targetId = props[0].designId; continue; }
    const intent = (beat.intent || '').toLowerCase();
    const words = intent.match(/[a-z0-9]+/g) || [];
    const candidates = props.filter(p => {
      const idWords = p.designId.toLowerCase().match(/[a-z0-9]+/g) || [];
      const nameWords = (names.get(p.designId) || '').match(/[a-z0-9]+/g) || [];
      return [...new Set([...idWords, ...nameWords])].some(w => w.length > 3 && words.includes(w));
    });
    if (candidates.length === 1) { beat.targetId = candidates[0].designId; continue; }
    const following = (scene.beats || []).filter(other =>
      other !== beat && other.actorId === beat.actorId && other.targetId &&
      Math.abs(other.start - beat.start) <= 2 &&
      ['reach','pick','place','hold'].includes(other.kind));
    if (following.length && following.every(other => other.targetId === following[0].targetId) &&
        props.some(p => p.designId === following[0].targetId)) {
      beat.targetId = following[0].targetId; continue;
    }
    const directional = /\b(first|front|ahead)\b/.test(intent) ? /\b(first|front|ahead)\b/
      : /\b(second|back|behind)\b/.test(intent) ? /\b(second|back|behind)\b/ : null;
    if (directional) {
      const match = props.filter(p => directional.test(`${p.designId} ${names.get(p.designId) || ''}`.toLowerCase()));
      if (match.length === 1) { beat.targetId = match[0].designId; continue; }
    }
    // A scene summary can disambiguate an omitted pronoun in the beat.
    if (!directional && /\b(first|front)\b/i.test(summary) &&
        /\b(second|back|behind)\b/i.test(summary) &&
        !/\b(second|back|behind)\b/.test(intent)) {
      const front = props.filter(p => /\b(first|front)\b/i.test(`${p.designId} ${names.get(p.designId) || ''}`));
      if (front.length === 1) { beat.targetId = front[0].designId; continue; }
    }
    const actor = (scene.cast || []).find(c => c.characterId === beat.actorId);
    if (!actor || props.length < 2) continue;
    const ranked = props.map(p => ({p, distance:Math.hypot(p.x-actor.x,p.y-actor.y)})).sort((a,b)=>a.distance-b.distance);
    if (ranked[1].distance-ranked[0].distance > 80) beat.targetId = ranked[0].p.designId;
  }
  return scene;
}

export function assertEventMechanics(scene, events = []) {
  for (const event of events) {
    const words = event.storyEvent || '';
    if (/\bpick(?:s|ed|ing)?\s+(?:it\s+)?up\b|\bpick(?:s|ed|ing)?\s+(?:the|a|an)\b/i.test(words) &&
        !scene.beats.some(b => b.kind === 'pick'))
      throw Error(`Story event needs a real pick beat, not reach alone: ${words}`);
    if (/\b(?:lands?|falls?|drops?)\s+(?:on|onto)\s+(?:his|her|their|the|a|an|\w+'s)\s+head\b/i.test(words) &&
        !scene.props.some(p => p.attachmentEvents?.some(e =>
          e.at > 0 && e.attachment?.bone === 'head')))
      throw Error(`Story event needs a timed prop landing on the head: ${words}`);
  }
}

const AuditSchema = z.object({
  passed: z.boolean(),
  summary: z.string().min(10).max(1500),
  issues: z.array(z.string().min(5)).max(40)
}).strict();

export const dynamicGuide = () => readFile(
  new URL('../prompts/dynamic-director.md', import.meta.url),
  'utf8'
);

const nodeLists = spec => [
  'geometryRecipe',
  'facialComponents',
  'apparel',
  'accessories',
  'decorativeMarks'
].flatMap(k => spec?.[k] || []);

function findNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children || [], id);
    if (found) return found;
  }
  return null;
}

// Reject contradictory outlines before paying for asset and scene stages.
export function assertOutlineDesignRequirements(outline){
  for(const requirement of outline.requirements||[]){
    const prop=outline.propDesigns.find(p=>p.id===requirement.propId);
    const actor=outline.characters.find(c=>c.id===requirement.characterId);
    const actual=prop||actor;
    if(requirement.color){
      const field=prop?'color':'outfit';
      if(!actual||actual[field]?.toLowerCase()!==requirement.color.toLowerCase())throw Error(`Outline requirement ${JSON.stringify(requirement.description)} contradicts ${actual?.id||'missing entity'}.${field}: expected ${requirement.color}, found ${actual?.[field]}. Character requirement color means outfit color, never background or skin. Make the outline internally consistent while preserving the request.`);
    }
    if(requirement.label&&(prop?.label||actor?.shirtLabel)!==requirement.label)throw Error('Outline physical label contradicts its design: '+requirement.description);
  }
}

export function assertNativeOverlayGeometry(character,visualSpec=character.visualSpec){
  if(!visualSpec||visualSpec.renderMode==='replace')return;
  const nativePart=/^(?:stickbody|spine(?:line)?|head(?:circle|outline|shape)?|(?:left|right)(?:eye|arm|leg|hand|foot)|eyes|eyebrows|browline|mouth)$/i;
  const walk=nodes=>{for(const node of nodes||[]){
    if(nativePart.test((node.id||'').replace(/[_-]/g,'')))throw Error(`Native overlay for ${character.name||character.id} duplicates base anatomy at ${node.id}. The native rig already draws body, head, eyes and mouth. Use nativeProperties for those features and leave geometryRecipe empty, or draw only genuine clothing/accessories. A completely custom rig must use renderMode replace.`);
    walk(node.children);
  }};
  walk(visualSpec.geometryRecipe);
}

export function applyPartTracks(plan, sceneId, tracks) {
  const copy = structuredClone(plan), seen = new Set();

  for (const track of tracks) {
    const key = track.entityId + '/' + track.nodeId;

    if (seen.has(key)) {
      throw Error(`Duplicate part track ${key}`);
    }

    seen.add(key);

    const design = [...copy.characters, ...copy.propDesigns]
      .find(x => x.id === track.entityId);

    const node = findNode(nodeLists(design?.visualSpec), track.nodeId);

    if (!node) {
      const available = [];

      const walk = ns => {
        for (const n of ns) {
          if (n.id) available.push(n.id);
          walk(n.children || []);
        }
      };

      walk(nodeLists(design?.visualSpec));

      throw Error(
        `Missing animated part ${key}. Valid IDs on this entity: ${available.join(', ')}`
      );
    }

    // A named leaf can become an articulated part
    // without changing its artwork.
    if (node.kind !== 'group') {
      const shape = { ...node };
      delete shape.id;

      for (const k of Object.keys(node)) {
        delete node[k];
      }

      Object.assign(node, {
        id: track.nodeId,
        kind: 'group',
        children: [shape]
      });
    }

    if (
      track.animation.sceneId &&
      track.animation.sceneId !== sceneId
    ) {
      throw Error('Part track references a different scene');
    }

    const scene = copy.scenes.find(s => s.id === sceneId);
    for(const behavior of design.objectBehaviors||[]){
      if(behavior.partId!==track.nodeId||!behavior.rotationLimits)continue;
      if(track.animation.keys.some(k=>k.rotation!==undefined&&(k.rotation<behavior.rotationLimits[0]||k.rotation>behavior.rotationLimits[1])))
        throw Error(`Part ${track.nodeId} exceeds its declared rotation limits`);
    }

    if (track.animation.keys.at(-1).at > scene.duration) {
      throw Error(`Part track exceeds scene ${sceneId}`);
    }

    node.animation = [
      ...(node.animation || []).filter(x => x.sceneId !== sceneId),
      { ...track.animation, sceneId }
    ];
  }

  return copy;
}

export function linkDynamicHook(input) {
  const plan = structuredClone(input);

  for (const scene of plan.scenes) {
    normalizeCastRoots(scene);
  }

  const h = plan.hook, scene = plan.scenes[0];

  if (!h || !scene || scene.id !== h.sceneId) {
    return plan;
  }

  const placed = new Set([
    ...scene.cast.map(c => c.characterId),
    ...scene.props.map(p => p.designId)
  ]);
  
  const refs = [];

  const walk = (nodes, entityId) => {
    for (const n of nodes || []) {
      if (
        n.id &&
        n.animation?.some(
          t => (!t.sceneId || t.sceneId === scene.id) && t.keys[0].at < h.end
        )
      ) {
        refs.push({ entityId, nodeId: n.id });
      }

      walk(n.children, entityId);
    }
  };

  for (const d of [...plan.characters, ...plan.propDesigns]) {
    if (placed.has(d.id)) {
      walk(nodeLists(d.visualSpec), d.id);
    }
  }

  h.partRefs = refs.slice(0, 20);

  return plan;
}

async function retry(label, operation, signal, progress) {
  let feedback = '', userReason = '',lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();

    try {
      return await operation(feedback);
    } catch (error) {
      lastError=error;
      if (
        signal?.aborted ||
        /Provider HTTP|API key is required|truncated|PROHIBITED_CONTENT|SAFETY|RECITATION/.test(error.message)
      ) {
        throw error;
      }

      userReason = error.issues?.length
        ? 'Invalid animation fields: ' +
        error.issues.slice(0, 4)
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')
        : error.message.slice(0, 500);

      feedback = error.message +
        (
          error.generatedValue
            ? ' Previous invalid JSON: ' +
            JSON.stringify(error.generatedValue).slice(0, 24000)
            : ''
        );

      progress(
        `${label}: repairing animation data (${attempt + 1}/3): ${userReason.slice(0, 300)}`,
        25
      );
    }
  }

  const exhausted=Error(
    `${label} could not be completed: ${userReason}. Completed stages are saved; retry to resume.`
  );
  exhausted.generatedValue=lastError?.generatedValue;
  exhausted.validationIssues=lastError?.issues;
  throw exhausted;
}

export async function planDynamicStory(
  options,
  credentials,
  signal,
  progress = () => { },
  fetcher = fetch
) {
  if (options.productionMode === 'dialogue-toon') {
    throw Error(
      'Dynamic mode uses Gemini + Freesound only. Choose silent SFX, or the legacy dialogue planner.'
    );
  }

  assertAdultComedyRequest(options);

  // Repair messages should never make the visible progress bar jump backwards.
  const sendProgress=progress;
  let highestProgress=0;
  progress=(message,percent)=>{
    if(Number.isFinite(percent))highestProgress=Math.max(highestProgress,percent);
    sendProgress(message,highestProgress);
  };

  const guide = (await dynamicGuide()) +
    "\n" +
    referenceStyleInstructions(options.referenceStyle) +
    "\nNATIVE MOVEMENT CONTRACT: EVERY walk and run beat MUST specify to:[worldX,worldY], the actor ROOT destination, with floor y matching its cast placement (usually 780). A walk/run without to cannot travel. If the scene says chase, flee or move toward an object, derive a specific world x from the scene's cast and props positions. Do not substitute foot, hand, hip or pose keyframes for this root destination. Also specify to for slip, throw and place; retain each action kind.\n" +
    `\nACTUAL beat.kind values: ${ACTIONS.join(", ")}. Never use watch, smile, surprised, spin, startFan as kind. Opening a mouth is a pose mouthAperture, never the jar-only open action. A fan starts through a blade rotation partTrack, not open/hold/tap. Watching/smiling use react with emotion/pose, custom with pose, or perform with real normalized pose keys. Machinery movements belong in partTracks and are paired with a timed actor reaction/performance beat.`;

  let category = options.category === 'auto'
    ? 'family-comedy'
    : options.category || 'family-comedy';

  const checkpoint = checkpointRunner({
    enabled: fetcher === fetch,
    signal,
    progress
  });

  const stagedRetry = (label, input, operation) =>
    checkpoint(
      label,
      { guide, compilerVersion:2,model:credentials.geminiModel||process.env.GEMINI_MODEL||'gemini-3.5-flash-lite', input },
      () => retry(label, operation, signal, progress)
    );

  progress('Gemini: story, identities and visual requirements', 5);

  // =====================================================
  // STORY OUTLINE GENERATION
  // =====================================================

  let outline = await stagedRetry(
    'Story outline',
    { options, contract: 5 },
    async feedback => {
      const value = await geminiJSON(
        `${guide}\n${comedyCategoryInstructions(options)}\n${durationInstruction(options)}\n${originalStoryBrief(options)}\nWrite the COMPLETE story and scene outline for ${options.story?.trim() || 'an original short visual comedy'}. Keep every explicit requested entity/action. Language ${options.language || 'hi'}, format ${options.format || 'shorts'}. Set all novel props to drawing. Character kind selects a base rig only; the next pass designs custom art. Supply requiredAppearanceFeatures for characters and visualAssetRequest.description/requiredFeatures for props. Required features must be the user-requested details plus the minimal silhouette/structural cues needed for recognizable cartoon identity and usable moving parts. Do not invent microscopic textures, photorealism or extra mechanisms as mandatory requirements. Simple sets should use background custom with sparse backgroundNodes unless a location was requested; do not add extra furniture solely as decoration. Omit visualSpec and geometry now. Never emit rigRequirement, visualEvidence, contactEventIds, optionalSourceAsset or assetCapabilities; the compiler owns those execution records. Requirements describe events, identity, color and wear only. Do not preassign native action codes; choreography chooses those after the asset parts exist. Every character has an explicit ageYears. Fill coverage and blockedReasons honestly. Do not fabricate successful execution. Previous validation: ${feedback}`,
        DraftOutlineSchema,
        credentials,
        signal,
        fetcher
      );

      // =================================================
      // FIX: NORMALIZE AUTOMATIC STORY DURATION
      // =================================================

      normalizeAutoOutlineDuration(value, options);

      // Validate the normalized duration.
      assertOutlineDuration(value, options);
      assertOutlineDesignRequirements(value);

      if (value.blockedReasons.length) {
        throw Error(value.blockedReasons.join('; '));
      }

      return value;
    }
  );

  if (options.category === 'auto') {
    category = outline.category || 'family-comedy';
  }

  assertAdultComedyRequest({
    ...options,
    category,
    adultOptIn: options.adultOptIn === true || options.category === 'auto'
  });

  outline = {
    ...outline,
    referenceStyle: options.referenceStyle,
    category,
    comedySettings: normalizeComedySettings(
      category,
      options.category === 'auto'
        ? outline.comedySettings
        : options.comedySettings
    ),
    adultModeAcknowledged:
      options.adultOptIn === true ||
      (options.category === 'auto' && category === 'adult-comedy'),
    productionMode: 'silent-sfx',
    planningMode: 'dynamic',
    sourceIdea: options.story || outline.story
  };

  outline.characters = outline.characters.map(c => ({
    ...c,
    rigVersion: 2,
    shoulderWidth: c.shoulderWidth ?? (
      ["woman", "grandma"].includes(c.kind) ? 28 : 32
    ),
    artStyle: options.artStyle || c.artStyle || "pencil",
    wardrobe: c.wardrobe ?? (
      (options.artStyle || c.artStyle) === "toon"
        ? "shirt"
        : "default"
    )
  }));

  // One asset per call keeps detailed geometry
  // out of a giant truncated response.

  const designs = [
    ...outline.characters,
    ...outline.propDesigns
  ];

  for (const [index, design] of designs.entries()) {
    progress(
      `Designing ${design.name}: geometry, joints and distinguishing features`,
      10 + Math.round(
        index / Math.max(1, designs.length) * 20
      )
    );

    const requested =
      design.requiredAppearanceFeatures ||
      design.visualAssetRequest?.requiredFeatures ||
      [];

    let rejectedAsset,reusableAttempted=false;
    const drawingBrief=fetcher===fetch && outline.propDesigns.some(p=>p.id===design.id)
      ? await stagedRetry(`Drawing construction ${design.name}`,{design,version:2},()=>planObjectDrawing(design,credentials,signal,fetcher)) : undefined;
    const construction=propConstruction(drawingBrief?.referenceAssetId||design.type);
    const result = await stagedRetry(
      `Design ${design.name}`,
      {
        design,
        story: outline.story,
        scenes: outline.scenes
        ,recognitionVersion: 5,drawingBrief
      },
      async feedback => {
        if(drawingBrief)feedback=`DRAWING CONSTRUCTION: ${JSON.stringify(drawingBrief)}. Build coherent connected contours following these proportions. ${rejectedAsset?'Attached image is a REJECTED drawing to correct.':construction?'Attached image is an original construction example for this object state; adapt it to the requested design.':''} ${feedback}`;
        const images=rejectedAsset || construction ? [{inlineData:{mimeType:'image/png',data:assetPreview(rejectedAsset?.visualSpec || construction).toString('base64')}}] : [];
        let asset;
        if(construction&&!rejectedAsset&&!reusableAttempted){
          reusableAttempted=true;
          progress(`Checking reusable construction for ${design.name}`,24);
          const links=await geminiJSON(`Map required features to this existing reusable drawing. Do not redraw it and do not invent node IDs. Native properties are unavailable for this drawing. Every requested feature index needs actual visible nodeIds; if a detail is absent, do not pretend a different part supplies it. The independent recognition check will reject missing details. Intended object: ${JSON.stringify(design)}. Requested features: ${JSON.stringify(requested.map((feature,featureIndex)=>({featureIndex,feature})))}. Drawing geometry: ${JSON.stringify(construction)}. Return features only.`,z.object({features:z.array(FeatureSchema).min(1)}).strict(),credentials,signal,fetcher);
          asset={visualSpec:structuredClone(construction),features:links.features,reusedConstructionId:drawingBrief?.referenceAssetId||design.type};
        }else asset = drawingBrief ? await generateObjectBlueprint({design,brief:drawingBrief,requested,feedback,images,credentials,signal,fetcher}) : await geminiJSON(
          `${guide}\nDesign ONE asset: ${JSON.stringify(design)}. Story: ${outline.story}. Scenes: ${JSON.stringify(outline.scenes)}. Draw identifiable geometry, with named group parts for ALL required movements. Characters may overlay native rigs or replace with complete art. All drawing props need complete geometry. Use renderMode replace for a redesigned native prop. Do not add animation yet; choreography is next. Required features indexed from zero: ${JSON.stringify(requested.map((feature, featureIndex) => ({ featureIndex, feature })))}. In features use featureIndex to map EVERY required feature to actual nodeIds. With renderMode overlay you may instead use nativeProperties for features already rendered by the existing character: kind, hairStyle, hair, skin, outfit, faceShape, wardrobe, accessory, build, headWidth, headHeight, costume. ageYears supplies visible senior wrinkles only for human age65+. Never invent nodeIds such as nativeBody or nativeFace; native geometry is referenced through nativeProperties, while nodeIds must exist in your actual visualSpec. For a small child, specify kind child and stage a genuinely smaller body in choreography; do not draw duplicate faces or duplicate limbs. Omit globalTransform/localTransform and assetSource entirely. Previous validation: ${feedback}`,
          AssetSchema,
          credentials,
          signal,
          fetcher,
          images
        );

        try {
          // Asset design is scene-independent. Scene-specific movement is
          // supplied later through partTracks; generated draft tracks here
          // can reference a scene that has not been directed yet.
          const clearDraftAnimations = nodes => {
            for (const node of nodes || []) {
              delete node.animation;
              clearDraftAnimations(node.children);
            }
          };
          clearDraftAnimations(nodeLists(asset.visualSpec));
          if(outline.characters.some(c=>c.id===design.id))assertNativeOverlayGeometry(design,asset.visualSpec);
          for (const feature of asset.features) {
            for (const nodeId of feature.nodeIds) {
              if (!findNode(nodeLists(asset.visualSpec), nodeId)) {
                throw Error(
                  `Feature ${feature.feature} references missing geometry ${nodeId}`
                );
              }
            }
          }

          for (const feature of asset.features) {
            if (
              !feature.nodeIds.length &&
              !feature.nativeProperties.length
            ) {
              throw Error(
                `Feature ${feature.featureIndex ?? feature.feature} needs nonempty nodeIds or nativeProperties`
              );
            }

            for (const property of feature.nativeProperties) {
              if (
                asset.visualSpec.renderMode === 'replace' ||
                !nativePropertyAvailable(design,property)
              ) {
                throw Error(
                  'Native property is unavailable: ' + property
                );
              }
            }
          }

          for (const [featureIndex, feature] of requested.entries()) {
            if (
              !asset.features.some(
                f => f.featureIndex === featureIndex || f.feature === feature
              )
            ) {
              throw Error(
                `Missing featureIndex ${featureIndex}: ${feature}`
              );
            }
          }

          if (fetcher === fetch && outline.propDesigns.some(p=>p.id===design.id)) {
            progress(`Checking recognizable drawing: ${design.name}`,25);
            const reviewDesign={...design,visualAssetRequest:{...design.visualAssetRequest,requiredFeatures:[...requested,...(drawingBrief?.recognitionCues || [])]}};
            const recognition=await reviewPropRecognition(reviewDesign,asset,credentials,signal,fetcher);
            if(!recognition.recognizable || recognition.missingDetails.length) {
              rejectedAsset=asset;
              throw Error(`Object drawing is unclear: ${recognition.missingDetails.join('; ')}. Redraw geometry: ${recognition.repair}`);
            }
          }
          return asset;
        } catch (error) {
          error.generatedValue = asset;
          throw error;
        }
      }
    );

    design.visualSpec = result.visualSpec;
    if(result.behaviors)design.objectBehaviors=result.behaviors;
    if(drawingBrief){
      const grip=result.visualSpec.motionAnchors.find(anchor=>anchor.id==='grip');
      if(grip)design.gripOffset=[...grip.position];
    }
  }

  let plan = {
    ...outline,
    version: 1,
    format: options.format || 'shorts',
    language: options.language || 'hi',
    renderFps: options.renderFps || 60,
    scenes: []
  };

  // =====================================================
  // DIRECT EACH SCENE
  // =====================================================

  for (const [index, summary] of outline.scenes.entries()) {
    progress(
      `Directing scene ${index + 1}/${outline.scenes.length}: body, parts, expressions and SFX`,
      35 + Math.round(
        index / outline.scenes.length * 30
      )
    );

    const requiredEvents = plan.coverage.filter(
      c => c.sceneId === summary.id
    );

    const previous=plan.scenes.length?continuityReceipt(plan.scenes.at(-1),plan.propDesigns):undefined;
    const sourceIdea=outline.scenes.length===1?plan.sourceIdea:undefined;
    const performance=(fetcher===fetch||options.performancePlanning===true) ? await stagedRetry(
      `Performance ${summary.id}`,{summary,requiredEvents,characters:plan.characters,props:plan.propDesigns,previous,sourceIdea,version:7},
      feedback=>directPerformance({summary,events:requiredEvents,characters:plan.characters,props:plan.propDesigns,previous,sourceIdea,feedback,credentials,signal,fetcher})
    ) : undefined;

    plan = await stagedRetry(
      `Scene ${summary.id}`,
      { plan, summary, performance,previous,contract: 7 },
      async feedback => {
        if(performance)feedback=`Execute this validated PERFORMANCE DIRECTION exactly: ${JSON.stringify(performance)}. Actual previous end state: ${JSON.stringify(previous)}. Preserve native event clock, rig limits, object ownership and camera intentions. ${feedback}`;
        const directed = await geminiJSON(
          `${guide}\n${comedyCategoryInstructions(options)}\nDirect exactly scene ${JSON.stringify(summary)}. Allowed actorId/characterId values: ${outline.characters.map(c => c.id).join(", ")}. Allowed designId/targetId values: ${outline.propDesigns.map(c => c.id).join(", ")}. Never use cast placement IDs as actorId. Preserve id and duration. Whole story and all reusable designs: ${JSON.stringify({ ...outline, scenes: outline.scenes })}. Already directed scenes (preserve continuity): ${JSON.stringify(plan.scenes)}. Required events indexed from zero: ${JSON.stringify(requiredEvents.map((c, eventIndex) => ({ eventIndex, storyEvent: c.storyEvent })))}. Return scene, partTracks and coverage linking EVERY listed eventIndex to real beatIndices. Use eventIndex to identify the event; do not paraphrase identifiers. Include all visible motion, reactions, camera and precise Freesound cues. A sound with actorId MUST have role nonverbal (gasp/laugh/grunt). Mechanical and footstep effects have role effect and MUST omit actorId. For event coverage place a real timed actor beat (perform/custom/native) corresponding to each event; machine movement must also have real partTracks. If an event says pick up, include kind pick with the correct targetId; reach alone does not attach. If a prop lands on a head, give that prop a timed attachmentEvent with bone head after the fall and show its free approach first. For slip/throw include to:[worldX,worldY]. For other prop actions always include a placed targetId. Use explicit sound start unless the referenced beat has a real contact event. Omit cast/prop/beat/sound placement id fields: the canonical compiler assigns execution IDs. Put all human performance keyframes directly on perform beats. Do not emit motionIR or motionTrackId; the engine compiles those later. Dialogue empty. Previous error: ${feedback}`,
          sceneSchemaFor(outline),
          credentials,
          signal,
          fetcher
        );

        try {
          linkMissingTargets(directed.scene, outline.propDesigns, summary.summary);
          if (
            directed.scene.id !== summary.id ||
            Math.abs(
              directed.scene.duration - summary.duration
            ) > .001
          ) {
            throw Error('Scene identity or duration changed');
          }

          if (directed.scene.dialogue.length) {
            throw Error(
              'Two-key mode must not generate dialogue'
            );
          }
          
          directed.scene=normalizeDirectedScene({scene:directed.scene}).scene;
          assertEventMechanics(directed.scene, requiredEvents);
          if(performance){
            const links=requiredEvents.map((event,eventIndex)=>directed.coverage.find(c=>c.eventIndex===eventIndex||c.storyEvent===event.storyEvent));
            const problems=auditDirectedPerformance(directed.scene,performance,links,plan.propDesigns,previous);
            if(problems.length)throw Error('Targeted performance repairs: '+JSON.stringify(problems));
            directed.scene=compileDirectedPerformance(directed.scene,performance,plan.characters,plan.propDesigns,{format:plan.format});
          }
          const candidate = applyPartTracks(
            {
              ...plan,
              scenes: [
                ...plan.scenes,
                compileScene(directed.scene)
              ]
            },
            summary.id,
            directed.partTracks
          );

          for (
            const entry of candidate.coverage.filter(
              c => c.sceneId === summary.id
            )
          ) {
            const eventIndex = requiredEvents.findIndex(
              c => c.storyEvent === entry.storyEvent
            );

            const linked = directed.coverage.find(
              c =>
                c.eventIndex === eventIndex ||
                c.storyEvent === entry.storyEvent
            );

            if (!linked) {
              throw Error(
                'Missing event coverage: ' + entry.storyEvent
              );
            }

            entry.beatIndices = linked.beatIndices;
          }

          if (candidate.hook?.sceneId === summary.id) {
            candidate.hook.beatIndices = directed.scene.beats
              .map((b, i) => ({ b, i }))
              .filter(
                ({ b }) =>
                  b.start < candidate.hook.end &&
                  b.start + b.duration > candidate.hook.start
              )
              .map(({ i }) => i);
          }

          // Validate completed scene in isolation
          // while retaining the design registry.

          const scopes = new Set(
            candidate.scenes.map(s => s.id)
          );

          validatePlan({
            ...candidate,
            coverage: candidate.coverage.filter(
              c => scopes.has(c.sceneId)
            ),
            requirements: candidate.requirements?.filter(
              c => scopes.has(c.sceneId)
            ),
            hook:
              candidate.hook &&
                scopes.has(candidate.hook.sceneId)
                ? candidate.hook
                : undefined
          });

          return candidate;
        } catch (error) {
          error.generatedValue = directed;
          throw error;
        }
      }
    );
    if(performance){
      const index=plan.scenes.findIndex(s=>s.id===summary.id);
      plan.scenes[index]=compileDirectedPerformance(plan.scenes[index],performance,plan.characters,plan.propDesigns,{format:plan.format});
      const saved=plan.directionScore?JSON.parse(plan.directionScore):{version:1,scenes:[]};
      saved.scenes=saved.scenes.filter(row=>row.direction.sceneId!==summary.id);
      saved.scenes.push({direction:performance,previous});plan.directionScore=JSON.stringify(saved);
    }
  }

  return reviewDynamicPlan(
    plan,
    credentials,
    signal,
    progress,
    fetcher
  );
}


// ======================================================
// FINAL STORY REVIEW
// ======================================================

export async function reviewDynamicPlan(
  input,
  credentials,
  signal,
  progress = () => { },
  fetcher = fetch,
  videoReport = null
) {
  let plan = validatePlan(
    fitDynamicCameras(
      compileStylePerformance(
        linkDynamicHook(input)
      )
    )
  );

  delete plan.review;

  const guide = await dynamicGuide();

  let issues = videoReport
    ? [JSON.stringify(videoReport)]
    : [];

  for (let attempt = 0; attempt < 3; attempt++) {
    if (issues.length) {
      progress(
        'Repairing dynamic design and choreography',
        70
      );

      const repaired = await retry(
        'Dynamic repair',
        async feedback => {
          const repairSchema = PlanSchema.extend({
            scenes: z.array(
              sceneSchemaFor(plan).shape.scene
            ).min(1).max(80),

            coverage: z.array(
              z.object({
                eventIndex: z.number()
                  .int()
                  .min(0)
                  .max(plan.coverage.length - 1),

                beatIndices: z.array(
                  z.number().int().min(0).max(99)
                ).min(1)
              }).strict()
            ).min(plan.coverage.length)
              .max(plan.coverage.length)
          });

          repairSchema.normalizeGeneratedValue = value => ({
            ...value,
            scenes: value.scenes?.map(
              scene => normalizeDirectedScene({ scene }).scene
            )
          });

          const candidate = await geminiJSON(
            `${guide}\nPrevious repair validation: ${feedback}. Repair this complete plan from concrete problems: ${JSON.stringify(issues)}. Preserve referenceStyle, sourceIdea, story entities, every required event, category/adult acknowledgement and total duration. Fix geometry and group tracks as well as scene actions. Do not simplify the original user's requested story. Required event indices: ${JSON.stringify(plan.coverage.map((event, eventIndex) => ({ eventIndex, ...event })))}. Return coverage with exactly one entry per eventIndex and its corrected beatIndices; the engine restores the original event wording and scene. Return the complete corrected plan. PLAN: ${JSON.stringify(plan)}`,
            repairSchema,
            credentials,
            signal,
            fetcher
          );

          const coverage = plan.coverage.map(
            (event, eventIndex) => {
              const links = candidate.coverage.filter(
                c => c.eventIndex === eventIndex
              );

              if (links.length !== 1) {
                throw Error(
                  'Repair must retain exactly one link for eventIndex ' +
                  eventIndex
                );
              }

              return {
                ...event,
                beatIndices: links[0].beatIndices
              };
            }
          );

          const cleaned = {
            ...candidate,
            coverage,

            ...Object.fromEntries(
              [
                'sourceIdea',
                'referenceStyle',
                'category',
                'comedySettings',
                'adultModeAcknowledged',
                'humorProfile',
                'productionMode',
                'planningMode',
                'requirements',
                'format',
                'language',
                'renderFps'
                ,'directionScore'
              ].map(k => [k, plan[k]])
            ),

            scenes: candidate.scenes.map(
              scene => normalizeDirectedScene({ scene }).scene
            )
          };

          for(const character of cleaned.characters)assertNativeOverlayGeometry(character);

          for(const scene of cleaned.scenes)
            assertEventMechanics(scene,cleaned.coverage.filter(e=>e.sceneId===scene.id));
          if(cleaned.directionScore){
            const score=JSON.parse(cleaned.directionScore);
            if(score.version===1&&Array.isArray(score.scenes))for(const row of score.scenes){
              const scene=cleaned.scenes.find(s=>s.id===row.direction.sceneId);
              if(!scene)throw Error('Repair dropped directed scene '+row.direction.sceneId);
              const problems=auditDirectedPerformance(scene,row.direction,cleaned.coverage.filter(e=>e.sceneId===scene.id),cleaned.propDesigns,row.previous);
              if(problems.length)throw Error('Targeted performance repairs: '+JSON.stringify(problems));
              cleaned.scenes[cleaned.scenes.indexOf(scene)]=compileDirectedPerformance(scene,row.direction,cleaned.characters,cleaned.propDesigns,{format:cleaned.format});
            }
          }
          const repaired = validatePlan(cleaned);

          if (
            repaired.sourceIdea !== plan.sourceIdea ||
            repaired.category !== plan.category ||
            repaired.referenceStyle !== plan.referenceStyle ||
            repaired.adultModeAcknowledged !== plan.adultModeAcknowledged ||
            Math.abs(
              repaired.scenes.reduce(
                (n, s) => n + s.duration, 0
              ) -
              plan.scenes.reduce(
                (n, s) => n + s.duration, 0
              )
            ) > .001
          ) {
            throw Error(
              'Dynamic repair changed the original request/category/duration'
            );
          }

          for (
            const field of [
              'characters',
              'propDesigns'
            ]
          ) {
            for (const original of plan[field]) {
              if (
                !repaired[field].some(
                  item =>
                    item.id === original.id &&
                    item.name === original.name
                )
              ) {
                throw Error(
                  'Repair removed or renamed required entity: ' +
                  original.name
                );
              }
            }
          }

          for (const event of plan.coverage) {
            if (
              !repaired.coverage.some(
                item => item.storyEvent === event.storyEvent
              )
            ) {
              throw Error(
                'Repair dropped required story event: ' +
                event.storyEvent
              );
            }
          }

          return repaired;
        },
        signal,
        progress
      );

      plan = validatePlan(
        fitDynamicCameras(
          compileStylePerformance(
            linkDynamicHook(repaired)
          )
        )
      );

      delete plan.review;
    }

    progress(
      'Independent dynamic story and executable-motion review',
      80
    );

    const audit = await geminiJSON(
      `${guide}\nIndependently compare ORIGINAL REQUEST ${JSON.stringify(plan.sourceIdea)} against this full plan. Check identities/recognizable geometry, every event, all part transforms, attachment continuity, faces, framing, exact SFX timing and scene continuity. A named feature or group without drawable geometry is not evidence. Only approve actions implemented by actual tracks/motions/poses. Non-graphic consenting adult comedy only. Report missing/counterfeit actions and mismatched designs. PLAN: ${JSON.stringify(plan)}`,
      AuditSchema,
      credentials,
      signal,
      fetcher
    );

    const geometry = inspectPlan(
      plan,
      { requireCoverage: true }
    );

    issues = [
      ...audit.issues,
      ...geometry.issues
        .filter(i => i.severity === 'error')
        .map(i => i.message)
    ];
    if(plan.directionScore){
      const score=JSON.parse(plan.directionScore);
      if(score.version===1&&Array.isArray(score.scenes))for(const row of score.scenes){
        const scene=plan.scenes.find(s=>s.id===row.direction.sceneId);
        if(scene)issues.push(...auditDirectedPerformance(scene,row.direction,plan.coverage.filter(e=>e.sceneId===scene.id),plan.propDesigns,row.previous).map(issue=>JSON.stringify(issue)));
      }
    }

    if (!audit.passed && !issues.length) {
      issues.push(audit.summary);
    }

    if (issues.length) {
      progress(
        'Dynamic review findings: ' +
        issues.join('; ').slice(0, 1200),
        81
      );
    }

    if (!issues.length) {
      plan.review = {
        method: 'gemini',
        planHash: planHash(plan),
        summary: audit.summary
      };

      return validatePlan(plan);
    }
  }

  throw Error(
    'Dynamic story has unresolved requirements: ' +
    issues.join('; ')
  );
}