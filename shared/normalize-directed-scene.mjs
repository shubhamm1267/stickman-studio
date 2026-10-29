// ======================================================
// STICKLAUGH STUDIO
// DIRECTED SCENE NORMALIZATION
// ======================================================

// Lower harmless authoring variations into the
// executable motion contract.
//
// Never fabricate an action, clamp geometry,
// remove events or invent IDs.


// ======================================================
// 1. NORMALIZE CAST ROOT POSITIONS
// ======================================================

export function normalizeCastRoots(scene) {
  for (const cast of scene.cast || []) {
    const position = cast.initialPose?.position;

    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      !position.every(Number.isFinite)
    ) {
      continue;
    }

    // Generated placement uses cast x/y.
    // A zero initial pose means no offset.

    if (
      position[0] >= -500 &&
      position[0] <= 1000 &&
      position[1] >= 400 &&
      position[1] <= 900
    ) {
      cast.x = position[0];
      cast.y = position[1];

      delete cast.initialPose.position;
    } else if (
      position[0] === 0 &&
      position[1] === 0
    ) {
      delete cast.initialPose.position;
    }
  }

  return scene;
}


// ======================================================
// 2. NORMALIZE PERFORMANCE KEYFRAMES
// ======================================================

function normalizePerformanceKeyframes(beat) {
  const keys = beat.keyframes;

  if (
    beat.kind !== "perform" ||
    !Array.isArray(keys) ||
    keys.length === 0
  ) {
    return;
  }

  // Reject non-finite or negative timings.
  // Existing validation/retry handles these cases.

  const invalidNumbers = keys.some(
    (key) =>
      !key ||
      !Number.isFinite(key.at) ||
      key.at < 0
  );

  if (invalidNumbers) {
    return;
  }

  // --------------------------------------------------
  // STEP 1: Convert seconds to normalized 0-1 timing
  // --------------------------------------------------

  const maxTime = Math.max(
    ...keys.map((key) => key.at)
  );

  const beatDuration = beat.duration;

  if (
    maxTime > 1 &&
    Number.isFinite(beatDuration) &&
    beatDuration > 0 &&
    maxTime <= beatDuration
  ) {
    for (const key of keys) {
      key.at = key.at / beatDuration;
    }
  }

  // Timings still beyond 1 cannot be safely interpreted.

  if (keys.some((key) => key.at > 1)) {
    return;
  }

  // --------------------------------------------------
  // STEP 2: Sort all keyframes
  // --------------------------------------------------

  keys.sort((a, b) => a.at - b.at);

  // --------------------------------------------------
  // STEP 3: Merge duplicate timings
  // --------------------------------------------------

  for (let i = keys.length - 1; i > 0; i--) {
    const current = keys[i];
    const previous = keys[i - 1];

    if (current.at === previous.at) {
      keys[i - 1] = {
        ...previous,
        ...current,

        pose: {
          ...previous.pose,
          ...current.pose
        }
      };

      keys.splice(i, 1);
    }
  }

  // --------------------------------------------------
  // STEP 4: Ensure animation starts at 0
  // --------------------------------------------------

  if (keys[0].at !== 0) {
    const firstKey = keys[0];

    keys.unshift({
      ...firstKey,
      at: 0,

      pose: {
        ...firstKey.pose
      }
    });
  }

  // --------------------------------------------------
  // STEP 5: Ensure animation ends at 1
  // --------------------------------------------------

  if (keys[keys.length - 1].at !== 1) {
    const lastKey = keys[keys.length - 1];

    keys.push({
      ...lastKey,
      at: 1,

      pose: {
        ...lastKey.pose
      }
    });
  }
}


// ======================================================
// 3. NORMALIZE PART ANIMATION EASING
// ======================================================

// The renderer supports only:
// linear, smooth, hold.
//
// Gemini may generate other values such as:
// easeOut, easeInOut, ease-in, snappy, etc.
//
// Unsupported values use the schema's safe
// default interpolation: smooth.

function normalizePartAnimationEasing(value) {
  const validEasings = new Set([
    "linear",
    "smooth",
    "hold"
  ]);

  for (const track of value?.partTracks || []) {
    const keys = track?.animation?.keys;

    if (!Array.isArray(keys)) {
      continue;
    }

    for (const key of keys) {
      if (
        !key ||
        typeof key !== "object"
      ) {
        continue;
      }

      // Missing easing is already supported by
      // the schema's default value.

      if (key.easing === undefined) {
        continue;
      }

      // Unsupported easing becomes smooth.

      if (!validEasings.has(key.easing)) {
        key.easing = "smooth";
      }
    }
  }

  return value;
}


// ======================================================
// 4. NORMALIZE POSE VALUES
// ======================================================

function normalizePoseValues(pose) {
  if (
    !pose ||
    typeof pose !== "object"
  ) {
    return;
  }

  const normalizedKeys = [
    "eyeOpen",
    "eyeOpenLeft",
    "eyeOpenRight",
    "mouthAperture",
    "sweat",
    "blush"
  ];

  for (const key of normalizedKeys) {
    if (Number.isFinite(pose[key])) {
      pose[key] = Math.max(
        0,
        Math.min(1, pose[key])
      );
    }
  }
}


// ======================================================
// 5. REMOVE GENERATED PLACEMENT IDS
// ======================================================

function normalizePlacementIds(scene) {
  // The canonical compiler assigns execution IDs.
  // Story references use characterId/designId.

  const lists = [
    "cast",
    "props",
    "beats",
    "sounds"
  ];

  for (const list of lists) {
    for (const item of scene?.[list] || []) {
      delete item.id;

      for (const event of item.attachmentEvents || []) {
        delete event.id;
      }
    }
  }
}


// ======================================================
// 6. MAIN DIRECTED SCENE NORMALIZER
// ======================================================

export function normalizeDirectedScene(input) {
  // Never mutate the original generated object.
  const value = structuredClone(input);

  // --------------------------------------------------
  // Normalize cast placement
  // --------------------------------------------------

  if (value?.scene) {
    normalizeCastRoots(value.scene);
  }

  // --------------------------------------------------
  // FIX: Normalize Gemini part animation easing
  // --------------------------------------------------

  normalizePartAnimationEasing(value);

  // --------------------------------------------------
  // Normalize initial character poses
  // --------------------------------------------------

  for (const cast of value?.scene?.cast || []) {
    normalizePoseValues(cast.initialPose);
  }

  // --------------------------------------------------
  // Remove generated placement IDs
  // --------------------------------------------------

  normalizePlacementIds(value?.scene);

  // --------------------------------------------------
  // Normalize every scene beat
  // --------------------------------------------------

  for (const beat of value?.scene?.beats || []) {
    // Normalize standalone pose values.

    normalizePoseValues(beat.pose);

    // Normalize all performance keyframe poses.

    for (const key of beat.keyframes || []) {
      normalizePoseValues(key?.pose);
    }

    // -----------------------------------------------
    // Normalize non-performance beats
    // -----------------------------------------------

    if (beat.kind !== "perform") {
      // Remove empty keyframe arrays.

      if (
        Array.isArray(beat.keyframes) &&
        beat.keyframes.length === 0
      ) {
        delete beat.keyframes;
      }

      // Remove empty constraint arrays.

      if (
        Array.isArray(beat.constraints) &&
        beat.constraints.length === 0
      ) {
        delete beat.constraints;
      }

      // Beats with actual performance keyframes
      // must be handled as perform beats.

      if (
        ["react", "idle", "custom"].includes(beat.kind) &&
        beat.keyframes?.length
      ) {
        beat.kind = "perform";
      }
    }

    // -----------------------------------------------
    // FIX: Normalize performance keyframe timings
    // -----------------------------------------------

    normalizePerformanceKeyframes(beat);
  }

  return value;
}


// ======================================================
// 7. STRIP GENERATED PLACEMENT IDS
// ======================================================

// Discard model-generated placement IDs.
// Retain all semantic references.

export function stripGeneratedPlacementIds(scene) {
  const out = structuredClone(scene);

  const lists = [
    "cast",
    "props",
    "beats",
    "sounds",
    "shots"
  ];

  for (const list of lists) {
    for (const item of out[list] || []) {
      delete item.id;

      for (const event of item.attachmentEvents || []) {
        delete event.id;
      }
    }
  }

  return out;
}