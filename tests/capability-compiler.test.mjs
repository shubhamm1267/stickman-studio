import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CapabilityCompilationError } from "../shared/capability-compiler.mjs";
import {
  assertPlanCapabilityManifest,
  compileDirectorCapabilities,
  diagnoseDirectorCapabilities,
  plannerCapabilityData,
} from "../shared/capability-compiler.mjs";
import { JobQueue } from "../server/queue.mjs";

const validScore = ({
  name = "Character With An Unusual Display Label",
  kind = "man",
  firstVerb = "wave",
  firstEvent = {},
  props = [],
  blockedReasons = [],
} = {}) => ({
  title: "A small physical gag",
  story: "A character waves, then reacts to a quiet surprise.",
  comedy: {
    hook: "A clear movement catches the eye.",
    goal: "The character tries to greet an ordinary object.",
    escalation: ["The first gesture gets no response."],
    payoff: "The character reacts to the silence.",
    callback: "The gesture is repeated more carefully.",
  },
  seo: {
    titles: ["A small visual comedy"],
    description: "A short, nonverbal physical comedy.",
    tags: ["comedy"],
    hashtags: [],
    pinnedComment: "",
    thumbnailText: "A quiet greeting",
  },
  characters: [{ id: "actor_1", name, kind, slot: "center" }],
  props: props.map((prop) => ({
    slot: "center",
    height: "table",
    scale: 0.8,
    ...prop,
  })),
  scenes: [{
    id: "scene_1",
    summary: "A greeting becomes a small visual gag.",
    background: "kitchen",
    events: [
      {
        id: "action_1",
        actorId: "actor_1",
        verb: firstVerb,
        description: "The character makes a visible first gesture.",
        duration: 1,
        ...firstEvent,
      },
      {
        id: "action_2",
        actorId: "actor_1",
        verb: "react",
        description: "The character reacts to what happened.",
        duration: 1,
      },
    ],
  }],
  blockedReasons,
});

test("capability manifest separates statuses and maps stable primitive IDs to renderer actions", () => {
  assert.equal(assertPlanCapabilityManifest(), true);
  const manifest = plannerCapabilityData();
  assert.deepEqual(manifest.statuses, [
    "supported",
    "approximated_with_disclosure",
    "unsupported",
  ]);
  assert.equal(manifest.dispatch.key, "primitiveId");
  assert.ok(manifest.dispatch.neverDispatchBy.includes("characterName"));
  assert.ok(manifest.primitives.every((primitive) => primitive.lowersTo.length > 0));
  assert.equal(
    manifest.primitives.find((primitive) => primitive.id === "fly").status,
    "approximated_with_disclosure",
  );
  assert.ok(manifest.nonCapabilities.includes("general rigid-body physics"));
});

test("display names do not select behavior or create a false unsupported-name error", () => {
  const report = compileDirectorCapabilities(validScore({
    name: "X Æ A-12, The Lantern's Guest",
  }));
  assert.equal(report.status, "supported");
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.actions[0].entityId, "actor_1");
  assert.equal(report.actions[0].primitiveId, "wave");
});

test("supported 2D prop flight is labeled as an approximation and disclosed", () => {
  const report = compileDirectorCapabilities(validScore({
    firstVerb: "fly",
    firstEvent: { targetId: "prop_1", destination: "table" },
    props: [{ id: "prop_1", name: "unfamiliar label", type: "balloon" }],
  }));
  assert.equal(report.status, "approximated_with_disclosure");
  assert.equal(report.actions[0].entityId, "prop_1");
  assert.equal(report.actions[0].status, "approximated_with_disclosure");
  assert.match(report.disclosures.join(" "), /2D rigid-object arc/);
});

test("unsupported anatomy returns complete structured diagnostics and safe recovery options", () => {
  const invalid = validScore({ kind: "centaur" });
  const diagnostics = diagnoseDirectorCapabilities(invalid);
  assert.ok(diagnostics.length);
  assert.deepEqual(
    {
      status: diagnostics[0].status,
      sceneId: diagnostics[0].sceneId,
      entityId: diagnostics[0].entityId,
      actionId: diagnostics[0].actionId,
      unmetCapability: diagnostics[0].unmetCapability,
      offendingField: diagnostics[0].offendingField,
    },
    {
      status: "unsupported",
      sceneId: "scene_1",
      entityId: "actor_1",
      actionId: null,
      unmetCapability: "rig.centaur",
      offendingField: "characters[0].kind",
    },
  );
  assert.ok(diagnostics[0].safeRecoveryOptions.length >= 2);
  assert.throws(
    () => compileDirectorCapabilities(invalid),
    (error) => error.capabilityDiagnostics?.[0]?.unmetCapability === "rig.centaur",
  );
});

test("unknown action names are structured unsupported primitives, not silent no-ops", () => {
  const invalid = validScore({
    firstVerb: "teleport",
    firstEvent: {},
  });
  const [diagnostic] = diagnoseDirectorCapabilities(invalid);
  assert.equal(diagnostic.sceneId, "scene_1");
  assert.equal(diagnostic.entityId, "actor_1");
  assert.equal(diagnostic.actionId, "action_1");
  assert.equal(diagnostic.unmetCapability, "primitive.teleport");
  assert.equal(diagnostic.offendingField, "scenes[0].events[0].verb");
  assert.ok(diagnostic.safeRecoveryOptions.some((option) => /supported primitive/.test(option)));
});

test("animal rig motion and unsupported prop mechanics are rejected by capability, not label", () => {
  const animalMotion = validScore({
    kind: "dog",
    firstVerb: "sit",
  });
  const [animalDiagnostic] = diagnoseDirectorCapabilities(animalMotion);
  assert.equal(animalDiagnostic.unmetCapability, "rig.animal.primitive.sit");
  assert.equal(animalDiagnostic.offendingField, "scenes[0].events[0].verb");

  const openedDrawing = validScore({
    firstVerb: "open",
    firstEvent: { targetId: "prop_1" },
    props: [{ id: "prop_1", name: "ordinary object", type: "drawing" }],
  });
  const propDiagnostic = diagnoseDirectorCapabilities(openedDrawing)
    .find((diagnostic) => diagnostic.code === "unsupported-prop-interaction");
  assert.equal(propDiagnostic.entityId, "prop_1");
  assert.equal(propDiagnostic.unmetCapability, "prop.jar-articulated-open");
  assert.equal(propDiagnostic.offendingField, "scenes[0].events[0].targetId");

  const humanAnimalAction = validScore({ firstVerb: "cower" });
  const humanDiagnostic = diagnoseDirectorCapabilities(humanAnimalAction)
    .find((diagnostic) => diagnostic.code === "unsupported-action-for-rig");
  assert.equal(humanDiagnostic.unmetCapability, "rig.humanoid.primitive.cower");
  assert.equal(humanDiagnostic.offendingField, "scenes[0].events[0].verb");
});

test("unsupported keyframe controls identify the exact rig, action, and field", () => {
  const invalid = validScore({
    kind: "dog",
    firstVerb: "perform",
    firstEvent: {
      keyframes: [
        { at: 0, pose: { position: [0, 0] } },
        { at: 1, pose: { rightHand: [20, -40] } },
      ],
    },
  });
  const diagnostic = diagnoseDirectorCapabilities(invalid)
    .find((item) => item.code === "unsupported-motion-control");
  assert.equal(diagnostic.sceneId, "scene_1");
  assert.equal(diagnostic.entityId, "actor_1");
  assert.equal(diagnostic.actionId, "action_1");
  assert.equal(diagnostic.unmetCapability, "motion.control.rightHand");
  assert.equal(
    diagnostic.offendingField,
    "scenes[0].events[0].keyframes[1].pose.rightHand",
  );
});

test("blocked semantic requirements become structured diagnostics instead of text-only blockers", () => {
  const invalid = validScore({
    blockedReasons: ["requires liquid to splash"],
  });
  const [diagnostic] = diagnoseDirectorCapabilities(invalid);
  assert.equal(diagnostic.code, "blocked-requirement");
  assert.equal(diagnostic.sceneId, "scene_1");
  assert.equal(diagnostic.entityId, "actor_1");
  assert.equal(diagnostic.actionId, "action_1");
  assert.equal(diagnostic.offendingField, "blockedReasons[0]");
});

test("failed plan jobs retain structured capability diagnostics for clients", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "capability-queue-"));
  const queue = new JobQueue(directory);
  try {
    const diagnostics = diagnoseDirectorCapabilities(
      validScore({ kind: "centaur" }),
    );
    const job = await queue.add(
      "plan",
      async () => {
        throw new CapabilityCompilationError(diagnostics);
      },
      {},
    );
    let completed;
    for (let attempt = 0; attempt < 100; attempt++) {
      completed = queue.public(job.id);
      if (completed?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(completed.status, "failed");
    assert.deepEqual(completed.capabilityDiagnostics, diagnostics);
    assert.match(completed.error, /structured diagnostic/);
  } finally {
    await queue.close();
    await rm(directory, { recursive: true, force: true });
  }
});