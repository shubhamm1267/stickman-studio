import { evaluate } from "../renderer/engine.mjs";
import { contactFractions } from "../shared/action-time.mjs";
export function actionEvents(scene, beat, designs) {
  if (["walk", "run"].includes(beat.kind)) {
    let out = [],
      previous = evaluate(scene, beat.start, designs).states[beat.actorId];
    for (
      let t = beat.start + 1 / 120;
      t < beat.start + beat.duration;
      t += 1 / 120
    ) {
      let a = evaluate(scene, t, designs).states[beat.actorId];
      for (const h of ["leftFoot", "rightFoot"])
        if (previous[h][1] < -0.1 && a[h][1] >= -0.1) out.push(t);
      previous = a;
    }
    return out;
  }
  const contacts = contactFractions(beat);
  if (contacts.length)
    return contacts.map((fraction) => beat.start + beat.duration * fraction);
  return [beat.start];
}
export function expandCues(scene, designs) {
  return expandIndexedCues(scene,designs).map(x=>x.cue);
}
export function expandIndexedCues(scene,designs){return scene.sounds.flatMap((c,index)=> {
    if (c.beatIndex === undefined || !c.syncTo) return [{cue:c,index}];
    let b = scene.beats[c.beatIndex],
      times =
        c.syncTo === "start" ? [b.start] : actionEvents(scene, b, designs);
    return times.map((start) => ({cue:{ ...c, start },index}));
  });
}
