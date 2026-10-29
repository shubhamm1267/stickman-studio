import {PART_MOTION_CAPABILITIES} from "../shared/part-motion.mjs";
import {ACTIONS, MOTION_CAPABILITIES} from "../shared/schema.mjs";
import {findBrowser} from "./browser.mjs";
import {listSceneCompilers} from "./scene-compile.mjs";
import {assertPlanCapabilityManifest,plannerCapabilityData} from "../shared/capability-compiler.mjs";
import {VISUAL_CAPABILITY_MANIFEST} from "../shared/visual-capability-manifest.mjs";
import {getGeometryComponentManifest} from "../shared/geometry-library.mjs";

// Describes implemented runtime capabilities only; it does not grant support
// for new entity types, renderer operations, or arbitrary executable plugins.
export async function discoverCapabilities() {
  assertPlanCapabilityManifest();
  let browserAvailable = false;
  try {
    browserAvailable = Boolean(await findBrowser());
  } catch {
    // A bad optional browser setting is a reported limitation, not a route crash.
  }
  return {
    contractVersion: 1,
    plan: {
      version: 1,
      actionKinds: [...ACTIONS],
    },
    motion: structuredClone(MOTION_CAPABILITIES),
    articulatedVisuals:PART_MOTION_CAPABILITIES,
    capabilityCompiler: plannerCapabilityData(),
    visual: {
      ...VISUAL_CAPABILITY_MANIFEST,
      proceduralComponents: getGeometryComponentManifest().map((component) => ({
        ...component,
        attachmentSpaces: ["root", "head", "torso", "leftHand", "rightHand", "leftFoot", "rightFoot"],
        layers: ["behind", "overlay", "foreground"],
        fallback:
          "Use this component's bounded options or draw an equivalent with the supported geometryRecipe node kinds.",
      })),
    },
    sceneCompilers: listSceneCompilers(),
    rendering: {
      engine: "remotion",
      chromiumAvailable: browserAvailable,
    },
  };
}