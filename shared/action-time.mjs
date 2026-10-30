// Authored event phases shared by Story IR and audio cue expansion.
// These phases mirror the current Plan v1 action-event timing contract.
export function contactFractions(beat) {
  if (beat.kind === "punch") return [0.42];
  if (beat.kind === "drink") return [0.32];
  if (beat.kind === "perform" && beat.contactAt !== undefined)
    return [beat.contactAt];
  if (beat.contactAt !== undefined) return [beat.contactAt];
  const phase = {
    throw: 0.4,
    pawPress: 0.5,
    slip: 0.68,
    roar: 0.35,
    fart: 0.2,
    scoot: 0.35,
    pullPaper: 0.6,
    wrap: 0.1,
    openDoor: 0.35,
    swat: 0.64,
    sneeze: 0.68,
  }[beat.kind];
  if (phase !== undefined) return [phase];
  if (beat.kind === "tap") {
    const count = Math.max(1, Math.round(beat.amount));
    return Array.from(
      { length: count },
      (_, index) =>
        0.35 + (index * 0.45) / Math.max(1, count - 1),
    );
  }
  if (beat.accent === "impact") return [0.5];
  return [];
}
