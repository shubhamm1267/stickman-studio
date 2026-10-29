export function validateVoiceCast(plan,keys){
 const speaking=[...new Set(plan.scenes.flatMap(s=>s.dialogue.map(v=>v.actorId)))],seen=new Map();
 for(const id of speaking){const actor=plan.characters.find(a=>a.id===id),voice=keys.voices?.[id]||actor?.voiceId;
  if(!voice)throw Error(`Set a Cartesia voice ID for ${actor?.name||id} before rendering dialogue.`);
  if(plan.productionMode==='dialogue-toon' && seen.has(voice))throw Error(`Choose different Cartesia voice IDs for ${seen.get(voice)} and ${actor.name}.`);
  seen.set(voice,actor.name);
 }
 return speaking;
}
