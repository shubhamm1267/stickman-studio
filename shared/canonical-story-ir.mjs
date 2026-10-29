import { createHash } from "node:crypto";
import { validatePlan } from "./schema.mjs";
import { timeline } from "./timeline.mjs";
import {
  secondsAtFractionToFrame,
  secondsToFrame,
  secondsSumToFrame,
} from "./frame-clock.mjs";
import { contactFractions } from "./action-time.mjs";

export const STORY_IR_VERSION = 2;
export const LEGACY_STORY_IR_VERSION = 1;

const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex").slice(0, 14);
const makeId = (kind, key) => `ir_${kind}_${hash(key)}`;
const validId = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(value);
const ensureId = (value, kind, key) => {
  value.id ||= makeId(kind, key);
};

function assignNodeIds(nodes, owner) {
  for (const [index, node] of nodes.entries()) {
    const key = `${owner}/node/${index}`;
    ensureId(node, "element", key);
    if (node.children) assignNodeIds(node.children, key);
  }
}

function withStableIds(input) {
  const plan = structuredClone(validatePlan(input));
  plan.storyId ||= `story_${hash(`${plan.title}\n${plan.story}`)}`;
  for (const prop of plan.propDesigns) {
    assignNodeIds(prop.nodes, `prop/${prop.id}`);
  }
  for (const scene of plan.scenes) {
    assignNodeIds(scene.backgroundNodes, `environment/${scene.id}`);
    for (const [index, cast] of scene.cast.entries())
      ensureId(cast, "actor", `${scene.id}/cast/${cast.characterId}/${index}`);
    for (const [index, placement] of scene.props.entries()) {
      const key = `${scene.id}/prop/${placement.designId}/${index}`;
      ensureId(placement, "placement", key);
      if (placement.attachment)
        ensureId(placement.attachment, "attachment", `${key}/initial`);
      for (const [eventIndex, event] of (placement.attachmentEvents || []).entries()) {
        ensureId(event, "attachEvent", `${key}/event/${eventIndex}`);
        if (event.attachment)
          ensureId(event.attachment, "attachment", `${key}/event/${eventIndex}/value`);
      }
    }
    for (const [index, motion] of scene.motions.entries())
      ensureId(motion, "propMotion", `${scene.id}/motion/${index}/${motion.targetId}`);
    for (const [index, action] of scene.beats.entries())
      ensureId(action, "action", `${scene.id}/action/${index}/${action.kind}/${action.actorId}`);
    for (const [index, camera] of scene.shots.entries())
      ensureId(camera, "camera", `${scene.id}/camera/${index}`);
    for (const [index, cue] of scene.sounds.entries())
      ensureId(cue, "sound", `${scene.id}/sound/${index}`);
    for (const [index, line] of scene.dialogue.entries())
      ensureId(line, "dialogue", `${scene.id}/dialogue/${index}`);
  }
  return validatePlan(plan);
}

const environmentId = (sceneId) => makeId("environment", sceneId);
const transitionId = (from, to) => makeId("transition", `${from}->${to || "end"}`);
const anchorRefId = (propId, localId) => makeId("anchor", `${propId}/${localId}`);

function topLevelMetadata(plan) {
  const omitted = new Set([
    "storyId",
    "title",
    "story",
    "sourceIdea",
    "characters",
    "propDesigns",
    "scenes",
  ]);
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => !omitted.has(key)),
  );
}

/**
 * Lower the existing public Plan v1 contract into a single versioned IR.
 * Design intent and reusable designs are stored separately from per-scene
 * executable performance data. The payload fields are compatibility adapters
 * for the current evaluator, not independently authored copies.
 */
function planToStoryIRv1(input) {
  const plan = withStableIds(input);
  const environments = plan.scenes.map((scene) => ({
    id: environmentId(scene.id),
    sceneId: scene.id,
    kind: scene.background,
    elements: scene.backgroundNodes,
  }));
  const scenes = plan.scenes.map((scene, index) => {
    const nextScene = plan.scenes[index + 1]?.id || null;
    return {
      schemaVersion: LEGACY_STORY_IR_VERSION,
      id: scene.id,
      intent: { summary: scene.summary },
      environmentId: environmentId(scene.id),
      duration: scene.duration,
      performance: {
        schemaVersion: LEGACY_STORY_IR_VERSION,
        cast: scene.cast,
        propPlacements: scene.props,
        propMotions: scene.motions,
        actions: scene.beats,
        cameras: scene.shots,
        soundCues: scene.sounds.map((source) => {
          const { id, ...payload } = source;
          return {
            id,
            actionId:
              payload.beatIndex === undefined
                ? null
                : scene.beats[payload.beatIndex].id,
            payload,
          };
        }),
        dialogue: scene.dialogue,
        motionIR: scene.motionIR,
      },
      attachments: scene.props.flatMap((placement) => {
        const records = [];
        if (placement.attachment) {
          records.push({
            refId: placement.attachment.id,
            placementId: placement.id,
            at: placement.attachAt ?? 0,
            actorId: placement.attachment.actorId,
            bone: placement.attachment.bone,
            anchorRefId: placement.attachment.propAnchorId
              ? anchorRefId(placement.designId, placement.attachment.propAnchorId)
              : null,
            kind: "initial",
          });
        }
        for (const event of placement.attachmentEvents || []) {
          records.push({
            refId: event.id,
            placementId: placement.id,
            at: event.at,
            attachmentId: event.attachment?.id || null,
            actorId: event.attachment?.actorId || null,
            bone: event.attachment?.bone || null,
            anchorRefId:
              event.attachment?.propAnchorId
                ? anchorRefId(placement.designId, event.attachment.propAnchorId)
                : null,
            kind: event.attachment ? "attach" : "release",
          });
        }
        return records;
      }),
      transition: {
        id: transitionId(scene.id, nextScene),
        toSceneId: nextScene,
      },
    };
  });

  const ir = {
    schemaVersion: LEGACY_STORY_IR_VERSION,
    story: {
      id: plan.storyId,
      title: plan.title,
      text: plan.story,
      ...(plan.sourceIdea === undefined ? {} : { sourceIdea: plan.sourceIdea }),
    },
    design: {
      actors: plan.characters,
      props: plan.propDesigns,
      propAnchors: plan.propDesigns.flatMap((prop) =>
        (prop.interactionAnchors || []).map((anchor) => ({
          id: anchorRefId(prop.id, anchor.id),
          propId: prop.id,
          localId: anchor.id,
        })),
      ),
      environments,
    },
    metadata: topLevelMetadata(plan),
    scenes,
  };
  validateStoryIRv1(ir);
  return ir;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw Error(`${label} must be an array.`);
  return value;
}

/**
 * Check stable identity and graph edges before lowering to the legacy runtime
 * contract. Plan validation still checks all action semantics and numeric
 * bounds; this layer validates the cross-entity references and global IDs.
 */
function validateStoryIRv1(ir) {
  if (!ir || ir.schemaVersion !== LEGACY_STORY_IR_VERSION)
    throw Error(`Unsupported Story IR version: ${ir?.schemaVersion}.`);
  if (!ir.story || !validId(ir.story.id))
    throw Error("Story IR requires a stable story ID.");
  if (!ir.design || !ir.metadata)
    throw Error("Story IR design and metadata are required.");

  const ids = new Map();
  const register = (id, kind) => {
    if (!validId(id)) throw Error(`Invalid or missing stable ${kind} ID.`);
    if (ids.has(id)) throw Error(`Duplicate Story IR ID ${id} (${kind}, ${ids.get(id)}).`);
    ids.set(id, kind);
  };
  register(ir.story.id, "story");
  const actorIds = new Set();
  for (const actor of requireArray(ir.design.actors, "design.actors")) {
    register(actor.id, "actor design");
    actorIds.add(actor.id);
  }
  const propIds = new Set();
  for (const prop of requireArray(ir.design.props, "design.props")) {
    register(prop.id, "prop design");
    propIds.add(prop.id);
    const visit = (nodes) => {
      for (const node of nodes || []) {
        register(node.id, "prop geometry");
        visit(node.children);
      }
    };
    visit(prop.nodes);
  }
  const anchorsByProp = new Map();
  for (const anchor of requireArray(ir.design.propAnchors, "design.propAnchors")) {
    register(anchor.id, "prop anchor");
    if (!propIds.has(anchor.propId))
      throw Error(`Prop anchor references missing prop ${anchor.propId}.`);
    const local = anchorsByProp.get(anchor.propId) || new Set();
    if (local.has(anchor.localId)) throw Error(`Duplicate local prop anchor ${anchor.localId}.`);
    local.add(anchor.localId);
    anchorsByProp.set(anchor.propId, local);
  }
  const environmentIds = new Set();
  const environmentByScene = new Map();
  for (const environment of requireArray(ir.design.environments, "design.environments")) {
    register(environment.id, "environment");
    environmentIds.add(environment.id);
    environmentByScene.set(environment.sceneId, environment);
    const visit = (nodes) => {
      for (const node of nodes || []) {
        register(node.id, "environment element");
        visit(node.children);
      }
    };
    visit(environment.elements);
  }

  const scenes = requireArray(ir.scenes, "scenes");
  const sceneIds = new Set();
  for (const scene of scenes) {
    if(scene.schemaVersion!==LEGACY_STORY_IR_VERSION)
      throw Error(`Unsupported Scene IR version in scene ${scene.id}: ${scene.schemaVersion}.`);
    if(scene.performance?.schemaVersion!==LEGACY_STORY_IR_VERSION)
      throw Error(`Unsupported Performance IR version in scene ${scene.id}: ${scene.performance?.schemaVersion}.`);
    register(scene.id, "scene");
    sceneIds.add(scene.id);
  }
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (!scene.intent || typeof scene.intent.summary !== "string")
      throw Error(`Scene ${scene.id} requires separate design-time intent.`);
    if (!environmentIds.has(scene.environmentId))
      throw Error(`Scene ${scene.id} references missing environment ${scene.environmentId}.`);
    const environment = environmentByScene.get(scene.id);
    if (!environment || environment.id !== scene.environmentId)
      throw Error(`Environment ${scene.environmentId} is not owned by scene ${scene.id}.`);
    const p = scene.performance;
    if (!p) throw Error(`Scene ${scene.id} has no executable performance.`);
    const cast = requireArray(p.cast, `scene ${scene.id} cast`);
    const actorInstances = new Set();
    for (const instance of cast) {
      register(instance.id, "actor instance");
      actorInstances.add(instance.characterId);
      if (!actorIds.has(instance.characterId))
        throw Error(`Scene ${scene.id} cast references missing actor ${instance.characterId}.`);
    }
    const placements = requireArray(p.propPlacements, `scene ${scene.id} prop placements`);
    const placementIds = new Set();
    const placementById = new Map();
    for (const placement of placements) {
      register(placement.id, "prop placement");
      placementIds.add(placement.id);
      placementById.set(placement.id, placement);
      if (!propIds.has(placement.designId))
        throw Error(`Scene ${scene.id} placement references missing prop ${placement.designId}.`);
      const checkAttachment = (attachment) => {
        if (!attachment) return;
        register(attachment.id, "attachment");
        if (!actorInstances.has(attachment.actorId))
          throw Error(`Attachment references actor absent from scene ${scene.id}: ${attachment.actorId}.`);
        if (
          attachment.propAnchorId &&
          !anchorsByProp.get(placement.designId)?.has(attachment.propAnchorId)
        )
          throw Error(`Attachment references missing prop anchor ${attachment.propAnchorId}.`);
      };
      checkAttachment(placement.attachment);
      for (const event of placement.attachmentEvents || []) {
        register(event.id, "attachment event");
        checkAttachment(event.attachment);
      }
    }
    for (const motion of requireArray(p.propMotions, `scene ${scene.id} prop motions`)) {
      register(motion.id, "prop motion");
      if (!propIds.has(motion.targetId))
        throw Error(`Motion references missing prop ${motion.targetId}.`);
    }
    const actions = requireArray(p.actions, `scene ${scene.id} actions`);
    const actionIds = new Set();
    for (const action of actions) {
      register(action.id, "action");
      actionIds.add(action.id);
      if (!actorInstances.has(action.actorId))
        throw Error(`Action references actor absent from scene ${scene.id}: ${action.actorId}.`);
      if (action.targetActorId && !actorInstances.has(action.targetActorId))
        throw Error(`Action references actor absent from scene ${scene.id}: ${action.targetActorId}.`);
      if (action.targetId && !propIds.has(action.targetId))
        throw Error(`Action references missing prop ${action.targetId}.`);
    }
    for (const camera of requireArray(p.cameras, `scene ${scene.id} cameras`)) {
      register(camera.id, "camera");
      for (const actorId of camera.actorIds || [])
        if (!actorInstances.has(actorId))
          throw Error(`Camera references actor absent from scene ${scene.id}: ${actorId}.`);
    }
    for (const cue of requireArray(p.soundCues, `scene ${scene.id} sound cues`)) {
      register(cue.id, "sound cue");
      if (cue.actionId !== null && !actionIds.has(cue.actionId))
        throw Error(`Sound cue ${cue.id} references missing action ${cue.actionId}.`);
      if (cue.payload.beatIndex !== undefined &&
          (cue.actionId === null || p.actions[cue.payload.beatIndex]?.id !== cue.actionId))
        throw Error(`Sound cue ${cue.id} has a mismatched action reference.`);
      if (cue.payload.actorId && !actorInstances.has(cue.payload.actorId))
        throw Error(`Sound cue ${cue.id} references actor absent from scene ${scene.id}.`);
    }
    for (const line of requireArray(p.dialogue, `scene ${scene.id} dialogue`)) {
      register(line.id, "dialogue");
      if (!actorInstances.has(line.actorId))
        throw Error(`Dialogue references actor absent from scene ${scene.id}: ${line.actorId}.`);
    }
    for (const attachment of requireArray(scene.attachments, `scene ${scene.id} attachments`)) {
      if (!ids.has(attachment.refId))
        throw Error(`Attachment reference ${attachment.refId} is missing its stable entity.`);
      if (attachment.attachmentId && !ids.has(attachment.attachmentId))
        throw Error(`Attachment event references missing attachment ${attachment.attachmentId}.`);
      if (!placementIds.has(attachment.placementId))
        throw Error(`Attachment ${attachment.refId} references missing prop placement ${attachment.placementId}.`);
      const placement = placementById.get(attachment.placementId);
      if (attachment.actorId && !actorInstances.has(attachment.actorId))
        throw Error(`Attachment ${attachment.refId} references actor absent from scene ${scene.id}.`);
      if (attachment.anchorRefId) {
        const propAnchorIds = new Set(
          (ir.design.propAnchors || [])
            .filter((anchor) => anchor.propId === placement.designId)
            .map((anchor) => anchor.id),
        );
        if (!propAnchorIds.has(attachment.anchorRefId))
          throw Error(`Attachment ${attachment.refId} references missing canonical prop anchor.`);
      }
    }
    register(scene.transition?.id, "scene transition");
    const expectedNextScene=scenes[sceneIndex+1]?.id||null;
    if(scene.transition.toSceneId!==expectedNextScene)
      throw Error(`Transition from scene ${scene.id} must target ${expectedNextScene||"the end"}.`);
    if (
      scene.transition.toSceneId !== null &&
      !sceneIds.has(scene.transition.toSceneId)
    )
      throw Error(`Transition references missing scene ${scene.transition.toSceneId}.`);
  }
  const sceneById=new Map(scenes.map(scene=>[scene.id,scene]));
  for(const item of ir.metadata.coverage||[]){
    const scene=sceneById.get(item.sceneId);
    if(!scene)throw Error(`Coverage references missing scene ${item.sceneId}.`);
    for(const index of item.beatIndices||[])
      if(!scene.performance.actions[index])throw Error(`Coverage references missing action ${index} in scene ${item.sceneId}.`);
  }
  if(ir.metadata.hook){
    const scene=sceneById.get(ir.metadata.hook.sceneId);
    if(!scene)throw Error(`Hook references missing scene ${ir.metadata.hook.sceneId}.`);
    for(const index of ir.metadata.hook.beatIndices||[])
      if(!scene.performance.actions[index])throw Error(`Hook references missing action ${index} in scene ${ir.metadata.hook.sceneId}.`);
  }
  for(const requirement of ir.metadata.requirements||[]){
    if(!sceneById.has(requirement.sceneId))throw Error(`Requirement references missing scene ${requirement.sceneId}.`);
    if(requirement.characterId&&!actorIds.has(requirement.characterId))throw Error(`Requirement references missing actor ${requirement.characterId}.`);
    if(requirement.propId&&!propIds.has(requirement.propId))throw Error(`Requirement references missing prop ${requirement.propId}.`);
  }
  return ir;
}

function storyIRv1ToPlan(ir) {
  validateStoryIRv1(ir);
  const environments = new Map(ir.design.environments.map((x) => [x.sceneId, x]));
  const plan = {
    ...ir.metadata,
    storyId: ir.story.id,
    title: ir.story.title,
    story: ir.story.text,
    ...(ir.story.sourceIdea === undefined ? {} : { sourceIdea: ir.story.sourceIdea }),
    characters: ir.design.actors,
    propDesigns: ir.design.props,
    scenes: ir.scenes.map((scene) => {
      const environment = environments.get(scene.id);
      return {
        id: scene.id,
        summary: scene.intent.summary,
        duration: scene.duration,
        background: environment.kind,
        backgroundNodes: environment.elements,
        cast: scene.performance.cast,
        props: scene.performance.propPlacements,
        motions: scene.performance.propMotions,
        beats: scene.performance.actions,
        shots: scene.performance.cameras,
        sounds: scene.performance.soundCues.map((cue) => ({ ...cue.payload, id: cue.id })),
        dialogue: scene.performance.dialogue,
        ...(scene.performance.motionIR === undefined
          ? {}
          : { motionIR: scene.performance.motionIR }),
      };
    }),
  };
  return validatePlan(plan);
}

const RIG_PROFILES = Object.freeze({
  man: "sticklaugh.rig.humanoid-man.v2",
  woman: "sticklaugh.rig.humanoid-woman.v2",
  grandma: "sticklaugh.rig.humanoid-grandma.v2",
  child: "sticklaugh.rig.humanoid-child.v2",
  dog: "sticklaugh.rig.animal-dog.v1",
  cat: "sticklaugh.rig.animal-cat.v1",
  lion: "sticklaugh.rig.animal-lion.v1",
});
const LEGACY_KIND_BY_RIG = new Map(
  Object.entries(RIG_PROFILES).map(([kind, profile]) => [profile, kind]),
);
const ACTION_IDS = Object.freeze([
  "punch", "scold", "drink", "perform", "throw", "slip", "roar", "cower",
  "pawPress", "idle", "walk", "run", "reach", "hold", "struggle", "tap",
  "open", "flex", "deflate", "react", "point", "pick", "place", "jump",
  "fall", "sit", "laugh", "cry", "talk", "swat", "sneeze", "duck", "stand",
  "wave", "dance", "fart", "nosePinch", "scoot", "panic", "pullPaper", "wrap",
  "tearFree", "openDoor", "custom",
]);
const ACTION_BY_ID = new Map(
  ACTION_IDS.map((kind) => [`sticklaugh.action.${kind}.v1`, kind]),
);
const SHAPE_TYPES = [
  "cap", "can", "bottle", "banana", "peel", "dustbin", "sign", "rubberDuck",
  "headphones", "gasMask", "newspaper", "jar", "cup", "phone", "table",
  "bench", "dumbbell", "balloon", "car", "chair", "toilet", "paperRoll",
  "door", "drawing",
];
const SHAPE_TYPE_BY_ID = new Map(
  SHAPE_TYPES.map((type) => [`sticklaugh.shape.${type}.v1`, type]),
);
const HUMANOID_CAPABILITIES = Object.freeze([
  "sticklaugh.motion.humanoid-pose.v1",
  "sticklaugh.motion.face-controls.v1",
  "sticklaugh.motion.hand-shapes.v1",
  "sticklaugh.motion.path-following.v1",
  "sticklaugh.motion.ground-constraint.v1",
]);
const ANIMAL_CAPABILITIES = Object.freeze([
  "sticklaugh.motion.animal-controls.v1",
  "sticklaugh.motion.animal-face-controls.v1",
  "sticklaugh.motion.path-following.v1",
]);

function omit(record, fields) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !fields.includes(key)),
  );
}

function frameInstant(seconds, fps, sceneRange, rounding = "ceil") {
  const localFrame = Math.min(
    sceneRange.durationInFrames,
    secondsToFrame(Math.max(0, seconds), fps, rounding),
  );
  return {
    unit: "frame",
    domain: "scene-local",
    frame: localFrame,
    globalFrame: sceneRange.from + localFrame,
    rounding,
  };
}

function frameWindow(startSeconds, endSeconds, fps, sceneRange) {
  const localStart = Math.min(
    sceneRange.durationInFrames,
    secondsToFrame(Math.max(0, startSeconds), fps, "ceil"),
  );
  const localEnd = Math.min(
    sceneRange.durationInFrames,
    secondsToFrame(Math.max(0, endSeconds), fps, "ceil"),
  );
  return {
    unit: "frame",
    interval: "[startFrame,endFrame)",
    local: { startFrame: localStart, endFrame: Math.max(localStart, localEnd) },
    global: {
      startFrame: sceneRange.from + localStart,
      endFrame: sceneRange.from + Math.max(localStart, localEnd),
    },
    rounding: "ceil-first-frame-at-or-after",
  };
}

function frameWindowFromIndices(localStart, localEnd, sceneRange) {
  const startFrame = Math.min(sceneRange.durationInFrames, localStart);
  const endFrame = Math.min(
    sceneRange.durationInFrames,
    Math.max(startFrame, localEnd),
  );
  return {
    unit: "frame",
    interval: "[startFrame,endFrame)",
    local: { startFrame, endFrame },
    global: {
      startFrame: sceneRange.from + startFrame,
      endFrame: sceneRange.from + endFrame,
    },
    rounding: "ceil-first-frame-at-or-after-authored-boundary",
  };
}

function actionFrameWindow(action, fps, sceneRange) {
  return frameWindowFromIndices(
    secondsToFrame(action.start, fps, "ceil"),
    secondsSumToFrame(action.start, action.duration, fps, "ceil"),
    sceneRange,
  );
}

function projectAction(action, fps, sceneRange) {
  const fractions = contactFractions(action);
  const contacts = fractions.map((fraction) =>
    exactContactInstant(action, fraction, fps, sceneRange),
  );
  const window = actionFrameWindow(action, fps, sceneRange);
  return {
    id: action.id,
    primitiveAction: `sticklaugh.action.${action.kind}.v1`,
    actorId: action.actorId,
    ...(action.targetActorId ? { targetActorId: action.targetActorId } : {}),
    ...(action.targetId ? { targetId: action.targetId } : {}),
    window,
    contacts,
    payload: omit(action, ["id", "kind", "start", "duration", "contactAt"]),
  };
}

function exactContactInstant(action, fraction, fps, sceneRange) {
  const localFrame = Math.min(
    sceneRange.durationInFrames,
    secondsAtFractionToFrame(
      action.start,
      action.duration,
      fraction,
      fps,
      "ceil",
    ),
  );
  return {
    unit: "frame",
    domain: "scene-local",
    frame: localFrame,
    globalFrame: sceneRange.from + localFrame,
    rounding: "ceil-first-frame-at-or-after",
    event: "contact",
  };
}

function projectActor(actor) {
  const rigProfile = RIG_PROFILES[actor.kind];
  if (!rigProfile) throw Error(`No registered rig profile for ${actor.kind}.`);
  const animal = ["dog", "cat", "lion"].includes(actor.kind);
  return {
    id: actor.id,
    displayName: actor.name,
    description: actor.description ?? null,
    rigProfile,
    capabilities: [...(animal ? ANIMAL_CAPABILITIES : HUMANOID_CAPABILITIES)],
    appearance: omit(actor, ["id", "name", "description", "kind"]),
  };
}

function projectProp(prop) {
  const shapeDefinition = `sticklaugh.shape.${prop.type}.v1`;
  if (!SHAPE_TYPE_BY_ID.has(shapeDefinition))
    throw Error(`No registered shape definition for ${prop.type}.`);
  return {
    id: prop.id,
    displayName: prop.name,
    description: prop.description ?? null,
    shapeDefinition,
    capabilities: [
      "sticklaugh.render.vector-shape.v1",
      "sticklaugh.interaction.attachable.v1",
      ...(prop.interactionAnchors?.length
        ? ["sticklaugh.interaction.named-anchors.v1"]
        : []),
    ],
    appearance: omit(prop, ["id", "name", "description", "type"]),
  };
}

function projectMouthCues(cues, fps) {
  return (cues || []).map((cue) => ({
    clipRelativeFrame: secondsToFrame(cue.time, fps, "nearest"),
    open: cue.open,
  }));
}

function projectScene(legacyScene, sceneRange, fps) {
  const legacyPerformance = legacyScene.performance;
  const actions = legacyPerformance.actions.map((action) =>
    projectAction(action, fps, sceneRange),
  );
  const actionByIndex = legacyPerformance.actions;
  const soundCues = legacyPerformance.soundCues.map((cue) => {
    const source = cue.payload;
    const linkedAction =
      source.beatIndex === undefined ? null : actionByIndex[source.beatIndex];
    const fractions = linkedAction ? contactFractions(linkedAction) : [];
    let timestamps;
    if (source.syncTo === "start" && linkedAction) {
      timestamps = [frameInstant(linkedAction.start, fps, sceneRange)];
    } else if (source.syncTo === "contact" && linkedAction) {
      timestamps = (fractions.length
        ? fractions
        : [0]
      ).map((fraction) =>
        exactContactInstant(linkedAction, fraction, fps, sceneRange),
      );
    } else if (source.syncTo === "footfalls" && linkedAction) {
      timestamps = [{
        unit: "frame",
        domain: "scene-local",
        policy: "renderer-footfall-crossings-sampled-at-120Hz",
        globalOffsetFrame: sceneRange.from,
        rounding: "ceil-first-output-frame-at-or-after-crossing",
      }];
    } else {
      timestamps = [frameInstant(source.start, fps, sceneRange)];
    }
    return {
      id: cue.id,
      actionId: cue.actionId,
      timestamps,
      durationFrames: secondsToFrame(source.duration, fps, "ceil"),
      mouthCues: projectMouthCues(source.mouthCues, fps),
      payload: omit(source, [
        "id", "start", "duration", "beatIndex", "syncTo", "mouthCues",
      ]),
      ...(source.syncTo
        ? { syncPolicy: { kind: source.syncTo, actionId: cue.actionId } }
        : {}),
    };
  });
  const dialogue = legacyPerformance.dialogue.map((line) => ({
    id: line.id,
    actorId: line.actorId,
    timestamp: frameInstant(line.start, fps, sceneRange),
    durationFrames: secondsToFrame(
      line.audioDuration ?? Math.min(8, line.text.length / 7),
      fps,
      "ceil",
    ),
    durationSource:
      line.audioDuration === undefined
        ? "renderer-text-duration-default"
        : "authored-audio-duration",
    mouthCues: projectMouthCues(line.mouthCues, fps),
    payload: omit(line, [
      "id", "actorId", "start", "audioDuration", "mouthCues",
    ]),
  }));
  const propMotions = legacyPerformance.propMotions.map((motion) => ({
    id: motion.id,
    targetId: motion.targetId,
    window: frameWindowFromIndices(
      secondsToFrame(motion.start, fps, "ceil"),
      secondsSumToFrame(motion.start, motion.duration, fps, "ceil"),
      sceneRange,
    ),
    payload: omit(motion, ["id", "start", "duration"]),
  }));
  const propPlacements = legacyPerformance.propPlacements.map((placement) => {
    const events = [];
    for (const key of ["appearAt", "disappearAt", "attachAt"]) {
      if (placement[key] !== undefined) {
        events.push({
          kind: key,
          timestamp: frameInstant(placement[key], fps, sceneRange),
        });
      }
    }
    for (const event of placement.attachmentEvents || []) {
      events.push({
        id: event.id,
        kind: event.attachment ? "attach" : "release",
        timestamp: frameInstant(event.at, fps, sceneRange),
        actorId: event.attachment?.actorId ?? null,
      });
    }
    if (placement.attachment) {
      events.push({
        id: placement.attachment.id,
        kind: "initial-attach",
        timestamp: frameInstant(placement.attachAt ?? 0, fps, sceneRange),
        actorId: placement.attachment.actorId,
      });
    }
    return {
      id: placement.id,
      designId: placement.designId,
      events,
      payload: omit(placement, [
        "id", "designId", "appearAt", "disappearAt", "attachAt",
        "attachmentEvents",
      ]),
    };
  });
  const cameras = legacyPerformance.cameras.map((camera) => ({
    id: camera.id,
    window: frameWindow(camera.start, camera.end, fps, sceneRange),
    payload: omit(camera, ["id", "start", "end"]),
  }));
  const reactions = actions
    .filter((action) => action.primitiveAction === "sticklaugh.action.react.v1")
    .map((action) => ({
      actionId: action.id,
      actorId: action.actorId,
      window: action.window,
      semantics: "reaction-action-window",
    }));
  const motionTracks = (legacyPerformance.motionIR?.tracks || []).map((track) => ({
    id: track.id,
    actorId: track.actorId,
    window: frameWindowFromIndices(
      secondsToFrame(track.start, fps, "ceil"),
      secondsSumToFrame(track.start, track.duration, fps, "ceil"),
      sceneRange,
    ),
    keyframes: track.keyframes.map((key) => ({
      phase: key.at,
      pose: key.pose,
      ...(key.emotion === undefined ? {} : { emotion: key.emotion }),
      ...(key.timing === undefined ? {} : { timing: key.timing }),
      ...(key.leftHandShape === undefined
        ? {}
        : { leftHandShape: key.leftHandShape }),
      ...(key.rightHandShape === undefined
        ? {}
        : { rightHandShape: key.rightHandShape }),
    })),
    ...(track.path === undefined ? {} : { path: track.path }),
    constraints: track.constraints,
  }));
  const durationFrames = sceneRange.durationInFrames;
  return {
    schemaVersion: STORY_IR_VERSION,
    id: legacyScene.id,
    intent: legacyScene.intent,
    environmentId: legacyScene.environmentId,
    time: {
      unit: "frame",
      origin: "story-start",
      localStartFrame: 0,
      localEndFrame: durationFrames,
      globalStartFrame: sceneRange.from,
      globalEndFrame: sceneRange.from + durationFrames,
      interval: "[startFrame,endFrame)",
    },
    performance: {
      schemaVersion: STORY_IR_VERSION,
      cast: legacyPerformance.cast,
      propPlacements,
      propMotions,
      actions,
      reactions,
      cameras,
      soundCues,
      dialogue,
      motionTracks,
    },
    transition: {
      id: legacyScene.transition.id,
      toSceneId: legacyScene.transition.toSceneId,
      atGlobalFrame: sceneRange.from + durationFrames,
      semantics: "cut-at-source-scene-end",
    },
  };
}

function projectMetadata(legacyMetadata, legacyScenes, frameScenes, fps) {
  const metadata = omit(legacyMetadata, ["hook", "coverage", "renderFps"]);
  if (legacyMetadata.coverage) {
    metadata.coverage = legacyMetadata.coverage.map((item) => ({
      sceneId: item.sceneId,
      ...(item.beatIndices === undefined
        ? {}
        : {
            actionIds: item.beatIndices.map(
              (index) => legacyScenes.find((scene) => scene.id === item.sceneId)
                ?.performance.actions[index]?.id,
            ),
          }),
      phaseRange: { start: item.start, end: item.end, unit: "scene-phase" },
      evidence: item.evidence,
    }));
  }
  const hook = legacyMetadata.hook;
  if (hook) {
    const sceneIndex = legacyScenes.findIndex((scene) => scene.id === hook.sceneId);
    const projectedScene = frameScenes.find((scene) => scene.id === hook.sceneId);
    const localRange = {
      from: projectedScene.time.globalStartFrame,
      durationInFrames:
        projectedScene.time.globalEndFrame - projectedScene.time.globalStartFrame,
    };
    metadata.hook = {
      sceneId: hook.sceneId,
      window: frameWindow(hook.start, hook.end, fps, localRange),
      actionIds: (hook.beatIndices || []).map(
        (index) =>
          legacyScenes[sceneIndex]?.performance.actions[index]?.id,
      ),
      evidence: hook.evidence,
      ...(hook.partRefs?{partRefs:structuredClone(hook.partRefs)}:{}),
    };
  }
  return metadata;
}

function projectEnvironment(environment) {
  return {
    id: environment.id,
    sceneId: environment.sceneId,
    displayName: null,
    description: null,
    environmentProfile: `sticklaugh.environment.${environment.kind}.v1`,
    capabilities: ["sticklaugh.render.vector-background.v1"],
    elements: environment.elements,
  };
}

function createStoryIRv2(legacy) {
  const legacyPlan = storyIRv1ToPlan(legacy);
  const fps = legacyPlan.renderFps || 30;
  const clock = timeline(legacyPlan);
  const scenes = legacy.scenes.map((scene, index) =>
    projectScene(scene, clock.scenes[index], fps),
  );
  return {
    schemaVersion: STORY_IR_VERSION,
    timebase: {
      unit: "frame",
      fps,
      origin: "story-start",
      sceneOrigin: "scene-start",
      sceneBoundaryRounding: "nearest-frame-after-exact-decimal-accumulation",
      eventInstantRounding: "ceil-first-frame-at-or-after-authored-time",
      interval: "[startFrame,endFrame)",
    },
    story: {
      id: legacy.story.id,
      displayName: legacy.story.title,
      description: legacy.story.text,
      ...(legacy.story.sourceIdea === undefined
        ? {}
        : { sourceIdea: legacy.story.sourceIdea }),
    },
    design: {
      actors: legacy.design.actors.map(projectActor),
      props: legacy.design.props.map(projectProp),
      propAnchors: legacy.design.propAnchors,
      environments: legacy.design.environments.map(projectEnvironment),
    },
    metadata: projectMetadata(legacy.metadata, legacy.scenes, scenes, fps),
    scenes,
    compatibility: {
      schemaVersion: LEGACY_STORY_IR_VERSION,
      contract: "PlanV1-seconds-lowered-from-canonical-frame-IR",
      storyIR: legacy,
    },
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateStoryIR(ir) {
  if (ir?.schemaVersion === LEGACY_STORY_IR_VERSION)
    return validateStoryIRv1(ir);
  if (!ir || ir.schemaVersion !== STORY_IR_VERSION)
    throw Error(`Unsupported Story IR version: ${ir?.schemaVersion}.`);
  if (
    ir.timebase?.unit !== "frame" ||
    ir.timebase?.origin !== "story-start" ||
    ir.timebase?.sceneOrigin !== "scene-start" ||
    !Number.isInteger(ir.timebase?.fps) ||
    ![24, 30, 60, 120].includes(ir.timebase.fps) ||
    ir.timebase?.interval !== "[startFrame,endFrame)"
  ) {
    throw Error("Story IR v2 requires a supported integer-frame timebase.");
  }
  if (ir.compatibility?.schemaVersion !== LEGACY_STORY_IR_VERSION)
    throw Error("Story IR v2 requires its explicit Plan v1 compatibility adapter.");
  validateStoryIRv1(ir.compatibility.storyIR);
  const expected = createStoryIRv2(ir.compatibility.storyIR);
  if (stableJson(expected) !== stableJson(ir))
    throw Error("Story IR v2 frame projection does not match its compatibility source.");
  return ir;
}

export function planToStoryIR(input) {
  return createStoryIRv2(planToStoryIRv1(input));
}

export function storyIRToPlan(ir) {
  if (ir?.schemaVersion === LEGACY_STORY_IR_VERSION)
    return storyIRv1ToPlan(ir);
  validateStoryIR(ir);
  return storyIRv1ToPlan(ir.compatibility.storyIR);
}

export function canonicalizePlan(input) {
  const ir = planToStoryIR(input);
  return { ir, plan: storyIRToPlan(ir) };
}
