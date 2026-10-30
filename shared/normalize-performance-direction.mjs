// Bounded timeline fitting for generated direction, never for story actions.
// Preserve every event clock and camera cut. A short final hold extends the
// existing view; a cue may use the remaining window if at least half survives.
export function normalizePerformanceDirection(input,duration){
 const value=structuredClone(input);
 if(!Number.isFinite(duration)||duration<=0)return value;
 const shots=value.shots;
 if(Array.isArray(shots)&&shots.length){
  const ordered=[...shots].sort((a,b)=>a.start-b.start);
  const last=ordered.at(-1),gap=duration-last.end;
  const continuous=ordered[0].start===0&&ordered.every((s,i)=>!i||Math.abs(s.start-ordered[i-1].end)<1e-6);
  if(continuous&&gap>0&&gap<=Math.min(.5,duration*.1))last.end=duration;
 }
 for(const sound of value.sounds||[]){
  const event=value.events?.find(e=>e.eventIndex===sound.eventIndex),start=event?.[sound.phase];
  if(!Number.isFinite(start)||!Number.isFinite(sound.duration))continue;
  const available=duration-start;
  if(sound.duration>available&&available>=.1&&available>=sound.duration*.5)sound.duration=available;
 }
 return value;
}
