import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonical(value[key])]),
  );
}

function sortedPlan(input) {
  const plan = structuredClone(input);
  plan.characters?.sort((a, b) => a.id.localeCompare(b.id));
  plan.propDesigns?.sort((a, b) => a.id.localeCompare(b.id));
  for (const scene of plan.scenes || []) {
    scene.cast?.sort((a, b) => a.characterId.localeCompare(b.characterId));
    scene.props?.sort((a, b) =>
      `${a.designId}:${a.x}:${a.y}:${a.layer || ""}`.localeCompare(
        `${b.designId}:${b.x}:${b.y}:${b.layer || ""}`,
      ),
    );
  }
  return plan;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function replaySeed(input) {
  const plan = structuredClone(input);
  delete plan.seed;
  delete plan.replay;
  delete plan.provenance;
  delete plan.generatedAssetRefs;
  delete plan.schemaVersion;
  delete plan.review;
  return createHash("sha256")
    .update(JSON.stringify(canonical(sortedPlan(plan))))
    .digest()
    .readUInt32BE(0);
}

export function sceneSeedFor(seed, sceneId) {
  return createHash("sha256")
    .update(`sticklaugh-scene-seed-v1:${seed}:${sceneId}`)
    .digest()
    .readUInt32BE(0);
}

export function replayPlanHash(input) {
  const plan = sortedPlan(input);
  delete plan.review;
  if (plan.replay) delete plan.replay.planHash;
  return hash(JSON.stringify(canonical(plan)));
}
