import {z} from 'zod';
import {performancePose} from './performance.mjs';
import {localToWorld,worldToLocal} from './math.mjs';
import {sampleMotionPath,validateMotionPath} from './motion-path.mjs';

export const MOTION_IR_VERSION=1;
const ANIMAL_CONTROLS=new Set(['position','bodyAngle','headAngle','eyeOpen','eyeOpenLeft','eyeOpenRight','gaze']);
export function describeMotionCapabilities(pose){return{schemaVersion:MOTION_IR_VERSION,controls:Object.keys(pose.shape),rigControls:{humanoid:Object.keys(pose.shape),animal:[...ANIMAL_CONTROLS]},rigConstraints:{humanoid:['ground','plant'],animal:[]},humanoidFaceControls:['eyeOpen','eyeOpenLeft','eyeOpenRight','gaze','browHeight','browTilt','mouthWidth','mouthCurve','mouthAperture'],rigs:{humanoid:['classic','pencil','toon'],animal:['dog','cat','lion'],animalFaceControls:['eyeOpen','eyeOpenLeft','eyeOpenRight','gaze']},constraints:['ground','plant'],pathFollowing:{coordinateSpace:'stage-y-down',maxPoints:16,interpolation:['smooth','snappy','gentle','linear','hold']},interpolation:['smooth','snappy','gentle','linear','hold'],maxTracksPerScene:100,maxKeysPerTrack:24,conflictPolicy:'reject overlapping ownership of the same control',unsupported:['arbitrary executable expressions','arbitrary rig topology','additive layer blending','general rigid-body physics']};}
const units={space:'stage-y-down',time:'seconds',angle:'degrees',pose:'actor-local'};
export function createMotionSchemas(pose,id,expressions){
 const keyframes=z.array(z.object({at:z.number().finite().min(0).max(1),pose,emotion:z.enum(expressions).optional(),timing:z.enum(['smooth','snappy','gentle','linear','hold']).optional(),leftHandShape:z.enum(['fist','grip','point','open']).optional(),rightHandShape:z.enum(['fist','grip','point','open']).optional()}).strict()).min(2).max(24);
 const pathPoint=z.object({at:z.number().finite().min(0).max(1),position:z.tuple([z.number().finite().min(-1500).max(1500),z.number().finite().min(-1500).max(1500)]),timing:z.enum(['smooth','snappy','gentle','linear','hold']).optional()}).strict();
 const path=z.array(pathPoint).min(2).max(16);
 const constraints=z.array(z.object({kind:z.enum(['ground','plant']),points:z.array(z.enum(['hip','leftFoot','rightFoot','leftHand','rightHand'])).min(1).max(5),floorY:z.number().finite().min(-1500).max(2000)}).strict()).max(1);
 const track=z.object({id,actorId:id,start:z.number().finite().min(0).max(60),duration:z.number().finite().min(.1).max(60),keyframes,path:path.optional(),constraints:constraints.default([])}).strict();
 const motionIR=z.object({schemaVersion:z.literal(MOTION_IR_VERSION),seed:z.number().int().min(0).max(4294967295),units:z.object({space:z.literal(units.space),time:z.literal(units.time),angle:z.literal(units.angle),pose:z.literal(units.pose)}).strict(),tracks:z.array(track).max(100)}).strict();
 return{keyframes,constraints,motionIR};
}

export function performanceTrack(scene,beat){
 if(!beat.motionTrackId)return beat;
 const track=scene.motionIR?.tracks.find(t=>t.id===beat.motionTrackId);
 if(!track)throw Error(`Scene ${scene.id}: missing motion track ${beat.motionTrackId}`);
 return track;
}

export function evaluateMotion(initial,track,fraction){
 const basis={...initial,...track.pose};
 const result=performancePose(basis,track.keyframes,fraction);
 if(track.pose)for(const [key,value] of Object.entries(track.pose))if(result[key]===undefined)result[key]=value;
 if(result.spineAngle!==undefined){
  const hip=result.hip||initial.hip,angle=result.spineAngle*Math.PI/180;
  if(!track.keyframes.some(k=>k.pose.head!==undefined)&&!track.pose?.head)result.head=[hip[0]+245*Math.sin(angle),hip[1]-245*Math.cos(angle)];
  result.headAngle=(result.headAngle??initial.headAngle??0)+result.spineAngle;
 }
 if(track.path)result.position=sampleMotionPath(track.path,fraction);
 for(const c of track.constraints||[]){
  const state={...initial,...result};
  if(c.kind==='plant'){
   for(const point of c.points){const anchor=localToWorld(initial,initial[point]);result[point]=worldToLocal(state,[anchor[0],c.floorY]);}
   continue;
  }
  const bottom=Math.max(...c.points.map(k=>localToWorld(state,state[k])[1]));
  result.position=[state.position[0],state.position[1]+c.floorY-bottom];
 }
 return result;
}

function channels(track){
 return new Set(track.keyframes.flatMap(k=>[...Object.keys(k.pose),...(k.emotion?['face']:[]),...(k.leftHandShape?['leftType']:[]),...(k.rightHandShape?['rightType']:[])]).concat(track.path||track.constraints.length?['position']:[]));
}
function assertRigControls(scene,actorId,keyframes,constraints=[]){
 const cast=scene.cast.find(a=>a.characterId===actorId);
 if(cast?.species&&['dog','cat','lion'].includes(cast.species)){
  const controls=new Set(keyframes.flatMap(k=>Object.keys(k.pose)));
  for(const key of keyframes){if(key.leftHandShape)controls.add('leftHandShape');if(key.rightHandShape)controls.add('rightHandShape');}
  const unsupported=[...controls].filter(control=>!ANIMAL_CONTROLS.has(control));
  if(unsupported.length)throw Error(`Animal rig ${actorId} does not render motion controls: ${unsupported.join(', ')}.`);
  if(constraints.length)throw Error(`Animal rig ${actorId} does not support motion constraints: ${constraints.map(c=>c.kind).join(', ')}.`);
 }
}
export function validateMotionIR(scene){
 const checkMouth=pose=>{if(pose?.mouthOpen!==undefined&&pose?.mouthAperture!==undefined)throw Error('mouthOpen and mouthAperture cannot both own mouth openness');};
 for(const cast of scene.cast)checkMouth(cast.initialPose);
 for(const beat of scene.beats){checkMouth(beat.pose);for(const key of beat.keyframes||[])checkMouth(key.pose);}
 for(const track of scene.motionIR?.tracks||[])for(const key of track.keyframes)checkMouth(key.pose);

 const tracks=scene.motionIR?.tracks||[],ids=new Set(),references=new Set();
 for(const t of tracks){
  if(ids.has(t.id))throw Error(`Scene ${scene.id}: duplicate motion track ${t.id}`);ids.add(t.id);
  if(!scene.cast.some(a=>a.characterId===t.actorId))throw Error(`Track ${t.id}: actor ${t.actorId} is missing`);
  if(t.start+t.duration>scene.duration+.001)throw Error(`Track ${t.id}: timing exceeds scene`);
  validateKeys(t.keyframes);
  if(t.path){
   validateMotionPath(t.path,`Track ${t.id} path`);
   if(t.keyframes.some(k=>Object.hasOwn(k.pose,'position')))throw Error(`Track ${t.id}: path and position keyframes cannot both own root position`);
  }
  assertRigControls(scene,t.actorId,t.keyframes,t.constraints);
  if(!channels(t).size)throw Error(`Track ${t.id}: no executable controls`);
  for(const c of t.constraints)if(new Set(c.points).size!==c.points.length)throw Error(`Track ${t.id}: duplicate contact points`);
 }
 for(const b of scene.beats){
  if(b.semanticAction==='direction-acting'){
   if(b.kind!=='perform')throw Error('Directed acting requires a facial performance');
   const track=performanceTrack(scene,b),allowed=new Set(['gaze','eyeOpen','eyeOpenLeft','eyeOpenRight','mouthAperture','mouthOpen','mouthWidth','mouthCurve','browHeight','browTilt','sweat','blush']);
   if(Object.keys(track.pose||{}).some(c=>!allowed.has(c))||track.keyframes?.some(k=>Object.keys(k.pose).some(c=>!allowed.has(c)))||track.constraints?.length||track.path)throw Error('Directed facial acting cannot own body motion or contacts');
  }
  if(b.kind==='perform'&&b.pose&&b.motionTrackId)throw Error('A motion track reference cannot also own a standalone pose');
  if(b.kind==='perform'&&b.pose&&b.keyframes?.some(k=>Object.keys(k.pose).some(c=>Object.hasOwn(b.pose,c)))){
   const channels=[...new Set(b.keyframes.flatMap(k=>Object.keys(k.pose).filter(c=>Object.hasOwn(b.pose,c))))];
   throw Error(`Standalone pose and performance keys have conflicting control ownership: actor ${b.actorId}, beat ${b.start}..${b.start+b.duration}, channels ${channels.join(', ')}. Put animated controls only in keyframes, with an explicit at:0 value; omit those controls from standalone pose.`);
  }
  if(b.kind==='perform'&&b.keyframes)assertRigControls(scene,b.actorId,[...(b.pose?[{pose:b.pose}]:[]),...b.keyframes],b.constraints||[]);
  if(!b.motionTrackId)continue;
  if(b.kind!=='perform'||b.keyframes||b.constraints)throw Error('A motion track reference must be the only performance source');
  const t=performanceTrack(scene,b);
  if(references.has(t.id))throw Error(`Track ${t.id}: duplicate executable reference`);references.add(t.id);
  if(t.actorId!==b.actorId||Math.abs(t.start-b.start)>.000001||Math.abs(t.duration-b.duration)>.000001)throw Error(`Track ${t.id}: beat actor/timing does not match`);
 }
 for(const t of tracks)if(!references.has(t.id))throw Error(`Track ${t.id}: not referenced by an executable beat`);
 // V1 deliberately rejects conflicting layers. It never silently picks a winner.
 for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++){
  const a=tracks[i],b=tracks[j];if(a.actorId!==b.actorId||Math.min(a.start+a.duration,b.start+b.duration)-Math.max(a.start,b.start)<.000001)continue;
  const controls=channels(a);if([...channels(b)].some(k=>controls.has(k)))throw Error(`Tracks ${a.id}/${b.id}: overlapping control ownership; compose one track or separate timing`);
 }
}
export function validateKeys(keys){
 if(!keys||keys[0]?.at!==0||keys.at(-1)?.at!==1||keys.some((k,i)=>i&&k.at<=keys[i-1].at))throw Error('Performance keys must increase strictly from zero to one.');
}

// Pure, explicit compatibility migration. Existing legacy plans remain readable.
// Beat indices and story/sound coverage stay stable; keyframes have one owner.
export function migrateMotionIR(input,{seed=0}={}){
 const plan=structuredClone(input);
 for(const scene of plan.scenes){
  scene.motionIR||={schemaVersion:MOTION_IR_VERSION,seed,units:{...units},tracks:[]};
  for(const [index,b] of scene.beats.entries()){
   if(b.kind!=='perform'||b.motionTrackId)continue;
   const id='motion_'+index;if(scene.motionIR.tracks.some(t=>t.id===id))throw Error('Migration track ID collision: '+id);
   scene.motionIR.tracks.push({id,actorId:b.actorId,start:b.start,duration:b.duration,keyframes:b.keyframes.map(k=>({...k,pose:{...b.pose,...k.pose}})),constraints:b.constraints||[]});
   b.motionTrackId=id;delete b.keyframes;delete b.constraints;delete b.pose;
  }
 }
 return plan;
}
