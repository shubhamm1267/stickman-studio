import {validatePartNodes} from "./part-motion.mjs";
import {validatePartAttachments} from "./part-attachments.mjs";
import { z } from "zod";
import {createMotionSchemas,describeMotionCapabilities,validateMotionIR,validateKeys,performanceTrack} from "./motion-ir.mjs";
import {assertDistinctCast} from "./character-design.mjs";
import {assertComedyCategoryPlan, normalizeComedySettings} from "./comedy-category.mjs";
import { cumulativeFrameBoundaries } from "./frame-clock.mjs";
import { replayPlanHash, replaySeed, sceneSeedFor } from "./replay.mjs";
import { NodeSchema, VisualSpecSchema } from "./visual-spec-schema.mjs";
import { createGeometryComponent } from "./geometry-library.mjs";
import { RENDERED_PROP_TYPES } from "./visual-capability-manifest.mjs";
export { NodeSchema, VisualSpecSchema };
export const ACTIONS = [
  "punch",
  "scold",
  "drink",
  "perform",
  "throw",
  "slip",
  "roar",
  "cower",
  "pawPress",
  "idle",
  "walk",
  "run",
  "reach",
  "hold",
  "struggle",
  "tap",
  "open",
  "flex",
  "deflate",
  "react",
  "point",
  "pick",
  "place",
  "jump",
  "fall",
  "sit",
  "laugh",
  "cry",
  "talk",
  "swat",
  "sneeze",
  "duck",
  "stand",
  "wave",
  "dance",
  "fart",
  "nosePinch",
  "scoot",
  "panic",
  "pullPaper",
  "wrap",
  "tearFree",
  "openDoor",
  "custom",
];
export const EXPRESSIONS = [
  "neutral",
  "confident",
  "smug",
  "strain",
  "extreme",
  "annoyed",
  "idea",
  "kiss",
  "shock",
  "jawdrop",
  "defeat",
  "calm",
  "curious",
  "laugh",
  "cry",
  "talk",
];
const num = z.number().finite(),
  point = z.tuple([num.min(-1500).max(2000), num.min(-1500).max(2000)]),
  id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/),
  color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const hash256 = z.string().regex(/^[a-f0-9]{64}$/);
const capabilityId = z.string().min(3).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
const appearanceFeature = z.string().min(2).max(100);
const rigProfileByKind = Object.freeze({
  man: "sticklaugh.rig.humanoid-man.v2",
  woman: "sticklaugh.rig.humanoid-woman.v2",
  grandma: "sticklaugh.rig.humanoid-grandma.v2",
  child: "sticklaugh.rig.humanoid-child.v2",
  dog: "sticklaugh.rig.animal-dog.v1",
  cat: "sticklaugh.rig.animal-cat.v1",
  lion: "sticklaugh.rig.animal-lion.v1",
});
const RigRequirementSchema = z.object({
  profile: z.enum(Object.values(rigProfileByKind)),
  capabilities: z.array(capabilityId).max(32).default([]),
}).strict();
const VisualEvidenceSchema = z.object({
  eventId: id,
  frame: z.number().int().min(0),
  outputSha256: hash256,
  check: z.enum(["actor-visible", "prop-visible", "frame-change"]),
}).strict();
const interactionAnchor = z.object({
  id,
  position: z.tuple([num.min(-250).max(250), num.min(-250).max(250)]),
}).strict();
const propAttachment = z.object({
  id: id.optional(),
  actorId: id,
  bone: z.enum(["head", "leftHand", "rightHand"]),
  offset: point.default([0, 0]),
  propAnchorId: id.optional(),
}).strict();
export const CharacterSchema = z
  .object({
    id,
    name: z.string().min(1).max(70),
    identityGroup:id.optional(),
    rigVersion:z.union([z.literal(1),z.literal(2)]).optional(),
    shoulderWidth:num.min(8).max(60).optional(),
    kind: z.enum(["man", "woman", "grandma", "child", "dog", "cat", "lion"]),
    requiredAppearanceFeatures: z.array(appearanceFeature).max(20).optional(),
    visualSpec: VisualSpecSchema.optional(),
    rigRequirement: RigRequirementSchema.optional(),
    visualEvidence: z.array(VisualEvidenceSchema).max(100).optional(),
    ageYears: z.number().int().min(0).max(120).optional(),
    artStyle: z.enum(["classic", "pencil", "toon"]).optional(),
    hairStyle: z.enum(["tuft", "bald", "sidepart", "curly", "bob", "ponytail"]).optional(),
    faceShape: z.enum(["round", "long", "square"]).optional(),
    pattern: z.enum(["plain", "spots", "tabby"]).optional(),
    costume:z.enum(["everyday","superhero"]).optional(),
    build:z.enum(["slim","average","broad","round"]).optional(),
    shirtLabel:z.string().max(14).regex(/^[A-Za-z0-9 !?.-]*$/).optional(),
    capeColor:color.optional(),
    bootColor:color.optional(),
    wardrobe: z.enum(["default", "shirt", "suit"]).optional(),
    accessory: z.enum(["none", "glasses", "moustache"]).optional(),
    skin: color.default("#f6f1da"),
    outfit: color.default("#a2b6a6"),
    hair: color.default("#655f4d"),
    headWidth: num.min(0.75).max(1.3).default(1),
    headHeight: num.min(0.8).max(1.2).default(1),
    voiceId: z.string().max(120).optional(),
  })
  .strict();
export const PropSchema = z
  .object({
    visualAssetRequest: z.object({
      description: z.string().min(5).max(500),
      requiredFeatures: z.array(appearanceFeature).max(20).default([]),
      style: z.enum(["vector", "2d-cartoon", "photo-reference"]).optional(),
    }).strict().optional(),
    objectAffordances: z.array(z.enum([
      "grip", "wear", "hold", "open", "press", "sit-on", "throw",
      "roll", "attach", "drink-from", "pull", "tear",
    ])).max(20).optional(),
    contactEventIds: z.array(id).max(100).optional(),
    optionalSourceAsset: z.object({
      assetId: id,
      sha256: hash256,
      mediaType: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
    }).strict().optional(),
    rightsStatus: z.enum(["original", "licensed", "public-domain", "unknown", "restricted"]).optional(),
    assetCapabilities: z.array(capabilityId).max(40).optional(),
    visualEvidence: z.array(VisualEvidenceSchema).max(100).optional(),
    gripOffset:point.optional(),
    visualSpec: VisualSpecSchema.optional(),
    interactionAnchors: z.array(interactionAnchor).max(16).optional().superRefine((anchors, ctx) => {
      const seen = new Set();
      for (const [index, anchor] of (anchors || []).entries()) {
        if (seen.has(anchor.id))
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: `Duplicate interaction anchor ${anchor.id}.` });
        seen.add(anchor.id);
      }
    }),
    id,
    name: z.string().max(100),
    label: z.string().max(22).regex(/^[A-Za-z0-9 !?.-]*$/).optional(),
    tether: z.boolean().optional(),
    stock: num.min(0).max(1).optional(),
    type: z.enum(RENDERED_PROP_TYPES.map((propType) => propType.id)),
    color: color.default("#b3bda3"),
    nodes: z.array(NodeSchema).max(100).default([]).superRefine((items, ctx) => {
      const count = (values) => values.reduce((sum, item) => sum + 1 + (item.children ? count(item.children) : 0), 0);
      if (count(items) > 100)
        ctx.addIssue({code:z.ZodIssueCode.custom,message:"A prop may contain at most 100 geometry nodes including nested children."});
    }),
  })
  .strict();
const pose = z
  .object({
    position:point.optional(),
    sweat:num.min(0).max(1).optional(),
    blush:num.min(0).max(1).optional(),
    headScale: z.tuple([num.min(.7).max(1.3),num.min(.7).max(1.3)]).optional(),
    eyeOpen: num.min(0).max(1).optional(),
    eyeOpenLeft: num.min(0).max(1).optional(),
    eyeOpenRight: num.min(0).max(1).optional(),
    mouthOpen: num.min(0).max(1.3).optional(),
    mouthWidth: num.min(.5).max(1.5).optional(),
    mouthCurve: num.min(-1).max(1).optional(),
    mouthAperture: num.min(0).max(1).optional(),
    browHeight: z.tuple([num.min(-24).max(24),num.min(-24).max(24)]).optional(),
    browTilt: z.tuple([num.min(-35).max(35),num.min(-35).max(35)]).optional(),
    handScale: num.min(.7).max(1.5).optional(),
    leftWristAngle: num.min(-180).max(180).optional(),
    gaze: z.tuple([num.min(-12).max(12), num.min(-12).max(12)]).optional(),
    head: point.optional(),
    hip: point.optional(),
    leftHand: point.optional(),
    rightHand: point.optional(),
    leftFoot: point.optional(),
    rightFoot: point.optional(),
    wristAngle: num.min(-180).max(180).optional(),
    spineAngle: num.min(-75).max(75).optional(),
    bodyAngle: num.min(-180).max(180).optional(),
    headAngle: num.min(-90).max(90).optional(),
    muscle: num.min(0).max(1.3).optional(),
  })
  .strict();
export const MOTION_CAPABILITIES=describeMotionCapabilities(pose);
export const {keyframes:PerformanceKeysSchema,constraints:MotionConstraintsSchema,motionIR:MotionIRSchema}=createMotionSchemas(pose,id,EXPRESSIONS);
export const BeatSchema = z
  .object({
    id: id.optional(),
    motionEffect:z.enum(["flight","none"]).optional(),
    accent:z.enum(["impact","none"]).optional(),
    timing: z.enum(["smooth", "snappy", "gentle"]).optional(),
    actorId: id,
    targetActorId:id.optional(),
    hit:z.boolean().optional(),
    kind: z.enum(ACTIONS),
    start: num.min(0).max(60),
    duration: num.min(0.1).max(60),
    targetId: id.optional(),
    to: point.optional(),
    hand: z.enum(["left", "right", "both"]).default("right"),
    emotion: z.enum(EXPRESSIONS).optional(),
    amount: num.min(0).max(5).default(1),
    pose: pose.optional(),
    leftHandShape: z.enum(["fist","grip","point","open"]).optional(),
    rightHandShape: z.enum(["fist","grip","point","open"]).optional(),
    contactAt:num.min(0).max(1).optional(),
    keyframes:PerformanceKeysSchema.optional(),
    constraints:MotionConstraintsSchema.optional(),
    motionTrackId:id.optional(),
    semanticAction:z.string().min(1).max(40).optional(),
    intent: z.string().min(3).max(250),
  })
  .strict();
export const SceneSchema = z
  .object({
    sceneSeed: z.number().int().min(0).max(4294967295).optional(),
    canonicalFrame: z.object({
      fps: z.union([z.literal(24), z.literal(30), z.literal(60), z.literal(120)]),
      startFrame: z.number().int().min(0),
      endFrame: z.number().int().min(1),
      interval: z.literal("[startFrame,endFrame)"),
    }).strict().optional(),
    motionIR:MotionIRSchema.optional(),
    id,
    summary: z.string().min(5).max(600),
    duration: num.min(2).max(60),
    background: z.enum([
      "hospital",
      "toiletEntrance",
      "kitchen",
      "park",
      "street",
      "gym",
      "room",
      "office",
      "bathroom",
      "custom",
    ]),
    backgroundNodes: z.array(NodeSchema).max(100).default([]),
    motions: z
      .array(
        z
          .object({
            id: id.optional(),
            targetId: id,
            timing:z.enum(["smooth","linear","gravity"]).optional(),
            impactOnEnd:z.boolean().optional(),
            start: num.min(0),
            duration: num.min(0.1).max(60),
            to: point,
            arc: num.min(-500).max(500).default(0),
            angle: num.min(-720).max(720).default(0),
            scale: num.min(0.02).max(3).optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    cast: z
      .array(
        z
          .object({
            id: id.optional(),
            rigVersion:z.union([z.literal(1),z.literal(2)]).optional(),
    shoulderWidth:num.min(8).max(60).optional(),
            shadow: z.boolean().optional(),
            species: z.enum(["man", "woman", "grandma", "child", "dog", "cat", "lion"]).optional(),
            characterId: id,
            initialPose: pose.optional(),
            emotion: z.enum(EXPRESSIONS).optional(),
            x: num.min(-500).max(1000),
            y: num.min(400).max(900).default(780),
            scale: num.min(0.4).max(1.3).default(1),
            facing: z.union([z.literal(-1), z.literal(1)]).default(1),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    props: z
      .array(
        z
          .object({
            id: id.optional(),
            partAttachment:z.object({targetId:id,nodeId:id,start:num.min(0).max(60),end:num.min(0).max(60),offset:point.default([0,0]),angle:num.min(-720).max(720).default(0)}).strict().optional(),
            attachmentEvents:z.array(z.object({
              id:id.optional(),
              at:num.min(0).max(60),
              attachment:propAttachment.nullable(),
              position:point.optional(),
              angle:num.min(-720).max(720).optional(),
            }).strict()).max(20).optional(),
            appearAt:num.min(0).max(60).optional(),
            disappearAt:num.min(0).max(60).optional(),
            attachAt:num.min(0).max(60).optional(),
            attachment: propAttachment.optional(),
            designId: id,
            layer: z.enum(["back", "front"]).optional(),
            open: num.min(0).max(1).default(0),
            angle: num.min(-720).max(720).default(0),
            x: num.min(-500).max(1200),
            y: num.min(0).max(1100),
            scale: num.min(0.1).max(3).default(1),
          })
          .strict(),
      )
      .max(30),
    beats: z.array(BeatSchema).min(1).max(100),
    shots: z
      .array(
        z
          .object({
            id: id.optional(),
            start: num.min(0),
            end: num.min(0.1),
            focus: point,
            intent: z.enum(["establishing","contact","reaction","payoff"]).optional(),
            endFocus: point.optional(),
            endZoom: num.min(0.4).max(6).optional(),
            zoom: num.min(0.4).max(6),
            detail: z.enum(["full", "hands"]).default("full"),
            actorIds: z.array(id).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    sounds: z
      .array(
        z
          .object({
            id:id.optional(),
            beatIndex: z.number().int().min(0).max(99).optional(),
            syncTo: z.enum(["start", "contact", "footfalls"]).optional(),
            playbackRate:num.min(.5).max(2).default(1),
            category:z.enum(["punch","whoosh","gibberish","mutter","steps","plop","cloth","other"]).optional(),
            actorId:id.optional(),
            mouthCues:z.array(z.object({time:num.min(0).max(60),open:num.min(0).max(1)}).strict()).max(1201).optional(),
            role:z.enum(["effect","nonverbal"]).optional(),
            trimSilence: z.boolean().default(true),
            start: num.min(0),
            query: z.string().min(2).max(100),
            volume: num.min(0.01).max(0.7).default(0.22),
            duration: num.min(0.1).max(20).default(1),
            required: z.boolean().default(true),
            sourceStart: num.min(0).max(600).default(0),
            pan: num.min(-1).max(1).default(0),
            fixture: z
              .string()
              .regex(/^[a-z0-9_-]+$/)
              .optional(),
          })
          .strict(),
      )
      .max(50),
    dialogue: z
      .array(
        z
          .object({
            id:id.optional(),
            actorId: id,
            start: num.min(0),
            text: z.string().min(1).max(500),
            fixture:z.string().regex(/^[a-z0-9_-]+$/).optional(),
            mouthCues:z.array(z.object({time:num.min(0).max(60),open:num.min(0).max(1)}).strict()).max(1201).optional(),
            allowOverlap:z.boolean().optional(),
            audioDuration: num.min(0.01).max(60).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const SeoSchema = z
  .object({
    titles: z.array(z.string().min(5).max(100)).min(1).max(3),
    description: z.string().min(20).max(4000),
    tags: z.array(z.string().min(1).max(50)).max(30),
    hashtags: z.array(z.string().max(40)).max(5),
    pinnedComment: z.string().max(500),
    thumbnailText: z.string().max(45),
  })
  .strict();
export const ComedySchema = z
  .object({
    hook: z.string().min(5).max(400),
    goal: z.string().min(5).max(400),
    escalation: z.array(z.string().min(5).max(400)).min(1).max(12),
    payoff: z.string().min(5).max(400),
    callback: z.string().min(5).max(400),
  })
  .strict();
export const HookSchema = z
  .object({
    sceneId: id,
    beatIndices: z.array(z.number().int().min(0).max(99)).max(20).optional(),
    partRefs:z.array(z.object({entityId:id,nodeId:id}).strict()).max(20).optional(),
    start: num.min(0).max(1),
    end: num.min(0.3).max(3),
    evidence: z.string().min(10).max(600),
  })
  .strict();
export const OutlineSchema = z
  .object({
    schemaVersion: z.literal(2).optional(),
    seed: z.number().int().min(0).max(4294967295).optional(),
    provenance: z.object({
      origin: z.enum(["generated", "authored", "legacy-migration", "imported"]),
      sourceSchemaVersion: z.number().int().min(1).max(100),
      generator: z.enum(["sticklaugh-director", "manual", "legacy-import"]).optional(),
    }).strict().optional(),
    generatedAssetRefs: z.array(z.object({
      assetId: id,
      sha256: hash256,
      mediaType: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
      rightsStatus: z.enum(["original", "licensed", "public-domain", "unknown", "restricted"]),
    }).strict()).max(100).optional(),
    replay: z.object({
      schemaVersion: z.literal(1),
      planHash: hash256,
      seed: z.number().int().min(0).max(4294967295),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60), z.literal(120)]),
      totalFrames: z.number().int().min(1),
      frameRounding: z.literal("nearest"),
      evaluator: z.literal("sticklaugh-frame-evaluator-v1"),
    }).strict().optional(),
    durationMode:z.enum(["auto","manual"]).optional(),
    renderFps:z.union([z.literal(24),z.literal(30),z.literal(60),z.literal(120)]).optional(),
    referenceStyle:z.enum(["silent-slapstick","coloured-cartoon","elastic-meme"]).optional(),
    planningMode:z.enum(["dynamic","semantic","legacy"]).optional(),
    productionMode:z.enum(["silent-sfx","dialogue-toon"]).optional(),
    category:z.enum(["family-comedy","slapstick","romantic-comedy","adult-comedy"]).optional(),
    comedySettings:z.object({innuendo:z.enum(["off","mild","cheeky"]),profanity:z.enum(["off","mild"]),physicalIntensity:z.enum(["low","medium","high"])}).strict().optional(),
    adultModeAcknowledged:z.boolean().optional(),
    humorProfile: z.enum(["adult-relatable", "clean", "naughty"]).optional(),
    hook: HookSchema.optional(),
    comedy: ComedySchema.optional(),
    title: z.string().min(3).max(100),
    story: z.string().min(20).max(15000),
    sourceIdea:z.string().max(15000).optional(),
    requirements:z.array(z.object({description:z.string().min(5).max(300),sceneId:id,characterId:id.optional(),propId:id.optional(),color:color.optional(),label:z.string().max(22).optional(),action:z.enum(ACTIONS).optional(),worn:z.boolean().optional()}).strict()).max(80).optional(),
    characters: z.array(CharacterSchema).min(1).max(6),
    propDesigns: z.array(PropSchema).max(40),
    scenes: z
      .array(
        z
          .object({
            id,
            summary: z.string().min(10).max(1000),
            duration: num.min(2).max(60),
          })
          .strict(),
      )
      .min(1)
      .max(80),
    coverage: z
      .array(
        z
          .object({
            storyEvent: z.string().max(300),
            sceneId: id,
            beatIndices: z
              .array(z.number().int().min(0).max(99))
              .max(100)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    seo: SeoSchema,
    blockedReasons: z.array(z.string().max(400)).max(20),
  })
  .strict();
export const PlanSchema = OutlineSchema.extend({
  schemaVersion: z.literal(2).default(2),
  seed: z.number().int().min(0).max(4294967295).optional(),
  provenance: z.object({
    origin: z.enum(["generated", "authored", "legacy-migration", "imported"]),
    sourceSchemaVersion: z.number().int().min(1).max(100),
    generator: z.enum(["sticklaugh-director", "manual", "legacy-import"]).optional(),
  }).strict().optional(),
  generatedAssetRefs: z.array(z.object({
    assetId: id,
    sha256: hash256,
    mediaType: z.enum(["image/png", "image/jpeg", "image/svg+xml"]),
    rightsStatus: z.enum(["original", "licensed", "public-domain", "unknown", "restricted"]),
  }).strict()).max(100).default([]),
  replay: z.object({
    schemaVersion: z.literal(1),
    planHash: hash256,
    seed: z.number().int().min(0).max(4294967295),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60), z.literal(120)]),
    totalFrames: z.number().int().min(1),
    frameRounding: z.literal("nearest"),
    evaluator: z.literal("sticklaugh-frame-evaluator-v1"),
  }).strict().optional(),
  storyId:id.optional(),
  directionScore:z.string().max(300000).optional(),
  directionVersion:z.union([z.literal(1),z.literal(2),z.literal(3)]).optional(),
  soundScore:z.string().max(100000).optional(),
  review: z
    .object({
      method: z.enum(["gemini", "authored-example"]),
      planHash: z.string().regex(/^[a-f0-9]{64}$/),
      summary: z.string().max(1500),
    })
    .strict()
    .optional(),
  version: z.literal(1),
  format: z.enum(["shorts", "landscape", "square"]),
  language: z.enum(["hi", "en"]),
  scenes: z.array(SceneSchema).min(1).max(80),
}).strict();
export function validatePlan(input) {
  const p = PlanSchema.parse(input),
    characters = new Set(p.characters.map((x) => x.id)),
    props = new Set(p.propDesigns.map((x) => x.id)),
    scenes = new Set(p.scenes.map((x) => x.id));
  const countNodes = (items) => items.reduce(
    (count, item) => count + 1 + (item.children ? countNodes(item.children) : 0),
    0,
  );
  const validateVisualComponents = (spec, owner, allowBoneAttachments) => {
    if (!spec) return;
    if (spec.assetSource?.rightsStatus === "restricted")
      throw Error(`Restricted visual source cannot be used by ${owner}.`);
    let total = [
      "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
    ].reduce((sum, key) => sum + countNodes(spec[key] || []), 0);
    for (const component of spec.proceduralComponents || []) {
      if (!allowBoneAttachments && component.attachment !== "root")
        throw Error(`Procedural visual component ${component.id} on ${owner} must use the root attachment.`);
      let nodes;
      try {
        nodes = createGeometryComponent(component.componentId, component.options);
      } catch (error) {
        throw Error(
          `Invalid procedural visual component ${component.id} (${component.componentId}/v${component.version}) on ${owner}: ${error.message}`,
        );
      }
      total += countNodes(nodes);
    }
    if (total > 100)
      throw Error(`Visual spec on ${owner} exceeds the 100 generated geometry node limit.`);
  };
  for (const character of p.characters)
    validateVisualComponents(character.visualSpec, `character ${character.id}`, true);
  for (const design of p.propDesigns)
    validateVisualComponents(design.visualSpec, `prop ${design.id}`, false);
  if (
    characters.size !== p.characters.length ||
    props.size !== p.propDesigns.length ||
    scenes.size !== p.scenes.length
  )
    throw Error("Duplicate IDs are not allowed.");
  for(const design of [...p.characters,...p.propDesigns]){
    const spec=design.visualSpec;
    const lists=spec?['geometryRecipe','facialComponents','apparel','accessories','decorativeMarks'].flatMap(k=>spec[k]||[]):[];
    validatePartNodes([...lists,...(design.nodes||[])],{sceneIds:scenes,owner:design.id,allowBones:characters.has(design.id)});
    if(spec?.renderMode==='replace'&&!lists.length&&!spec.proceduralComponents.length)throw Error(`Replacement visual ${design.id} requires visible geometry`);
  }
  for(const scene of p.scenes){validatePartAttachments(scene,p.propDesigns);validatePartNodes(scene.backgroundNodes,{sceneIds:scenes,owner:scene.id});}
  const total = p.scenes.reduce((a, s) => a + s.duration, 0);
  if (total > 1200) throw Error("Maximum duration is 20 minutes.");
  if (p.seo.tags.join(",").length > 500)
    throw Error("YouTube tags exceed 500 characters.");
  if(p.category){
    p.comedySettings=normalizeComedySettings(p.category,p.comedySettings);
    assertComedyCategoryPlan(p);
  }
  if (
    ["adult-relatable","naughty"].includes(p.humorProfile) &&
    p.characters.some((c) => c.kind === "child")
  )
    throw Error("Adult comedy cast must contain adult characters");
  if (p.hook) {
    let h = p.hook,
      first = p.scenes[0];
    if (h.sceneId !== first.id || h.end <= h.start || h.end > first.duration)
      throw Error(
        "Opening hook must be in the first scene and finish within three seconds",
      );
    for (const i of h.beatIndices || [])
      if (!first.beats[i]) throw Error("Hook beat index missing");
  }
  for (const c of p.coverage) {
    if (!scenes.has(c.sceneId))
      throw Error("Coverage points to missing scene " + c.sceneId);
    for (const i of c.beatIndices || [])
      if (!p.scenes.find((s) => s.id === c.sceneId).beats[i])
        throw Error("Coverage points to missing beat " + i);
  }
  for (const design of p.propDesigns) {
    if (design.color === "#b3bda3") design.color = ({banana:"#f3cc43",peel:"#f3cc43",dustbin:"#439c80",rubberDuck:"#f2c83c"})[design.type] || design.color;
    if (design.type === "dustbin" && !design.label) design.label = "USE ME";
  }
  if(p.productionMode)assertDistinctCast(p.characters);
  if(p.productionMode==="silent-sfx" && p.scenes.some(s=>s.dialogue.length))throw Error("Silent SFX mode cannot contain dialogue.");
  for (const s of p.scenes) {
    for (const cast of s.cast) { const design=p.characters.find(c=>c.id===cast.characterId);if(design?.rigVersion)cast.rigVersion=design.rigVersion;if(design?.shoulderWidth!==undefined)cast.shoulderWidth=design.shoulderWidth; const kind = design?.kind; if (["dog","cat","lion"].includes(kind)) cast.species = kind; }
    const cast = new Set(s.cast.map((c) => c.characterId)),
      placed = new Set(s.props.map((q) => q.designId));
    if (cast.size !== s.cast.length || placed.size !== s.props.length)
      throw Error("Duplicate scene cast or prop placement");
    for (const m of s.motions) {
      if (!placed.has(m.targetId) || m.start + m.duration > s.duration + 0.01)
        throw Error("Invalid prop motion target or timing");
    }
    for (const v of s.dialogue)
      if (!cast.has(v.actorId)) throw Error("Dialogue actor missing");
    for (const c of cast)
      if (!characters.has(c)) throw Error("Missing character " + c);
    for (const q of placed) if (!props.has(q)) throw Error("Missing prop " + q);
    for(const q of s.props) {
      const design = p.propDesigns.find(d => d.id === q.designId);
      const checkAttachmentAnchor = (attachment, label) => {
        if (attachment?.propAnchorId && ![
          ...(design.interactionAnchors || []),
          ...(design.visualSpec?.motionAnchors || []),
        ].some(a => a.id === attachment.propAnchorId))
          throw Error(`Unknown prop interaction anchor ${attachment.propAnchorId} in scene ${s.id}, prop ${q.designId}, ${label}.`);
      };
      for(const [i,event]of(q.attachmentEvents||[]).entries()){
        if(event.at>s.duration || (i && event.at<=q.attachmentEvents[i-1].at))throw Error("Attachment events must increase within the scene.");
        if(event.attachment && !cast.has(event.attachment.actorId))throw Error("Attachment event actor missing.");
        if(event.attachment && (event.position!==undefined || event.angle!==undefined))throw Error(`Placement transform is only valid on a release event in scene ${s.id}, prop ${q.designId}, event ${i}.`);
        checkAttachmentAnchor(event.attachment, `event ${i}`);
      }
      if(q.attachment && !cast.has(q.attachment.actorId))throw Error("Attachment actor missing");
      checkAttachmentAnchor(q.attachment, "initial attachment");
      if(q.attachAt!==undefined && !q.attachment)throw Error("attachAt requires an attachment.");
      if([q.appearAt,q.disappearAt,q.attachAt].some(t=>t!==undefined&&t>s.duration))throw Error("Prop event exceeds scene duration.");
      if(q.appearAt!==undefined && q.disappearAt!==undefined && q.disappearAt<=q.appearAt)throw Error("Prop visibility interval must increase.");
    }
    validateMotionIR(s);
    for (const b of s.beats) {
      const species = p.characters.find(c => c.id === b.actorId)?.kind;
      if (["roar", "cower", "pawPress"].includes(b.kind) && !["dog", "cat", "lion"].includes(species)) throw Error("Animal action requires an animal rig");
      if (["dog", "cat", "lion"].includes(species) && !["walk", "run", "idle", "react", "sneeze", "roar", "cower", "pawPress", "jump", "custom", "perform"].includes(b.kind)) throw Error("Unsupported animal action: " + b.kind);
      if(b.targetActorId && (!cast.has(b.targetActorId)||b.targetActorId===b.actorId))throw Error("Action target actor missing or self-targeted.");
      if(b.kind==="punch"&&!b.targetActorId&&!b.to)throw Error("Punch needs targetActorId or world contact point.");
      if (!cast.has(b.actorId)) throw Error("Actor not in scene: " + b.actorId);
      if (b.start + b.duration > s.duration + 0.02)
        throw Error("Action exceeds scene: " + b.intent);
      if (b.targetId && !placed.has(b.targetId))
        throw Error("Action target missing: " + b.targetId);
      if (
        [
          "drink",
          "throw",
          "pawPress",
          "reach",
          "hold",
          "struggle",
          "tap",
          "open",
          "pick",
          "place",
          "swat",
          "pullPaper",
          "wrap",
          "tearFree",
          "openDoor",
        ].includes(b.kind) &&
        !b.targetId
      )
        throw Error("Action requires target: " + b.kind);
      if (
        ["hold", "struggle", "tap", "open"].includes(b.kind) &&
        p.propDesigns.find((q) => q.id === b.targetId)?.type !== "jar"
      )
        throw Error(
          "Jar-specific action cannot be used on a different object: " + b.kind,
        );
      if (
        ["pullPaper", "wrap", "tearFree"].includes(b.kind) &&
        p.propDesigns.find((q) => q.id === b.targetId)?.type !== "paperRoll"
      )
        throw Error("Paper action requires a paperRoll");
      if (
        b.kind === "openDoor" &&
        p.propDesigns.find((q) => q.id === b.targetId)?.type !== "door"
      )
        throw Error("Door action requires a door");
      if(b.kind==="drink" && !["cup","can","bottle"].includes(p.propDesigns.find(q=>q.id===b.targetId)?.type))throw Error("Drink needs a cup, can or bottle.");
      if (["throw","slip"].includes(b.kind) && !b.to) throw Error("Action needs world destination to:[x,y]: " + JSON.stringify(b));
      if (b.kind === "pullPaper" && !b.to)
        throw Error("Pull paper needs a world-space hand destination");
      if(b.contactAt!==undefined && b.kind!=="perform")throw Error("contactAt requires a perform action.");
      if (b.kind === "perform") {
        validateKeys(performanceTrack(s,b).keyframes);
      } else if(b.keyframes||b.constraints||b.motionTrackId) throw Error("Motion data requires a perform action.");
      if (b.kind === "custom" && !b.pose)
        throw Error("Custom action needs a pose.");
    }
    let end = 0;
    for (const q of s.shots)
      for (const a of q.actorIds || [])
        if (!cast.has(a)) throw Error("Camera actor missing");
    for (const q of [...s.shots].sort((a, b) => a.start - b.start)) {
      if (
        Math.abs(q.start - end) > 0.04 ||
        q.end <= q.start ||
        q.end > s.duration + 0.01
      )
        throw Error("Camera shots must cover scene without gaps or overlaps: scene="+s.id+", duration="+s.duration+", previousEnd="+end+", shot="+JSON.stringify(q));
      end = q.end;
    }
    if (Math.abs(end - s.duration) > 0.04)
      throw Error("Camera does not cover complete scene.");
    for (const cue of s.sounds) {
      if(cue.actorId && (!cast.has(cue.actorId)||cue.role!=="nonverbal"))throw Error("Actor vocal cues require a scene actor and nonverbal role.");
      if (cue.syncTo && cue.beatIndex === undefined)
        throw Error("Sound sync requires a beat index");
      if (cue.beatIndex !== undefined && !s.beats[cue.beatIndex])
        throw Error("Sound beat index missing");
      let kind = s.beats[cue.beatIndex]?.kind;
      if (cue.syncTo === "footfalls" && !["walk", "run"].includes(kind))
        throw Error("Footfall sync requires walk/run");
      if (
        cue.syncTo === "contact" &&
        ![
          "punch",
          "drink",
          "perform",
          "throw",
          "pawPress",
          "slip",
          "roar",
          "swat",
          "tap",
          "sneeze",
          "fart",
          "scoot",
          "pullPaper",
          "wrap",
          "tearFree",
          "openDoor",
        ].includes(kind)
      )
        throw Error("Contact sync requires an action with a defined event");
      if(cue.syncTo==="contact" && kind==="perform" && s.beats[cue.beatIndex].contactAt===undefined)throw Error("Performance contact sound needs contactAt.");
    }
    for(const v of s.dialogue){
      if(v.mouthCues?.some((c,i)=>i && c.time<=v.mouthCues[i-1].time))throw Error("Mouth cues must increase strictly.");
      if(v.audioDuration && v.start+v.audioDuration>s.duration+.02)throw Error("Dialogue exceeds scene duration.");
    }
    for (const q of [...s.sounds, ...s.dialogue])
      if (q.start >= s.duration) throw Error("Cue starts after scene end.");
    for (const n of [
      ...s.backgroundNodes,
      ...p.propDesigns.flatMap((p) => p.nodes),
    ]) {
      if (n.kind === "path" && !n.d) throw Error("Path geometry missing");
      if (
        n.kind === "ellipse" &&
        (!n.center || !n.radius || n.radius.some((x) => x <= 0))
      )
        throw Error("Invalid ellipse");
      if (n.kind === "line" && (!n.from || !n.to))
        throw Error("Line coordinates missing");
    }
  }
  for(const req of p.requirements||[]){
    const s=p.scenes.find(s=>s.id===req.sceneId),a=p.characters.find(a=>a.id===req.characterId),d=p.propDesigns.find(d=>d.id===req.propId);
    if(!s)throw Error("Fidelity requirement scene missing: "+req.description);
    if(req.characterId && (!a||!s.cast.some(c=>c.characterId===a.id)))throw Error("Required character is absent: "+req.description);
    if(req.propId && (!d||!s.props.some(q=>q.designId===d.id)))throw Error("Required prop is absent: "+req.description);
    if (req.propId) {
      const placement = s.props.find((item) => item.designId === req.propId);
      const visibleFrom = Math.max(0, placement?.appearAt ?? 0);
      const visibleUntil = Math.min(s.duration, placement?.disappearAt ?? s.duration);
      if (!(visibleFrom < s.duration && visibleUntil > 0 && visibleFrom < visibleUntil))
        throw Error(`Required prop has no visible interval in scene ${s.id}: ${req.description}`);
    }
    if (req.propId && d?.type === "drawing") {
      const visual = d.visualSpec;
      const hasSpecGeometry = visual && [
        "geometryRecipe", "facialComponents", "apparel", "accessories", "decorativeMarks",
      ].some((key) => (visual[key] || []).length > 0);
      if (!(d.nodes.length > 0 || hasSpecGeometry || visual?.proceduralComponents?.length > 0))
        throw Error(`Required prop has no drawable geometry; a label alone is not object support: ${req.description}`);
    }
    if(req.color && (d||a)?.[d?"color":"outfit"].toLowerCase()!==req.color.toLowerCase())throw Error("Required colour changed: "+req.description);
    if(req.label && (d?.label||a?.shirtLabel)!==req.label)throw Error("Required physical label changed: "+req.description);
    if(req.worn && !s.props.some(q=>q.designId===req.propId && ((q.attachment?.actorId===req.characterId && q.attachment?.bone==="head") || q.attachmentEvents?.some(e=>e.at<s.duration && e.attachment?.actorId===req.characterId && e.attachment?.bone==="head"))))throw Error("Required headwear is not attached: "+req.description);
    if(req.action && !s.beats.some(b=>b.kind===req.action && (!req.characterId||b.actorId===req.characterId) && (!req.propId||b.targetId===req.propId)))throw Error("Required action has no actual beat: "+req.description+"; expected "+JSON.stringify(req)+"; actual beats "+JSON.stringify(s.beats.map(b=>({kind:b.kind,actorId:b.actorId,targetId:b.targetId}))));
  }
  for (const character of p.characters) {
    const requiredProfile = rigProfileByKind[character.kind];
    if (character.rigRequirement && character.rigRequirement.profile !== requiredProfile)
      throw Error(`Rig requirement ${character.rigRequirement.profile} does not match ${character.kind} character ${character.id}.`);
    const supportedRigCapabilities = ["dog", "cat", "lion"].includes(character.kind)
      ? new Set(["sticklaugh.motion.animal-controls.v1", "sticklaugh.motion.animal-face-controls.v1", "sticklaugh.motion.path-following.v1"])
      : new Set(["sticklaugh.motion.humanoid-pose.v1", "sticklaugh.motion.face-controls.v1", "sticklaugh.motion.hand-shapes.v1", "sticklaugh.motion.path-following.v1", "sticklaugh.motion.ground-constraint.v1"]);
    for (const capability of character.rigRequirement?.capabilities || [])
      if (!supportedRigCapabilities.has(capability))
        throw Error(`Unsupported rig capability ${capability} required by character ${character.id}.`);
  }
  const beatIds = new Set(p.scenes.flatMap((scene) => scene.beats.map((beat) => beat.id).filter(Boolean)));
  for (const design of p.propDesigns) {
    for (const eventId of design.contactEventIds || [])
      if (!beatIds.has(eventId))
        throw Error(`Unknown contact event ${eventId} on prop ${design.id}.`);
    if (design.rightsStatus === "restricted" && design.optionalSourceAsset)
      throw Error(`Restricted source asset cannot be attached to prop ${design.id}.`);
    const shapeCapability = `sticklaugh.shape.${design.type}.v1`;
    if (design.assetCapabilities?.length && !design.assetCapabilities.includes(shapeCapability))
      throw Error(`Prop ${design.id} must declare its registered renderer capability ${shapeCapability}.`);
  }
  const generatedIds = new Set();
  for (const asset of p.generatedAssetRefs) {
    if (generatedIds.has(asset.assetId)) throw Error(`Duplicate generated asset reference ${asset.assetId}.`);
    generatedIds.add(asset.assetId);
    if (asset.rightsStatus === "restricted")
      throw Error(`Restricted generated asset ${asset.assetId} cannot be used in a plan.`);
  }
  const fps = p.renderFps || 30;
  const boundaries = cumulativeFrameBoundaries(p.scenes.map((scene) => scene.duration), fps);
  p.schemaVersion = 2;
  p.seed ??= replaySeed(p);
  p.provenance ??= {
    origin: "legacy-migration",
    sourceSchemaVersion: 1,
    generator: "legacy-import",
  };
  for (const [index, scene] of p.scenes.entries()) {
    scene.sceneSeed ??= sceneSeedFor(p.seed, scene.id);
    scene.canonicalFrame = {
      fps,
      startFrame: boundaries[index],
      endFrame: boundaries[index + 1],
      interval: "[startFrame,endFrame)",
    };
  }
  p.replay = {
    schemaVersion: 1,
    planHash: "",
    seed: p.seed,
    fps,
    totalFrames: boundaries.at(-1),
    frameRounding: "nearest",
    evaluator: "sticklaugh-frame-evaluator-v1",
  };
  p.replay.planHash = replayPlanHash(p);
  return p;
}

// Explicit name for callers migrating saved pre-Point-8 plans. The regular
// validator uses the same deterministic adapter so legacy fixtures still load.
export function migratePlan(input) {
  return validatePlan(input);
}

export function verifyReplayPlan(input) {
  if (!input?.replay || input.schemaVersion !== 2) return false;
  return input.replay.schemaVersion === 1
    && input.replay.seed === input.seed
    && input.replay.planHash === replayPlanHash(input);
}
export const durationOf = (p) => p.scenes.reduce((n, s) => n + s.duration, 0);
export function jsonSchema(s) {
  const r = z.toJSONSchema(s,{reused:"ref"});
  delete r.$schema;
  return r;
}
