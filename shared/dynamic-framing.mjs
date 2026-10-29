import {evaluate} from '../renderer/engine.mjs';
import {localToWorld,ease,lerp} from './math.mjs';
// Keep expressive native heads inside the frame. Preserve the authored focus,
// camera path and cut timing; reduce zoom only as much as the sampled action needs.
export function fitDynamicCameras(input){
 const plan=structuredClone(input),land=plan.format==='landscape',square=plan.format==='square';
 const width=land?960:540,height=land||square?540:960,anchor=height*(land?.51:.52),factor=land?.73:square?.72:1,padding=16;
 for(const scene of plan.scenes)for(const shot of scene.shots){
  if(shot.detail==='hands'&&plan.hook?.sceneId===scene.id&&shot.start<plan.hook.end&&shot.end>plan.hook.start)shot.detail='full';
  if(shot.detail==='hands')continue;let ratio=1;
  for(let i=0;i<=8;i++){
   const f=i/8,time=shot.start+(shot.end-shot.start)*f,u=ease(f),focus=lerp(shot.focus,shot.endFocus||shot.focus,u),zoom=lerp(shot.zoom,shot.endZoom??shot.zoom,u)*factor;
   const {states}=evaluate(scene,time,plan.propDesigns);
   for(const cast of scene.cast){
    if(shot.actorIds&&!shot.actorIds.includes(cast.characterId))continue;
    const design=plan.characters.find(c=>c.id===cast.characterId),s=states[cast.characterId];
    if(['dog','cat','lion'].includes(design.kind))continue;
    const rx=100*(design.headWidth||1)*(s.headScale?.[0]||1),ry=120*(design.headHeight||1)*(s.headScale?.[1]||1);
    for(const x of [-rx,rx])for(const y of [-ry,ry]){
     const p=localToWorld(s,[s.head[0]+x,s.head[1]+y]),dx=(p[0]-focus[0])*zoom,dy=(p[1]-focus[1])*zoom;
     if(dx)ratio=Math.min(ratio,(width/2-padding)/Math.abs(dx));
     if(dy)ratio=Math.min(ratio,(dy<0?anchor-padding:height-anchor-padding)/Math.abs(dy));
    }
   }
  }
  if(ratio<1){shot.zoom=Math.max(.4,shot.zoom*ratio);if(shot.endZoom!==undefined)shot.endZoom=Math.max(.4,shot.endZoom*ratio);}
 }
 return plan;
}
