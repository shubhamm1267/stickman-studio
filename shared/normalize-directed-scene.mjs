// Lower harmless authoring variations into the executable motion contract.
// Never fabricate an action, clamp geometry, remove events or invent IDs.
export function normalizeCastRoots(scene){
 for(const cast of scene.cast||[]){
  const position=cast.initialPose?.position;
  if(!Array.isArray(position)||position.length!==2||!position.every(Number.isFinite))continue;
  // Generated placement uses cast x/y. Lower a redundant absolute root there;
  // a zero initial pose is the conventional no-offset value, not the stage sky.
  if(position[0]>=-500&&position[0]<=1000&&position[1]>=400&&position[1]<=900){cast.x=position[0];cast.y=position[1];delete cast.initialPose.position;}
  else if(position[0]===0&&position[1]===0)delete cast.initialPose.position;
 }
 return scene;
}
export function normalizeDirectedScene(input){
 const value=structuredClone(input);if(value.scene)normalizeCastRoots(value.scene);
 const saturate=pose=>{for(const key of ['eyeOpen','eyeOpenLeft','eyeOpenRight','mouthAperture','sweat','blush'])if(Number.isFinite(pose?.[key]))pose[key]=Math.max(0,Math.min(1,pose[key]));};
 for(const cast of value?.scene?.cast||[])saturate(cast.initialPose);

 // Execution IDs are assigned by the canonical compiler. Story identities use
 // characterId/designId; generated placement IDs may otherwise collide with them.
 for(const list of ['cast','props','beats','sounds'])for(const item of value?.scene?.[list]||[]){
  delete item.id;
  for(const event of item.attachmentEvents||[])delete event.id;
 }

 for(const beat of value?.scene?.beats||[]){
  saturate(beat.pose);for(const key of beat.keyframes||[])saturate(key.pose);
  if(beat.kind!=='perform'){
   if(Array.isArray(beat.keyframes)&&!beat.keyframes.length)delete beat.keyframes;
   if(Array.isArray(beat.constraints)&&!beat.constraints.length)delete beat.constraints;
   if(['react','idle','custom'].includes(beat.kind)&&beat.keyframes?.length)beat.kind='perform';
  }
  const keys=beat.keyframes;
  if(beat.kind!=='perform'||!Array.isArray(keys)||!keys.length)continue;
  if(keys.some((k,i)=>!Number.isFinite(k.at)||k.at<0||(i&&k.at<=keys[i-1].at)))continue;
  // A track extending past 1 but within the beat length is authored in seconds.
  if(keys.at(-1).at>1&&keys.at(-1).at<=beat.duration)for(const k of keys)k.at/=beat.duration;
  if(keys.at(-1).at>1)continue;
  if(keys[0].at>0)keys.unshift({at:0,pose:{}});
  if(keys.at(-1).at<1)keys.push({at:1,pose:{}});
 }
 return value;
}

// Discard model-generated placement IDs; retain all semantic references.
export function stripGeneratedPlacementIds(scene){
 const out=structuredClone(scene);
 for(const list of ['cast','props','beats','sounds','shots'])for(const item of out[list]||[]){delete item.id;for(const event of item.attachmentEvents||[])delete event.id;}
 return out;
}
