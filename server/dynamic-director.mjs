import { compileStylePerformance } from '../shared/style-performance.mjs';
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
  'wardrobe', 'accessory', 'build', 'headWidth', 'headHeight', 'costume'
]);

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
  const types = new Set(outline.propDesigns.map(p => p.type));

  const needsType = {
    hold: ['jar'],
    struggle: ['jar'],
    tap: ['jar'],
    open: ['jar'],
    pullPaper: ['paperRoll'],
    wrap: ['paperRoll'],
    tearFree: ['paperRoll'],
    openDoor: ['door'],
    drink: ['cup', 'can', 'bottle']
  };

  const kinds = ACTIONS.filter(
    k => !needsType[k] || needsType[k].some(type => types.has(type))
  );

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

  const schema = DynamicSceneSchema.extend({ scene });
  schema.normalizeGeneratedValue = normalizeDirectedScene;

  return schema;
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
  let feedback = '', userReason = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();

    try {
      return await operation(feedback);
    } catch (error) {
      if (
        signal?.aborted ||
        /Provider HTTP|API key is required|truncated/.test(error.message)
      ) {
        throw error;
      }

      userReason = error.issues?.length
        ? 'Invalid animation fields: ' +
        error.issues.slice(0, 4)
          .map(issue => issue.path.join('.'))
          .join(', ')
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

  throw Error(
    `${label} could not be completed: ${userReason}. Completed stages are saved; retry to resume.`
  );
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

  const guide = (await dynamicGuide()) +
    "\n" +
    referenceStyleInstructions(options.referenceStyle) +
    `\nACTUAL beat.kind values: ${ACTIONS.join(", ")}. Never use watch, smile, surprised, spin, startFan as kind. Opening a mouth is a pose mouthAperture, never the jar-only open action. A fan starts through a blade rotation partTrack, not open/hold/tap. Watching/smiling use react with emotion/pose, custom with pose, or perform with real normalized pose keys. Machinery movements belong in partTracks and are paired with a timed actor reaction/performance beat.`;

  let category = options.category === 'auto'
    ? 'family-comedy'
    : options.category || 'family-comedy';

  const checkpoint = checkpointRunner({
    enabled: fetcher === fetch,
    progress
  });

  const stagedRetry = (label, input, operation) =>
    checkpoint(
      label,
      { guide, input },
      () => retry(label, operation, signal, progress)
    );

  progress('Gemini: story, identities and visual requirements', 5);

  // =====================================================
  // STORY OUTLINE GENERATION
  // =====================================================

  let outline = await stagedRetry(
    'Story outline',
    { options, contract: 3 },
    async feedback => {
      const value = await geminiJSON(
        `${guide}\n${comedyCategoryInstructions(options)}\n${durationInstruction(options)}\nWrite the COMPLETE story and scene outline for ${options.story?.trim() || 'an original short visual comedy'}. Keep every explicit requested entity/action. Language ${options.language || 'hi'}, format ${options.format || 'shorts'}. Set all novel props to drawing. Character kind selects a base rig only; the next pass designs custom art. Supply requiredAppearanceFeatures for characters and visualAssetRequest.description/requiredFeatures for props. Omit visualSpec and geometry now. Never emit rigRequirement, visualEvidence, contactEventIds, optionalSourceAsset or assetCapabilities; the compiler owns those execution records. Requirements describe events, identity, color and wear only. Do not preassign native action codes; choreography chooses those after the asset parts exist. Every character has an explicit ageYears. Fill coverage and blockedReasons honestly. Do not fabricate successful execution. Previous validation: ${feedback}`,
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
        : undefined
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

    const result = await stagedRetry(
      `Design ${design.name}`,
      {
        design,
        story: outline.story,
        scenes: outline.scenes
      },
      async feedback => {
        const asset = await geminiJSON(
          `${guide}\nDesign ONE asset: ${JSON.stringify(design)}. Story: ${outline.story}. Scenes: ${JSON.stringify(outline.scenes)}. Draw identifiable geometry, with named group parts for ALL required movements. Characters may overlay native rigs or replace with complete art. All drawing props need complete geometry. Use renderMode replace for a redesigned native prop. Do not add animation yet; choreography is next. Required features indexed from zero: ${JSON.stringify(requested.map((feature, featureIndex) => ({ featureIndex, feature })))}. In features use featureIndex to map EVERY required feature to actual nodeIds. With renderMode overlay you may instead use nativeProperties for features already rendered by the existing character (such as hairStyle and hair); do not draw duplicate faces or duplicate limbs. Omit globalTransform/localTransform and assetSource entirely. Previous validation: ${feedback}`,
          AssetSchema,
          credentials,
          signal,
          fetcher
        );

        try {
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
                design[property] === undefined
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

          return asset;
        } catch (error) {
          error.generatedValue = asset;
          throw error;
        }
      }
    );

    design.visualSpec = result.visualSpec;
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

    plan = await stagedRetry(
      `Scene ${summary.id}`,
      { plan, summary, contract: 3 },
      async feedback => {
        const directed = await geminiJSON(
          `${guide}\n${comedyCategoryInstructions(options)}\nDirect exactly scene ${JSON.stringify(summary)}. Allowed actorId/characterId values: ${outline.characters.map(c => c.id).join(", ")}. Allowed designId/targetId values: ${outline.propDesigns.map(c => c.id).join(", ")}. Never use cast placement IDs as actorId. Preserve id and duration. Whole story and all reusable designs: ${JSON.stringify({ ...outline, scenes: outline.scenes })}. Already directed scenes (preserve continuity): ${JSON.stringify(plan.scenes)}. Required events indexed from zero: ${JSON.stringify(requiredEvents.map((c, eventIndex) => ({ eventIndex, storyEvent: c.storyEvent })))}. Return scene, partTracks and coverage linking EVERY listed eventIndex to real beatIndices. Use eventIndex to identify the event; do not paraphrase identifiers. Include all visible motion, reactions, camera and precise Freesound cues. A sound with actorId MUST have role nonverbal (gasp/laugh/grunt). Mechanical and footstep effects have role effect and MUST omit actorId. For event coverage place a real timed actor beat (perform/custom/native) corresponding to each event; machine movement must also have real partTracks. Omit cast/prop/beat/sound placement id fields: the canonical compiler assigns execution IDs. Put all human performance keyframes directly on perform beats. Do not emit motionIR or motionTrackId; the engine compiles those later. Dialogue empty. Previous error: ${feedback}`,
          sceneSchemaFor(outline),
          credentials,
          signal,
          fetcher
        );

        try {
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
              ].map(k => [k, plan[k]])
            ),

            scenes: candidate.scenes.map(
              scene => normalizeDirectedScene({ scene }).scene
            )
          };

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