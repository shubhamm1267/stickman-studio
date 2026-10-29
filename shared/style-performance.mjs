import {evaluate} from '../renderer/engine.mjs';
import {localToWorld} from './math.mjs';

// Style is compiled into executable segment timing and shot targets. Explicit
// controls, key times, contacts, source story and character designs are retained.
export function compileStylePerformance(input){
 const plan=structuredClone(input);if(plan.referenceStyle!=='elastic-meme')return plan;
 for(const scene of plan.scenes){
  const performances=[...scene.beats.filter(b=>b.kind==='perform'&&b.keyframes),...(scene.motionIR?.tracks||[])];
  for(const track of performances)for(const key of track.keyframes)key.timing??='snappy';
  for(const shot of scene.shots){
   if(shot.intent!=='reaction'||shot.actorIds?.length!==1||shot.endFocus)continue;
   const {states}=evaluate(scene,(shot.start+shot.end)/2,plan.propDesigns),state=states[shot.actorIds[0]];
   const design=plan.characters.find(c=>c.id===shot.actorIds[0]);
   if(!state||design?.visualSpec?.renderMode==='replace'||['dog','cat','lion'].includes(design?.kind))continue;
   shot.focus=localToWorld(state,state.head);
  }
 }
 return plan;
}
