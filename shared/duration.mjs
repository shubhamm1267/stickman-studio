// Story duration management.
// The outline director chooses seconds from story beats,
// not a fixed words-to-seconds stretch.

export function durationInstruction(options) {
  return options.durationMode === "auto"
    ? `AUTO DURATION:
       Choose the shortest clearly readable total duration
       for this specific story.

       CRITICAL RULES:
       - Total story duration MUST be between 10 and 1200 seconds.
       - Never return a total duration below 10 seconds.
       - Every scene must be between 2 and 60 seconds.
       - Usually use 3-12 seconds per scene.
       - Sum all scene durations before returning JSON.
       - A very short joke must still have at least 10 seconds total.
       - Budget anticipation, action, reaction and payoff separately.
       - Do not target the manual duration field.
       - Do not pad a simple joke unnecessarily.
       - Different stories should receive different lengths.`
    : `MANUAL DURATION:
       Target exactly ${options.duration} seconds total.
       Every scene must be between 2 and 60 seconds.
       The sum of all scene durations must equal
       ${options.duration} seconds.`;
}


// Normalize automatically generated stories that are too short.
export function normalizeAutoOutlineDuration(outline, options) {
  if (options.durationMode !== "auto") {
    return outline;
  }

  const scenes = outline?.scenes;

  if (!Array.isArray(scenes) || !scenes.length) {
    return outline;
  }

  const total = scenes.reduce(
    (sum, scene) => sum + scene.duration,
    0
  );

  if (!Number.isFinite(total) || total <= 0) {
    return outline;
  }

  // Only normalize short automatic outlines.
  // Longer invalid outlines remain subject to retries.
  if (total >= 10) {
    return outline;
  }

  const factor = 10 / total;

  let allocated = 0;

  for (let i = 0; i < scenes.length; i++) {
    let duration;

    if (i === scenes.length - 1) {
      duration = Number(
        (10 - allocated).toFixed(3)
      );
    } else {
      duration = Number(
        (scenes[i].duration * factor).toFixed(3)
      );
    }

    scenes[i].duration = duration;
    allocated += duration;
  }

  return outline;
}


// Final duration validation.
export function assertOutlineDuration(outline, options) {
  const total = outline.scenes.reduce(
    (sum, scene) => sum + scene.duration,
    0
  );

  if (
    !Number.isFinite(total) ||
    total < 10 ||
    total > 1200
  ) {
    throw Error(
      `Story duration must be 10–1200 seconds. ` +
      `Gemini generated ${total} seconds.`
    );
  }

  if (
    options.durationMode !== "auto" &&
    Math.abs(total - options.duration) > 0.5
  ) {
    throw Error(
      `Scene durations must total ${options.duration} seconds, ` +
      `received ${total} seconds.`
    );
  }

  return total;
}