import { ACTIONS, MOTION_CAPABILITIES } from "./schema.mjs";
import { DIRECTOR_ACTIONS, DirectorScoreSchema } from "./director-score.mjs";

export const CAPABILITY_STATUSES = Object.freeze([
  "supported",
  "approximated_with_disclosure",
  "unsupported",
]);

const ANIMAL_KINDS = new Set(["dog", "cat", "lion"]);
const KNOWN_CHARACTER_KINDS = new Set([
  "man",
  "woman",
  "grandma",
  "child",
  ...ANIMAL_KINDS,
]);
const ANIMAL_ACTIONS = new Set([
  "approach",
  "walk",
  "run",
  "press",
  "jump",
  "react",
  "sneeze",
  "perform",
  "fly",
  "roar",
  "cower",
  "pawPress",
]);
const ANIMAL_ONLY_ACTIONS = new Set(["roar", "cower", "pawPress"]);
const APPROXIMATIONS = Object.freeze({
  fly: {
    capability: "prop.rigid-2d-trajectory",
    disclosure:
      "Prop flight is a deterministic 2D rigid-object arc; it does not simulate general rigid-body physics or deformation.",
  },
  jump: {
    capability: "actor.root-vertical-arc",
    disclosure:
      "Jump uses a deterministic 2D root-height arc, not a full-body physical simulation.",
  },
  fall: {
    capability: "actor.side-landing-preset",
    disclosure:
      "Fall uses the registered side-landing pose preset; it does not simulate arbitrary collisions.",
  },
  slip: {
    capability: "actor.side-landing-preset",
    disclosure:
      "Slip uses the registered side-landing pose preset; it does not simulate arbitrary collisions.",
  },
});
const PLAN_LOWERING = Object.freeze({
  approach: ["walk"],
  walk: ["walk"],
  run: ["run"],
  press: ["perform", "pawPress"],
  strain: ["perform"],
  liftAttempt: ["perform"],
  grab: ["perform", "pick"],
  place: ["place"],
  throw: ["throw"],
  fly: ["prop-motion/rigid-arc", "react"],
  punch: ["walk", "punch"],
  slip: ["perform"],
  fall: ["perform"],
  jump: ["jump"],
  sit: ["perform"],
  stand: ["stand"],
  headHold: ["perform"],
  point: ["point"],
  duck: ["duck"],
  cower: ["cower"],
  roar: ["roar"],
  pawPress: ["pawPress"],
  react: ["react"],
  laugh: ["laugh"],
  cry: ["cry"],
  scold: ["scold"],
  wave: ["wave"],
  dance: ["dance"],
  sneeze: ["sneeze"],
  fart: ["fart"],
  nosePinch: ["nosePinch"],
  flex: ["flex"],
  deflate: ["deflate"],
  open: ["open"],
  perform: ["perform"],
});

const RECOVERY = Object.freeze({
  unsupportedAction: [
    "Choose an action ID from the supported primitive list while preserving the requested visible event.",
    "Split the event into multiple supported primitives only when that preserves the story's physical outcome.",
    "Revise the requirement explicitly if no supported primitive can preserve it; do not silently omit or relabel the action.",
  ],
  unsupportedRigAction: [
    "Choose a primitive supported by this rig, or an explicitly supported keyframed control.",
    "Change the rig only if the story permits that anatomy; do not silently substitute a different body type.",
    "Revise the requested motion explicitly when the required anatomy is not implemented.",
  ],
  unsupportedControl: [
    "Use only controls listed for this rig in the capability manifest.",
    "Replace the custom motion with supported named primitives if they preserve the requested event.",
    "Revise the requested motion explicitly if no supported control can express it.",
  ],
  unsupportedAnatomy: [
    "Use a registered rig kind only if it preserves the requested anatomy.",
    "Reduce the request to supported rig controls only with explicit approval of the changed motion.",
    "Keep the requirement blocked rather than rendering a misleading substitute.",
  ],
  unsupportedPropAction: [
    "Use a registered prop design and its implemented interaction capability.",
    "Keep the prop unchanged and choose another supported action if the story permits.",
    "Revise the requirement explicitly; do not imply unsupported joints, tearing, inflation, liquid motion, or deformation.",
  ],
});

const HUMANOID_PRIMITIVES = new Set(DIRECTOR_ACTIONS);
const ANIMAL_PRIMITIVE_LIST = [...ANIMAL_ACTIONS];

const primitiveStatus = (verb) =>
  APPROXIMATIONS[verb]
    ? "approximated_with_disclosure"
    : "supported";

export function plannerCapabilityData() {
  return {
    contractVersion: 1,
    dispatch: {
      key: "primitiveId",
      entityKey: "entityId",
      neverDispatchBy: ["displayName", "characterName", "propName", "storyText"],
    },
    statuses: [...CAPABILITY_STATUSES],
    rigs: {
      humanoid: {
        kinds: ["man", "woman", "grandma", "child"],
        primitiveIds: [...HUMANOID_PRIMITIVES],
        controls: [...MOTION_CAPABILITIES.rigControls.humanoid],
        constraints: [...MOTION_CAPABILITIES.rigConstraints.humanoid],
      },
      animal: {
        kinds: [...ANIMAL_KINDS],
        primitiveIds: ANIMAL_PRIMITIVE_LIST,
        controls: [...MOTION_CAPABILITIES.rigControls.animal],
        constraints: [...MOTION_CAPABILITIES.rigConstraints.animal],
      },
    },
    primitives: DIRECTOR_ACTIONS.map((id) => ({
      id,
      status: primitiveStatus(id),
      lowersTo: [...PLAN_LOWERING[id]],
      ...(APPROXIMATIONS[id]
        ? {
            capability: APPROXIMATIONS[id].capability,
            disclosure: APPROXIMATIONS[id].disclosure,
          }
        : {}),
    })),
    nonCapabilities: [
      "arbitrary executable expressions",
      "arbitrary rig topology or unregistered anatomy",
      "general rigid-body physics",
      "liquid simulation",
      "automatic tearing, inflation, or arbitrary deformation",
      "unregistered joints or articulated prop mechanisms",
    ],
  };
}

function makeDiagnostic({
  code,
  sceneId,
  entityId,
  actionId,
  unmetCapability,
  offendingField,
  recovery = "unsupportedAction",
}) {
  return {
    code,
    severity: "error",
    status: "unsupported",
    sceneId: sceneId ?? null,
    entityId: entityId ?? null,
    actionId: actionId ?? null,
    unmetCapability,
    offendingField,
    safeRecoveryOptions: [...RECOVERY[recovery]],
  };
}

function actorKindFor(event, characters) {
  const actorId = event?.actorId ?? event?.characterId;
  const actor =
    characters.find((candidate) => candidate?.id === actorId) ??
    (characters.length === 1 && !actorId ? characters[0] : null);
  return { actorId: actor?.id ?? actorId ?? null, actor };
}

function effectivePropTarget(event, props) {
  const targetId = event?.targetId ?? event?.targetPropId ?? event?.propId;
  if (targetId && props.some((prop) => prop?.id === targetId)) return targetId;
  // The semantic compiler supports the legacy form where a flying prop is
  // authored as actorId; this is a technical-ID adapter, not name dispatch.
  if (event?.verb === "fly" && props.some((prop) => prop?.id === event?.actorId))
    return event.actorId;
  return targetId ?? null;
}

function diagnoseRawCapabilities(input) {
  const diagnostics = [];
  const characters = Array.isArray(input?.characters) ? input.characters : [];
  const props = Array.isArray(input?.props) ? input.props : [];
  const scenes = Array.isArray(input?.scenes) ? input.scenes : [];
  const knownVerbs = new Set(DIRECTOR_ACTIONS);
  const knownControls = new Set(MOTION_CAPABILITIES.rigControls.humanoid);
  const animalControls = new Set(MOTION_CAPABILITIES.rigControls.animal);

  for (const character of characters) {
    if (typeof character?.kind === "string" && !KNOWN_CHARACTER_KINDS.has(character.kind)) {
      const relatedScene = scenes.find((scene) =>
        (scene?.events || []).some(
          (event) =>
            (event?.actorId ?? event?.characterId) === character?.id,
        ),
      );
      diagnostics.push(
        makeDiagnostic({
          code: "unsupported-anatomy",
          sceneId: relatedScene?.id,
          entityId: character?.id,
          actionId: null,
          unmetCapability: `rig.${character.kind}`,
          offendingField: `characters[${characters.indexOf(character)}].kind`,
          recovery: "unsupportedAnatomy",
        }),
      );
    }
  }

  for (const [index, reason] of (Array.isArray(input?.blockedReasons)
    ? input.blockedReasons
    : []).entries()) {
    if (typeof reason !== "string" || !reason.trim()) continue;
    const scene = scenes[0];
    const firstEvent = scene?.events?.[0];
    diagnostics.push(
      makeDiagnostic({
        code: "blocked-requirement",
        sceneId: scene?.id,
        entityId:
          firstEvent?.actorId ??
          firstEvent?.characterId ??
          firstEvent?.targetId ??
          null,
        actionId: firstEvent?.id,
        unmetCapability: "animation.requirement-not-implemented",
        offendingField: `blockedReasons[${index}]`,
        recovery: "unsupportedAction",
      }),
    );
  }

  for (const [sceneIndex, scene] of scenes.entries()) {
    for (const [eventIndex, event] of (scene?.events || []).entries()) {
      const field = `scenes[${sceneIndex}].events[${eventIndex}]`;
      const { actorId, actor } = actorKindFor(event, characters);
      const entityId =
        event?.verb === "fly"
          ? effectivePropTarget(event, props) ?? actorId
          : actorId;
      if (typeof event?.verb === "string" && !knownVerbs.has(event.verb)) {
        diagnostics.push(
          makeDiagnostic({
            code: "unsupported-primitive",
            sceneId: scene?.id,
            entityId,
            actionId: event?.id,
            unmetCapability: `primitive.${event.verb}`,
            offendingField: `${field}.verb`,
            recovery: "unsupportedAction",
          }),
        );
        continue;
      }

      if (event?.verb === "fly") {
        const targetId = effectivePropTarget(event, props);
        if (!targetId || !props.some((prop) => prop?.id === targetId)) {
          diagnostics.push(
            makeDiagnostic({
              code: "missing-prop-motion-target",
              sceneId: scene?.id,
              entityId,
              actionId: event?.id,
              unmetCapability: "prop.rigid-2d-trajectory",
              offendingField: `${field}.targetId`,
              recovery: "unsupportedPropAction",
            }),
          );
        }
      }

      const animalRig = actor && ANIMAL_KINDS.has(actor.kind);
      if (
        actor &&
        ((animalRig && !ANIMAL_ACTIONS.has(event?.verb)) ||
          (!animalRig && ANIMAL_ONLY_ACTIONS.has(event?.verb)))
      ) {
        diagnostics.push(
          makeDiagnostic({
            code: "unsupported-action-for-rig",
            sceneId: scene?.id,
            entityId: actorId,
            actionId: event?.id,
            unmetCapability: `rig.${animalRig ? "animal" : "humanoid"}.primitive.${event?.verb}`,
            offendingField: `${field}.verb`,
            recovery: "unsupportedRigAction",
          }),
        );
      }

      if (event?.verb === "open") {
        const targetId = event?.targetId ?? event?.propId;
        const target = props.find((prop) => prop?.id === targetId);
        if (target && target.type !== "jar") {
          diagnostics.push(
            makeDiagnostic({
              code: "unsupported-prop-interaction",
              sceneId: scene?.id,
              entityId: targetId,
              actionId: event?.id,
              unmetCapability: "prop.jar-articulated-open",
              offendingField: `${field}.targetId`,
              recovery: "unsupportedPropAction",
            }),
          );
        }
      }

      if (event?.verb === "perform") {
        if (!Array.isArray(event?.keyframes)) {
          diagnostics.push(
            makeDiagnostic({
              code: "missing-performance-keyframes",
              sceneId: scene?.id,
              entityId: actorId,
              actionId: event?.id,
              unmetCapability: "motion.keyframed-performance",
              offendingField: `${field}.keyframes`,
              recovery: "unsupportedControl",
            }),
          );
          continue;
        }
        const supportedControls =
          actor && ANIMAL_KINDS.has(actor.kind) ? animalControls : knownControls;
        for (const [keyIndex, keyframe] of event.keyframes.entries()) {
          for (const control of Object.keys(keyframe?.pose || {})) {
            if (!supportedControls.has(control)) {
              diagnostics.push(
                makeDiagnostic({
                  code: "unsupported-motion-control",
                  sceneId: scene?.id,
                  entityId: actorId,
                  actionId: event?.id,
                  unmetCapability: `motion.control.${control}`,
                  offendingField: `${field}.keyframes[${keyIndex}].pose.${control}`,
                  recovery: "unsupportedControl",
                }),
              );
            }
          }
          if (
            actor &&
            ANIMAL_KINDS.has(actor.kind) &&
            (keyframe?.leftHandShape || keyframe?.rightHandShape)
          ) {
            const offendingField = keyframe?.leftHandShape
              ? `${field}.keyframes[${keyIndex}].leftHandShape`
              : `${field}.keyframes[${keyIndex}].rightHandShape`;
            diagnostics.push(
              makeDiagnostic({
                code: "unsupported-motion-control",
                sceneId: scene?.id,
                entityId: actorId,
                actionId: event?.id,
                unmetCapability: "motion.control.handShape",
                offendingField,
                recovery: "unsupportedControl",
              }),
            );
          }
        }
      }
    }
  }
  return diagnostics;
}

export class CapabilityCompilationError extends Error {
  constructor(diagnostics) {
    super(
      `Unsupported animation capabilities: ${diagnostics.length} structured diagnostic(s).`,
    );
    this.name = "CapabilityCompilationError";
    this.capabilityDiagnostics = diagnostics;
  }
}

export function compileDirectorCapabilities(input) {
  const diagnostics = diagnoseRawCapabilities(input);
  if (diagnostics.length) throw new CapabilityCompilationError(diagnostics);

  // Keep the complete strict Zod contract authoritative after capability
  // analysis; the compiler never widens or strips the model schema.
  const score = DirectorScoreSchema.parse(input);
  const actionResults = [];
  const disclosures = [];
  for (const scene of score.scenes) {
    for (const event of scene.events) {
      const { actorId, actor } = actorKindFor(event, score.characters);
      const entityId =
        event.verb === "fly"
          ? effectivePropTarget(event, score.props) ?? actorId
          : actorId;
      const approximation = APPROXIMATIONS[event.verb];
      const result = {
        sceneId: scene.id,
        entityId,
        actionId: event.id,
        primitiveId: event.verb,
        status: approximation
          ? "approximated_with_disclosure"
          : "supported",
        ...(actor?.kind
          ? { rigProfile: ANIMAL_KINDS.has(actor.kind) ? "animal" : "humanoid" }
          : {}),
        ...(approximation ? { disclosure: approximation.disclosure } : {}),
      };
      actionResults.push(result);
      if (result.disclosure && !disclosures.includes(result.disclosure))
        disclosures.push(result.disclosure);
    }
  }
  return {
    score,
    status: disclosures.length
      ? "approximated_with_disclosure"
      : "supported",
    actions: actionResults,
    disclosures,
    diagnostics: [],
    plannerCapabilities: plannerCapabilityData(),
  };
}

// This pre-Zod diagnostic path is used only when the strict provider schema
// rejects a generated value, so unsupported names/anatomy can still be
// explained with source coordinates rather than silently retried as prose.
export function diagnoseDirectorCapabilities(input) {
  return diagnoseRawCapabilities(input);
}

export function assertPlanCapabilityManifest() {
  const missing = DIRECTOR_ACTIONS.filter(
    (action) =>
      !Object.hasOwn(PLAN_LOWERING, action) ||
      PLAN_LOWERING[action].some(
        (lowering) =>
          !lowering.startsWith("prop-motion/") && !ACTIONS.includes(lowering),
      ),
  );
  if (missing.length) {
    throw new Error(
      `Semantic primitive registry references unknown Plan actions: ${missing.join(", ")}.`,
    );
  }
  return true;
}