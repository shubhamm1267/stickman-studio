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

// Keep locomotion executable even when Gemini omits its world-space end point.
// An actor has an existing root and facing, so this completes a missing
// locomotion parameter without inventing an additional story action.
function normalizeLocomotionDestinations(scene) {
  const locations = new Map((scene?.cast || []).map(actor => [actor.characterId, {
    x: actor.x, y: actor.y, facing: actor.facing === -1 ? -1 : 1
  }]));
  const props = new Map((scene?.props || []).map(prop => [prop.designId, prop]));
  const beats = [...(scene?.beats || [])].sort((a, b) => a.start - b.start);
  for (const beat of beats) {
    if (beat.kind !== 'walk' && beat.kind !== 'run') continue;
    const actor = locations.get(beat.actorId);
    if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)) continue;

    if (Array.isArray(beat.to) && beat.to.length === 2 && beat.to.every(Number.isFinite)) {
      if (beat.to[0] !== actor.x) actor.facing = Math.sign(beat.to[0] - actor.x);
      [actor.x, actor.y] = beat.to;
      continue;
    }
    const intent = (beat.intent || '').toLowerCase();
    let direction = /\b(left|leftward|west)\b/.test(intent) ? -1
      : /\b(right|rightward|east)\b/.test(intent) ? 1 : actor.facing;
    const target = props.get(beat.targetId) || locations.get(beat.targetActorId);
    const targetX = Number.isFinite(target?.x) ? target.x : undefined;
    const toward = /\b(toward|towards|approach|chase|follow|reach)\b/.test(intent);
    const away = /\b(away|escape|flee|retreat)\b/.test(intent);
    if (targetX !== undefined && targetX !== actor.x && (toward || away)) {
      direction = Math.sign(targetX - actor.x) * (away ? -1 : 1);
    }
    // The renderer's stage spans x=0..540; leave visual room at the edges.
    const distance = beat.kind === 'run' ? 150 : 90;
    const clampX = x => Math.max(45, Math.min(495, x));
    let x = targetX !== undefined && toward
      ? clampX(targetX - direction * 60)
      : clampX(actor.x + direction * distance);
    if (Math.abs(x - actor.x) < 20) {
      direction = -direction;
      x = clampX(actor.x + direction * distance);
    }
    // An already offstage actor or a stationary direction cannot be repaired
    // by guessing: keep the validation error for a genuine model retry.
    if (Math.abs(x - actor.x) < 20) continue;
    beat.to = [Math.round(x), actor.y];
    actor.facing = direction;
    actor.x = beat.to[0];
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

  // Supply a real world destination for an otherwise valid walk/run. The
  // schema and independent quality inspector both require this parameter.
  normalizeLocomotionDestinations(value?.scene);

  // --------------------------------------------------
  // Normalize every scene beat
  // --------------------------------------------------

  for (const beat of value?.scene?.beats || []) {
    // A model sometimes writes the acting character into targetActorId when
    // it means a nearby prop. Self-targeting has no valid renderer meaning.
    if (beat.targetActorId === beat.actorId) delete beat.targetActorId;
    if (beat.kind === 'slip' && !beat.to) {
      const actor = value.scene.cast?.find(c => c.characterId === beat.actorId);
      const direction = /\b(back|backward|behind)\b/i.test(beat.intent || '') ? -1
        : /\b(forward|ahead)\b/i.test(beat.intent || '') ? 1 : 0;
      if (actor && Number.isFinite(actor.x) && Number.isFinite(actor.y) && direction)
        beat.to = [actor.x + direction * (actor.facing === -1 ? -100 : 100), actor.y];
    }
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
      // These three gestures can execute explicit generated acting keys.
      // Native actions (walk, jump, slip, pick...) already have their own
      // animation and must retain their actual action identity.
      const canBecomePerformance = ["react", "idle", "custom"].includes(beat.kind);
      const hasKeys = Array.isArray(beat.keyframes) && beat.keyframes.length > 0;
      if (canBecomePerformance && hasKeys) {
        beat.kind = "perform";
      } else {
        // Generated motion fields on a native beat have no executable effect.
        // Remove those unsupported extras instead of changing or dropping
        // the actual native story action.
        delete beat.keyframes;
        delete beat.constraints;
        delete beat.motionTrackId;
      }
      // Native actions already define their own contact timing. A generated
      // contactAt on one of those beats has no executable performance meaning.
      if (beat.kind !== "perform") delete beat.contactAt;
    }

    // An empty generated performance is a pose/hold, not a motion track.
    // Keep its visible pose and let coverage review request real motion when
    // the story event actually needs it.
    if (beat.kind === "perform" && !beat.motionTrackId &&
        (!Array.isArray(beat.keyframes) || beat.keyframes.length === 0)) {
      beat.kind = beat.pose ? "custom" : "idle";
      delete beat.keyframes;
      delete beat.constraints;
      delete beat.contactAt;
    }

    // -----------------------------------------------
    // FIX: Normalize performance keyframe timings
    // -----------------------------------------------

    normalizePerformanceKeyframes(beat);
    // A duplicate baseline matching the first animated value has one clear
    // owner. Remove only that redundant standalone channel; conflicting
    // initial values still require explicit repair rather than guessing.
    if(beat.kind==='perform'&&beat.pose&&beat.keyframes?.[0]?.at===0){
      const first=beat.keyframes[0].pose;
      for(const channel of Object.keys(beat.pose))if(Object.hasOwn(first,channel)&&JSON.stringify(first[channel])===JSON.stringify(beat.pose[channel]))delete beat.pose[channel];
      if(!Object.keys(beat.pose).length)delete beat.pose;
    }
  }

  // Keep the explicit cue time when the chosen beat has no engine contact
  // event. A fabricated contact would move the SFX to an unrelated frame.
  const contactKinds = new Set(['punch','drink','perform','throw','pawPress','slip','roar','swat','tap','sneeze','fart','scoot','pullPaper','wrap','tearFree','openDoor']);
  for (const cue of value?.scene?.sounds || []) {
    if (cue.syncTo !== 'contact' || !Number.isInteger(cue.beatIndex)) continue;
    const beat = value.scene.beats?.[cue.beatIndex];
    if (beat && (!contactKinds.has(beat.kind) ||
        (beat.kind === 'perform' && beat.contactAt === undefined))) {
      delete cue.syncTo;
      delete cue.beatIndex;
    }
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