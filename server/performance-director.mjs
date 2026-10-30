import {geminiJSON} from './providers.mjs';
import {PerformanceDirectionSchema} from '../shared/performance-direction.mjs';
import {ACTIONS,MOTION_CAPABILITIES} from '../shared/schema.mjs';
import {evaluate} from '../renderer/engine.mjs';
import {contactFractions} from '../shared/action-time.mjs';
import {localToWorld} from '../shared/math.mjs';
import {compileDirectedCameras} from '../shared/directed-cameras.mjs';
import {emotionControls} from '../shared/acting-expressions.mjs';
import {availableActions,assertActionTarget} from '../shared/action-capabilities.mjs';
import {normalizePerformanceDirection} from '../shared/normalize-performance-direction.mjs';

const allNodes=spec=>['geometryRecipe','facialComponents','apparel','accessories','decorativeMarks'].flatMap(key=>spec?.[key]||[]);
const partIds=nodes=>nodes.flatMap(n=>[...(n.id?[n.id]:[]),...partIds(n.children||[])]);
export function rigCapabilities(characters){
 return characters.map(c=>({actorId:c.id,mode:c.visualSpec?.renderMode==='replace'?'custom-parts':['dog','cat','lion'].includes(c.kind)?'native-animal':'native-humanoid',partIds:partIds(allNodes(c.visualSpec)),controls:c.visualSpec?.renderMode==='replace'?['part.position','part.rotation','part.scale','part.opacity']:['dog','cat','lion'].includes(c.kind)?MOTION_CAPABILITIES.rigControls.animal:MOTION_CAPABILITIES.rigControls.humanoid}));
}
export function continuityReceipt(scene,designs){
 const frame=evaluate(scene,Math.max(0,scene.duration-1e-6),designs);
 return {sceneId:scene.id,actors:Object.entries(frame.states).map(([id,s])=>({id,position:s.position,scale:s.scale,facing:s.facing,emotion:s.face,pose:Object.fromEntries(['head','hip','leftHand','rightHand','leftFoot','rightFoot','headAngle','bodyAngle','headScale'].map(key=>[key,s[key]]))})),props:Object.entries(frame.props).map(([id,p])=>({id,position:p.position,angle:p.angle,scale:p.scale,owner:p.owner?{actorId:p.owner.actorId,hand:p.owner.hand}:null}))};
}
export function validatePerformanceDirection(raw,{summary,events,characters,props,sourceIdea}){
 const plan=PerformanceDirectionSchema.parse(raw);
 if(plan.sceneId!==summary.id)throw Error('Performance direction changed scene ID');
 const actors=new Set(characters.map(c=>c.id)),objects=new Set(props.map(p=>p.id));
 const checkActor=id=>{if(!actors.has(id))throw Error('Performance direction uses unknown actor '+id);};
 for(let index=0;index<events.length;index++)if(plan.events.filter(e=>e.eventIndex===index).length!==1)throw Error('Performance needs exactly one entry per required event '+index);
 for(const e of plan.events){
  checkActor(e.actorId);if(!ACTIONS.includes(e.action))throw Error('Unsupported directed action '+e.action);
  if(e.eventIndex>=events.length)throw Error('Performance direction invented an event');
  if(e.propId&&!objects.has(e.propId))throw Error('Performance direction uses unknown prop '+e.propId);
  assertActionTarget(e.action,e.propId,props);
  const times=[e.start,e.anticipation,...(e.contact===undefined?[]:[e.contact]),...(e.release===undefined?[]:[e.release]),e.settle,e.end];
  if(e.end<=e.start || e.end>summary.duration || times.some((t,i)=>i&&t<times[i-1]))throw Error('Action phases must be ordered within the scene: event '+e.eventIndex);
  if(['grip','impact','head-support'].includes(e.result)&&e.contact===undefined)throw Error('Physical result requires a contact time');
  if(e.result==='release'&&e.release===undefined)throw Error('Release result requires a release time');
  if(['jump','fall','slip','throw'].includes(e.action)&&e.footSupport==='both')throw Error('Airborne/slipping action cannot declare both feet planted');
  if(['grip','release','head-support'].includes(e.result)&&!e.propId)throw Error('Object ownership result requires propId');
  const fractions=e.action==='pick'?[.98]:e.action==='place'?[1]:e.action==='tap'?[]:contactFractions({kind:e.action});
  if(e.contact!==undefined&&fractions.length&&Math.min(...fractions.map(f=>Math.abs(e.start+(e.end-e.start)*f-e.contact)))>1/30+.00001)throw Error(`Directed ${e.action} event ${e.eventIndex} contact ${e.contact}s disagrees with its native clock ${fractions.map(f=>e.start+(e.end-e.start)*f).join('/')}s. Adjust contact or start/end consistently; do not ask scene staging to implement a different native phase.`);
 }
 const caps=rigCapabilities(characters);
 for(const rig of plan.rigs){
  checkActor(rig.actorId);const cap=caps.find(c=>c.actorId===rig.actorId);
  if(rig.mode!==cap.mode||rig.partIds.some(p=>!cap.partIds.includes(p))||rig.controls.some(c=>!cap.controls.includes(c)))throw Error('Rig plan requests unavailable parts or controls for '+rig.actorId);
 }
 for(const actorId of new Set(plan.events.map(e=>e.actorId)))if(plan.rigs.filter(r=>r.actorId===actorId).length!==1)throw Error('Performance requires exactly one rig declaration for '+actorId);
 for(const acting of plan.acting){checkActor(acting.actorId);if(acting.end<=acting.start||acting.end>summary.duration||acting.reactionAt<acting.start||acting.reactionAt>acting.end)throw Error('Acting timing is outside the scene');if(acting.lookAtId&&!actors.has(acting.lookAtId)&&!objects.has(acting.lookAtId))throw Error('Acting gaze target is unknown');}
 for(const acting of plan.acting)if(acting.settleAt!==undefined&&(acting.settleAt<=acting.reactionAt||acting.settleAt>acting.end||!acting.settleEmotion))throw Error('Acting recovery needs a later settleAt and explicit settleEmotion');
 for(const acting of plan.acting)if(acting.gazeAt!==undefined&&(acting.gazeAt<acting.start||acting.gazeAt>acting.end))throw Error('Gaze cue must be inside its acting interval');
 const request=sourceIdea||events.map(e=>e.storyEvent).join(' ');
 for(const [word,sign] of [['right',1],['left',-1]])if(new RegExp(`\\blook(?:s|ing)?\\s+(?:to\\s+the\\s+)?${word}\\b`,'i').test(request)&&!plan.acting.some(a=>a.gazeDirection&&a.gazeDirection[0]*sign>0))throw Error(`Requested offscreen look ${word} needs the matching gazeDirection`);
 if(/\bfull[- ]body\b/i.test(sourceIdea||'')&&!plan.shots.some(s=>s.framing==='full-body'))throw Error('Requested full-body view needs explicit full-body framing');
 if(/\bface reaction close[- ]up\b/i.test(sourceIdea||'')&&!plan.acting.some(a=>plan.shots.some(s=>s.framing==='close-up'&&s.start<=a.reactionAt&&s.end>a.reactionAt)))throw Error('The face reaction close-up must already be visible at the reaction cue, rather than cutting in after the expression');
 for(const a of plan.acting)for(const b of plan.acting)if(a!==b&&a.actorId===b.actorId&&Math.min(a.end,b.end)-Math.max(a.start,b.start)>1e-6)throw Error('Overlapping acting ownership for '+a.actorId);
 let end=0;for(const shot of [...plan.shots].sort((a,b)=>a.start-b.start)){shot.actorIds.forEach(checkActor);if(Math.abs(shot.start-end)>.01||shot.end<=shot.start)throw Error('Directed shots must cover the complete scene');end=shot.end;}if(Math.abs(end-summary.duration)>.01)throw Error('Directed shots leave part of the scene uncovered');
 for(const event of plan.events){
  if(event.result==='pose')continue;
  const time=event.result==='release'?event.release:event.contact??event.settle;
  const shot=plan.shots.find(s=>s.start<=time&&s.end>Math.min(time,summary.duration-1e-6));
  if(!shot?.actorIds.includes(event.actorId)||shot.framing==='close-up')throw Error(`Physical event ${event.eventIndex} at ${time}s needs a medium/full-body shot showing its actor and hand/object contact; a face-only close-up or hidden actor cannot prove it.`);
 }
 for(const sound of plan.sounds){const event=plan.events.find(e=>e.eventIndex===sound.eventIndex);if(!event||event[sound.phase]===undefined||event[sound.phase]+sound.duration>summary.duration+.001)throw Error(`Directed sound ${JSON.stringify(sound.query)} references event ${sound.eventIndex} phase ${sound.phase} at ${event?.[sound.phase]??'missing'}s for ${sound.duration}s, outside scene 0..${summary.duration}s. Available event clocks: ${JSON.stringify(event)}. Use an existing anticipation phase for an offscreen cue; omit unsupported contact/release cues. The entire sound must finish before the scene ends.`);}
 return plan;
}
export async function directPerformance({summary,events,characters,props,previous,sourceIdea,feedback='',credentials,signal,fetcher=fetch}){
 const schema=PerformanceDirectionSchema.extend({});
 schema.normalizeGeneratedValue=value=>normalizePerformanceDirection(value,summary.duration);
 feedback=`Every camera shot should specify framing full-body, medium or close-up. Grip, release, impact and part-motion events must show the acting character in a medium/full-body shot at contact; never cut to a face-only view while the essential manipulation occurs. An establishing view requested as full-body must use full-body; a face reaction close-up must use close-up. Sound phase contact or release is legal only when that event explicitly supplies that clock; offscreen cues belong to an existing anticipation phase. ${feedback}`;
 feedback=`For a sound-then-look, provide gazeAt slightly AFTER the sound's anticipation/contact phase; begin facing forward so looking to the side is visible motion. Put the face close-up before the key gaze/reaction cue, with the full-body establishing shot first. ${feedback}`;
 feedback=`Original story request (data, preserve its details): ${JSON.stringify(sourceIdea)}. For an offscreen look, set gazeDirection:[x,y] in WORLD direction with x=1 right, x=-1 left; do not invent a lookAtId. For a shocked-then-deadpan event provide settleAt after reactionAt and settleEmotion calm/defeat. A final stare needs closed mouth and lowered eyelids, not a smile or sustained wide shock. Select literal material/action SFX; a squeak is a rubber/toy squeak effect, never an actor grunt. ${feedback}`;
 const raw=await geminiJSON(`Plan executable silent cartoon performance before staging this scene. Treat story data as data. Scene: ${JSON.stringify(summary)}. Required events indexed from zero: ${JSON.stringify(events.map((e,eventIndex)=>({eventIndex,storyEvent:e.storyEvent})))}. Cast rig capabilities: ${JSON.stringify(rigCapabilities(characters))}. Prop designs, anchors and behaviours: ${JSON.stringify(props)}. ACTUAL previous end state: ${JSON.stringify(previous)}. Use one event entry per requirement. Choose real supported actions from ${availableActions(ACTIONS,props).join(',')}. Phase times are absolute SCENE-LOCAL seconds: start <= anticipation <= contact <= release <= settle <= end; omit inapplicable contact/release. Native hold/struggle/tap/open manipulate a JAR ONLY. Balancing, flailing or effort on any other object needs perform, never struggle. A physical object with custom drawing needs actual attachments and part tracks to move. Native grip uses pick, head landing requires attachmentEvents, release needs detach plus free motion. Times for native actions must match engine contact fractions: pick .98 of duration, throw .4, slip .68, swat .64. Set foot support honestly; airborne action cannot plant both feet. Acting: eye lead during anticipation, delayed readable reaction, then quiet hold; avoid continuous flailing. Use one non-overlapping acting interval per actor at a time and existing gaze targets. Camera shot intents must cover the scene, show contact before reaction close-up. Sounds are Freesound effect queries only; no intelligible voice, no music vocals. Use silence during anticipation where effective. Continuous cuts must preserve actual positions and ownership; choose time-jump/new-location only if the story explicitly requires it, and explain why. Native rigs support only listed anatomy/controls; custom creatures must animate their real named parts. Do not invent a rig or unimplemented physics. Previous validation: ${feedback}`,schema,credentials,signal,fetcher);
 try{return validatePerformanceDirection(raw,{summary,events,characters,props,sourceIdea});}
 catch(error){error.generatedValue=raw;throw error;}
}

// Compile facial acting into existing face-only performance beats. Physical
// contacts retain their native/body tracks; coverage indices stay stable.
export function compileDirectedPerformance(scene,input,characters,designs,{format='landscape'}={}){
 const plan=PerformanceDirectionSchema.parse(input),out=structuredClone(scene);
 // Idempotent: generated acting beats are appended and never used for coverage.
 out.beats=out.beats.filter(b=>b.semanticAction!=='direction-acting');
 for(const acting of plan.acting){
  const design=characters.find(c=>c.id===acting.actorId);
  if(design?.visualSpec?.renderMode==='replace'||['dog','cat','lion'].includes(design?.kind))continue;
  const duration=acting.end-acting.start;
  const fraction=Math.min(1,Math.max(0,(acting.reactionAt-acting.start)/duration));
  const gazeAt=time=>{
   const frame=evaluate(out,time,designs),s=frame.states[acting.actorId];
   const target=frame.states[acting.lookAtId]?.position||frame.props[acting.lookAtId]?.position;
   if(!s||!target)return acting.gazeDirection?[acting.gazeDirection[0]*12*(s?.facing??1),acting.gazeDirection[1]*12]:[0,0];const head=localToWorld(s,s.head);
   return [Math.max(-12,Math.min(12,(target[0]-head[0])*.06))*(s.facing??1),Math.max(-12,Math.min(12,(target[1]-head[1])*.06))];
  };
  const intensity=acting.intensity;
  // Key every reaction channel before the cue: sparse channel interpolation
  // otherwise starts opening the shocked mouth during the anticipation.
  const anticipation=emotionControls(acting.anticipationEmotion,intensity),reaction=emotionControls(acting.reactionEmotion,intensity);
  const sounds=plan.sounds.map(sound=>({sound,event:plan.events.find(e=>e.eventIndex===sound.eventIndex)})).filter(({sound,event})=>event?.actorId===acting.actorId&&event[sound.phase]>=acting.start&&event[sound.phase]<acting.reactionAt);
  const firstSound=sounds.length?Math.min(...sounds.map(({sound,event})=>event[sound.phase])):acting.start;
  const gazeTime=acting.gazeAt??Math.min(acting.reactionAt,Math.max(acting.start,firstSound+.18));
  const initialGaze=acting.gazeDirection?(out.cast.find(c=>c.characterId===acting.actorId)?.initialPose?.gaze||[0,0]):(evaluate(out,acting.start,designs).states[acting.actorId]?.gaze||[0,0]);
  const available=(acting.settleAt===undefined?1:(acting.settleAt-acting.start)/duration)-fraction;
  const peak=fraction+Math.max(0,Math.min(.025,available/2));
  const keys=[{at:0,pose:{...anticipation,gaze:gazeTime>acting.start?initialGaze:gazeAt(acting.start)},emotion:acting.anticipationEmotion,timing:'gentle'},
   // Switch the mouth's shape family at onset, then open it. Opening while
   // still labelled curious/neutral renders the transitional shape as a smile.
   {at:fraction,pose:{...anticipation,gaze:gazeAt(acting.reactionAt)},emotion:acting.reactionEmotion,timing:'hold'},
   {at:peak,pose:reaction,emotion:acting.reactionEmotion,timing:'snappy'},
   {at:1,pose:{...reaction,eyeOpen:reaction.eyeOpen*.85,mouthAperture:reaction.mouthAperture*.3},emotion:acting.reactionEmotion,timing:'gentle'}];
  if(acting.settleAt!==undefined){
    const at=(acting.settleAt-acting.start)/duration,settle={eyeOpen:.65,mouthAperture:0,mouthCurve:0,mouthWidth:1,browHeight:[0,0],browTilt:[0,0],gaze:gazeAt(acting.settleAt)};
    keys.pop();keys.push({at,pose:settle,emotion:acting.settleEmotion,timing:'gentle'});
    if(at<1)keys.push({at:1,pose:{...settle},emotion:acting.settleEmotion,timing:'gentle'});
  }
  if(acting.gazeDirection&&gazeTime>acting.start){
   const finish=(gazeTime-acting.start)/duration,start=Math.max(0,finish-Math.min(.12,.16/duration));
   keys.push({at:start,pose:{gaze:initialGaze},timing:'hold'},{at:finish,pose:{gaze:gazeAt(gazeTime)},timing:'snappy'});
  }
  keys.sort((a,b)=>a.at-b.at);
  for(let i=keys.length-1;i>0;i--)if(Math.abs(keys[i].at-keys[i-1].at)<1e-9){keys[i-1]={...keys[i-1],...keys[i],pose:{...keys[i-1].pose,...keys[i].pose}};keys.splice(i,1);}
  // Preserve staged facial keys by default. Explicit directed gaze/recovery
  // takes ownership of those channels while retaining the body's keys.
  const faceControls=new Set(['gaze','eyeOpen','eyeOpenLeft','eyeOpenRight','mouthAperture','mouthOpen','mouthWidth','mouthCurve','browHeight','browTilt']);
  if(acting.gazeDirection||acting.settleAt!==undefined)for(const beat of out.beats){
    if(beat.actorId!==acting.actorId||beat.kind!=='perform'||beat.motionTrackId||Math.min(beat.start+beat.duration,acting.end)<=Math.max(beat.start,acting.start))continue;
    for(const key of beat.keyframes||[]){for(const channel of faceControls)delete key.pose[channel];delete key.emotion;}
    if(beat.pose)for(const channel of faceControls)delete beat.pose[channel];
    if(beat.keyframes?.every(k=>!Object.keys(k.pose).length)&&!Object.keys(beat.pose||{}).length&&!beat.constraints?.length){beat.kind='idle';delete beat.keyframes;delete beat.pose;delete beat.contactAt;delete beat.constraints;}
  }
  const hasFace=out.beats.some(b=>b.actorId===acting.actorId&&b.kind==='perform'&&Math.min(b.start+b.duration,acting.end)>Math.max(b.start,acting.start)&&b.keyframes?.some(k=>Object.keys(k.pose).some(c=>faceControls.has(c))));
  if(!hasFace)out.beats.push({actorId:acting.actorId,kind:'perform',start:acting.start,duration,keyframes:keys,intent:'Directed anticipation, gaze lead and delayed facial reaction',semanticAction:'direction-acting'});
 }
 // Sound clocks are taken from the same action phase declarations as motion.
 for(const sound of plan.sounds){const e=plan.events.find(e=>e.eventIndex===sound.eventIndex),start=e[sound.phase];
  const query=sound.query.toLowerCase().trim();
  const matching=out.sounds.filter(c=>c.query.toLowerCase().trim()===query);
  if(matching.length){
   out.sounds=out.sounds.filter(c=>!matching.includes(c));
  }
  if(matching.length||!out.sounds.some(c=>Math.abs(c.start-start)<.08))out.sounds.push({query:sound.query,start,duration:sound.duration,volume:sound.volume,required:true,role:'effect'});
 }
 out.shots=compileDirectedCameras(out,plan,characters,designs,format);
 return out;
}

export function auditDirectedPerformance(scene,direction,coverage,designs,previous){
 const issues=[],add=(code,eventIndex,time,actorId,problem,repair)=>issues.push({sceneId:scene.id,code,eventIndex,time,actorId,problem,repair});
 for(const event of direction.events){
  const linked=coverage[event.eventIndex]?.beatIndices||[];
  const beats=linked.map(i=>scene.beats[i]).filter(Boolean);
  const poseActions=new Set(['idle','react','stand','custom','perform']);
  const action=beats.find(b=>b.actorId===event.actorId&&
    (b.kind===event.action || event.result==='pose'&&poseActions.has(event.action)&&
      (poseActions.has(b.kind)||b.kind==='perform'&&b.keyframes?.length))&&
    (!event.propId||b.targetId===event.propId||b.kind==='perform'));
  if(!action){
   const candidates=scene.beats.map((beat,index)=>({beat,index})).filter(({beat})=>beat.actorId===event.actorId&&beat.kind===event.action&&(!event.propId||beat.targetId===event.propId||beat.kind==='perform'));
   add('missing-action',event.eventIndex,event.start,event.actorId,`Coverage beatIndices ${JSON.stringify(linked)} contain no executable ${event.action} for this event`,candidates.length?`Matching action exists at beatIndices ${JSON.stringify(candidates.map(c=>c.index))}. Include the actual action beat in this event's coverage along with its expression beats; verify its window and contact before linking.`:'Add the directed executable action and link its actual beat index, actor and prop reference');continue;
  }
  // A pose event may legitimately use several consecutive body/acting beats.
  // Physical contact actions still need their own exact native event clock.
  const composePose=event.result==='pose'&&poseActions.has(event.action);
  const windows=composePose?beats.filter(b=>b.actorId===event.actorId&&poseActions.has(b.kind)).map(b=>[b.start,b.start+b.duration]).sort((a,b)=>a[0]-b[0]):[[action.start,action.start+action.duration]];
  let covered=event.start;
  for(const [start,end] of windows){if(start>covered+.12)break;covered=Math.max(covered,end);}
  const matches=composePose?windows.length&&Math.abs(windows[0][0]-event.start)<=.12&&Math.abs(covered-event.end)<=.12:Math.abs(action.start-event.start)<=.12&&Math.abs(action.start+action.duration-event.end)<=.12;
  if(!matches)
    add('action-window',event.eventIndex,event.start,event.actorId,`Executable action windows ${JSON.stringify(windows)} disagree with directed ${event.start}..${event.end}`,'Match linked beat start/duration to the declared event window; consecutive pose beats may cover it without gaps');
  if(['left','right','both'].includes(event.footSupport)&&!['walk','run'].includes(event.action)){
    const initial=evaluate(scene,event.start,designs).states[event.actorId];
    const feet=event.footSupport==='both'?['leftFoot','rightFoot']:[event.footSupport+'Foot'];
    if(initial)for(let sample=1;sample<=8;sample++){
      const at=event.start+(event.end-event.start)*sample/8,state=evaluate(scene,at,designs).states[event.actorId];
      if(!state)continue;
      if(feet.some(foot=>{const a=localToWorld(initial,initial[foot]),b=localToWorld(state,state[foot]);return Math.hypot(a[0]-b[0],a[1]-b[1])>8;})){
        add('foot-support',event.eventIndex,at,event.actorId,'Declared support foot slides or leaves its planted point','Use plant constraints or correct body/foot keys to retain the declared support');break;
      }
    }
  }
  if(event.contact!==undefined){const fractions=action.kind==='pick'?[.98]:action.kind==='place'?[1]:contactFractions(action);const contacts=fractions.map(f=>action.start+action.duration*f);
   if(contacts.length&&Math.min(...contacts.map(t=>Math.abs(t-event.contact)))>.12)add('contact-clock',event.eventIndex,event.contact,event.actorId,'Native action contact disagrees with the directed event clock','Align action start/duration with the declared contact time');
  }
  const at=event.result==='grip'?Math.min(scene.duration,event.end)-1e-5:event.result==='release'?Math.min(scene.duration,(event.release??event.end)+.02):Math.min(scene.duration,event.settle);
  if(event.propId&&['grip','release','head-support'].includes(event.result)){
   const frame=evaluate(scene,at,designs),owner=frame.props[event.propId]?.owner;
   const valid=event.result==='release'?!owner:owner?.actorId===event.actorId&&(event.result!=='head-support'||owner.hand==='head');
   if(!valid)add('ownership',event.eventIndex,at,event.actorId,`Expected ${event.result} of ${event.propId} is absent in resolved animation`,'Repair pickup/release/landing ownership at the actual event time');
   const boundary=event.result==='release'?event.release:event.contact;
   if(boundary>0&&boundary<scene.duration){
    const before=evaluate(scene,Math.max(0,boundary-1e-5),designs).props[event.propId];
    const after=evaluate(scene,boundary+1e-5,designs).props[event.propId];
    if(before&&after&&Math.hypot(before.position[0]-after.position[0],before.position[1]-after.position[1])>8)
      add('contact-jump',event.eventIndex,boundary,event.actorId,`Prop ${event.propId} teleports at the ownership boundary`,'Align the free trajectory and hand/support anchor at the same contact point');
   }
  }
 }
 if(previous&&direction.transition.kind==='continuous'){
  const initial=evaluate(scene,0,designs);
  for(const actor of previous.actors){const next=initial.states[actor.id];if(!next)continue;
    if(Math.hypot(next.position[0]-actor.position[0],next.position[1]-actor.position[1])>8)add('cut-position',-1,0,actor.id,'Actor teleports across a continuous cut','Copy actual previous root position into initial placement');
    if(Math.abs(next.scale-actor.scale)>.02||next.facing!==actor.facing)add('cut-identity',-1,0,actor.id,'Actor scale or facing changes across a continuous cut','Carry the evaluated scale and facing into the next cast placement');
  }
  for(const prop of previous.props){const next=initial.props[prop.id];if(!next)continue;const owner=next.owner;if(Math.hypot(next.position[0]-prop.position[0],next.position[1]-prop.position[1])>8||owner?.actorId!==prop.owner?.actorId||owner?.hand!==prop.owner?.hand)add('cut-prop',-1,0,owner?.actorId||'',`Prop ${prop.id} changes position or ownership across the cut`,'Preserve actual previous ownership, pose, scale and placement');}
 }
 return issues;
}
