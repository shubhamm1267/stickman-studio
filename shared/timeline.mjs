import {
  cumulativeFrameBoundaries,
  secondsToFrame,
} from "./frame-clock.mjs";

// Scene boundaries use exact decimal accumulation and nearest-frame quantization.
export function timeline(plan) {
  const fps = plan.renderFps || 30;
  const boundaries = cumulativeFrameBoundaries(
    plan.scenes.map((scene) => scene.duration),
    fps,
  );
  const scenes = plan.scenes.map((scene, index) => ({
    id: scene.id,
    from: boundaries[index],
    durationInFrames: boundaries[index + 1] - boundaries[index],
  }));
  return { fps, durationInFrames: boundaries.at(-1), scenes };
}

// Resolve an encoded frame against the same rounded scene boundaries Remotion uses.
export function locateFrame(plan, frame) {
  const clock = timeline(plan);
  const resolvedFrame = Math.max(
    0,
    Math.min(clock.durationInFrames - 1, Math.floor(frame)),
  );
  let index = clock.scenes.findIndex(
    (scene) => resolvedFrame < scene.from + scene.durationInFrames,
  );
  if (index < 0) index = clock.scenes.length - 1;
  const range = clock.scenes[index];
  return {
    scene: plan.scenes[index],
    index,
    frame: resolvedFrame,
    offset: range.from / clock.fps,
    time: (resolvedFrame - range.from) / clock.fps,
    fps: clock.fps,
  };
}

// Audio starts at the first encoded frame at or after its authored scene-local time.
export function sceneFrameTime(plan, sceneIndex, seconds) {
  const clock = timeline(plan);
  const range = clock.scenes[sceneIndex];
  if (!range) throw Error(`Unknown scene index ${sceneIndex}.`);
  const localFrame = secondsToFrame(Math.max(0, seconds), clock.fps, "ceil");
  const frame = Math.min(
    range.from + Math.max(0, range.durationInFrames - 1),
    range.from + localFrame,
  );
  return frame / clock.fps;
}