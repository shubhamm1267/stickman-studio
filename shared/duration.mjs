// The outline director chooses seconds from story beats, not a fixed words-to-seconds stretch.
export function durationInstruction(options){
 return options.durationMode==='auto'
  ? 'AUTO DURATION: Choose the shortest clearly readable total duration for this specific story, between 10 and 1200 seconds. Do not target the manual duration field. Budget anticipation, action/contact, reaction hold and payoff separately. Use scenes 2-60 seconds, usually 3-12. Do not pad a simple joke or rush a complex one. Dialogue must fit its scene (roughly 2.2 spoken words per second plus pauses). Different stories should receive different lengths.'
  : `Target ${options.duration} seconds total, scenes 2-60 seconds.`;
}
export function assertOutlineDuration(outline,options){
 const total=outline.scenes.reduce((n,s)=>n+s.duration,0);
 if(!Number.isFinite(total)||total<10||total>1200)throw Error('Story duration must be 10–1200 seconds.');
 if(options.durationMode!=='auto'&&Math.abs(total-options.duration)>.5)throw Error('Scene durations must total '+options.duration+' seconds, received '+total);
 return total;
}
