import { clamp, lerp, motionEase } from "./math.mjs";

const LIMIT = 1500;
const MAX_POINTS = 16;
const EASINGS = new Set(["smooth", "snappy", "gentle"]);

// Path positions are absolute stage coordinates in the project's y-down space.
// The sampler is pure: evaluating the same path at the same fraction is stable.
export function validateMotionPath(points, label = "Motion path") {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS)
    throw Error(`${label}: expected 2–${MAX_POINTS} points.`);

  for (const [index, point] of points.entries()) {
    if (
      !point ||
      !Number.isFinite(point.at) ||
      point.at < 0 ||
      point.at > 1 ||
      !Array.isArray(point.position) ||
      point.position.length !== 2 ||
      point.position.some(
        (value) => !Number.isFinite(value) || value < -LIMIT || value > LIMIT,
      ) ||
      (point.timing !== undefined && !EASINGS.has(point.timing))
    )
      throw Error(`${label}: invalid point ${index}.`);
  }

  if (
    points[0].at !== 0 ||
    points.at(-1).at !== 1 ||
    points.some((point, index) => index && point.at <= points[index - 1].at)
  )
    throw Error(`${label}: points must increase strictly from zero to one.`);

  return true;
}

export function sampleMotionPath(points, fraction) {
  const f = clamp(fraction);
  for (let index = 1; index < points.length; index++) {
    const next = points[index];
    if (f > next.at) continue;
    const previous = points[index - 1];
    const local = (f - previous.at) / (next.at - previous.at);
    return lerp(
      previous.position,
      next.position,
      motionEase(local, next.timing || "smooth"),
    );
  }
  return [...points.at(-1).position];
}