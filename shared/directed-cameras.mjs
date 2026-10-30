import {evaluate} from '../renderer/engine.mjs';
import {localToWorld} from './math.mjs';

// The score owns cut times. Framing uses evaluated native rig extents across
// the shot, not the actor root or a guessed zoom copied from another ratio.
export function compileDirectedCameras(scene,direction,characters,designs,format='landscape'){
 const landscape=format==='landscape',square=format==='square';
 const width=landscape?960:540,height=landscape||square?540:960;
 const factor=landscape?.73:square?.72:1,anchor=height*(landscape?.51:.52);
 return direction.shots.map(planned=>{
  const staged=scene.shots.find(s=>s.start<=planned.start&&s.end>planned.start)||scene.shots[0];
  const shot={...staged,start:planned.start,end:planned.end,intent:planned.intent,actorIds:[...planned.actorIds]};
  delete shot.id;
  if(!planned.framing)return shot;
  shot.framing=planned.framing;shot.detail='full';
  const selected=characters.filter(c=>planned.actorIds.includes(c.id));
  // Custom artwork must retain its authored framing until drawable bounds
  // can be resolved for that rig. Never apply humanoid anatomy to creatures.
  if(selected.some(c=>c.visualSpec?.renderMode==='replace'||['dog','cat','lion'].includes(c.kind)))return shot;
  const points=[];
  for(let sample=0;sample<=8;sample++){
   const t=Math.min(scene.duration-1e-6,planned.start+(planned.end-planned.start)*sample/8);
   const {states}=evaluate(scene,t,designs);
   for(const character of selected){
    const state=states[character.id];if(!state)continue;
    const rx=110*(character.headWidth||1)*(state.headScale?.[0]||1),ry=140*(character.headHeight||1)*(state.headScale?.[1]||1);
    for(const x of [-rx,rx])for(const y of [-ry,ry])points.push(localToWorld(state,[state.head[0]+x,state.head[1]+y]));
    if(planned.framing==='close-up')continue;
    for(const bone of planned.framing==='medium'?['hip','leftHand','rightHand']:['hip','leftHand','rightHand','leftFoot','rightFoot']){
     const p=localToWorld(state,state[bone]);points.push([p[0]-12*state.scale,p[1]-12*state.scale],[p[0]+12*state.scale,p[1]+12*state.scale]);
    }
   }
  }
  if(!points.length)return shot;
  const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0]));
  const top=Math.min(...points.map(p=>p[1])),bottom=Math.max(...points.map(p=>p[1]));
  const zoom=Math.max(.4,Math.min(6,width*.82/Math.max(1,right-left)/factor,height*.82/Math.max(1,bottom-top)/factor));
  shot.zoom=zoom;shot.focus=[(left+right)/2,(top+bottom)/2+(anchor-height/2)/(zoom*factor)];
  delete shot.endFocus;delete shot.endZoom;
  return shot;
 });
}
