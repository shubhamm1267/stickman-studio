// Lower harmless authoring variations into the executable motion contract.
// Never fabricate an action, clamp geometry, remove events or invent IDs.

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
// PERFORMANCE KEYFRAME NORMALIZATION
// ======================================================

function normalizePerformanceKeyframes(beat) {
    const keys = beat.keyframes;

    // Only process valid performance beat arrays.
    if (
        beat.kind !== "perform" ||
        !Array.isArray(keys) ||
        keys.length === 0
    ) {
        return;
    }

    // Invalid numbers are left for schema validation
    // and the existing Gemini repair mechanism.
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
    // STEP 1: Convert seconds into normalized time
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

    // Timings that still exceed 1 cannot be safely
    // interpreted. Let the validator request repair.
    if (keys.some((key) => key.at > 1)) {
        return;
    }

    // --------------------------------------------------
    // STEP 2: Sort keyframes by animation time
    // --------------------------------------------------

    keys.sort((a, b) => a.at - b.at);

    // --------------------------------------------------
    // STEP 3: Merge duplicate keyframe timings
    // --------------------------------------------------

    for (let i = keys.length - 1; i > 0; i--) {
        const current = keys[i];
        const previous = keys[i - 1];

        if (current.at === previous.at) {
            // Merge controls while retaining the later
            // keyframe's values when both define the same control.

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
    // STEP 4: Ensure animation starts at exactly 0
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
    // STEP 5: Ensure animation ends at exactly 1
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
// MAIN SCENE NORMALIZER
// ======================================================

export function normalizeDirectedScene(input) {
    const value = structuredClone(input);

    if (value.scene) {
        normalizeCastRoots(value.scene);
    }

    // Normalize supported face values.
    const saturate = (pose) => {
        for (
            const key of [
                "eyeOpen",
                "eyeOpenLeft",
                "eyeOpenRight",
                "mouthAperture",
                "sweat",
                "blush"
            ]
        ) {
            if (Number.isFinite(pose?.[key])) {
                pose[key] = Math.max(
                    0,
                    Math.min(1, pose[key])
                );
            }
        }
    };

    // --------------------------------------------------
    // Normalize initial character poses
    // --------------------------------------------------

    for (const cast of value?.scene?.cast || []) {
        saturate(cast.initialPose);
    }

    // --------------------------------------------------
    // Remove generated placement IDs
    // --------------------------------------------------

    // The canonical compiler assigns execution IDs.
    // Story identities still use characterId/designId.

    for (
        const list of [
            "cast",
            "props",
            "beats",
            "sounds"
        ]
    ) {
        for (const item of value?.scene?.[list] || []) {
            delete item.id;

            for (const event of item.attachmentEvents || []) {
                delete event.id;
            }
        }
    }

    // --------------------------------------------------
    // Normalize every scene beat
    // --------------------------------------------------

    for (const beat of value?.scene?.beats || []) {
        // Normalize standalone poses.
        saturate(beat.pose);

        // Normalize poses inside keyframes.
        for (const key of beat.keyframes || []) {
            saturate(key?.pose);
        }

        // ------------------------------------------------
        // Handle non-performance beats
        // ------------------------------------------------

        if (beat.kind !== "perform") {
            // Remove unused empty keyframes.
            if (
                Array.isArray(beat.keyframes) &&
                beat.keyframes.length === 0
            ) {
                delete beat.keyframes;
            }

            // Remove unused empty constraints.
            if (
                Array.isArray(beat.constraints) &&
                beat.constraints.length === 0
            ) {
                delete beat.constraints;
            }

            // React/idle/custom beats containing actual
            // animation keyframes become perform beats.

            if (
                ["react", "idle", "custom"].includes(beat.kind) &&
                beat.keyframes?.length
            ) {
                beat.kind = "perform";
            }
        }

        // ------------------------------------------------
        // FIX: Repair Gemini performance keyframe timings
        // ------------------------------------------------

        normalizePerformanceKeyframes(beat);
    }

    return value;
}


// ======================================================
// REMOVE GENERATED PLACEMENT IDs
// ======================================================

export function stripGeneratedPlacementIds(scene) {
    const out = structuredClone(scene);

    for (
        const list of [
            "cast",
            "props",
            "beats",
            "sounds",
            "shots"
        ]
    ) {
        for (const item of out[list] || []) {
            delete item.id;

            for (const event of item.attachmentEvents || []) {
                delete event.id;
            }
        }
    }

    return out;
}