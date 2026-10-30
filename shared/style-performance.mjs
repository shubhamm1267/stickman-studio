import {evaluate} from '../renderer/engine.mjs';
import {localToWorld} from './math.mjs';

// Style is compiled into executable segment timing and shot targets. Explicit
// controls, key times, contacts, source story and character designs are retained.
export function compileStylePerformance(input){
 const plan=structuredClone(input);if(plan.referenceStyle!=='elastic-meme')return plan;
 // A generated ink colour is sometimes mistakenly assigned as the face fill.
 // Keep explicitly requested complexions; paper-fill only this default error.
 const explicitComplexion=/\b(skin|complexion|dark[- ]skinned|black (?:man|woman|person|character))\b/i.test(plan.sourceIdea||plan.story||'');
 if(!explicitComplexion)for(const actor of plan.characters){
  if(actor.visualSpec?.renderMode==='replace'||['dog','cat','lion'].includes(actor.kind))continue;
  const channels=actor.skin?.match(/[a-f0-9]{2}/gi)?.map(v=>parseInt(v,16));
  if(channels?.length===3&&Math.max(...channels)<60)actor.skin='#bfc1a2';
 }
 for(const scene of plan.scenes){
  const performances=[...scene.beats.filter(b=>b.kind==='perform'&&b.keyframes),...(scene.motionIR?.tracks||[])];
  for(const track of performances)for(const key of track.keyframes)key.timing??='snappy';
  for(const shot of scene.shots){
   if(shot.framing||shot.intent!=='reaction'||shot.actorIds?.length!==1||shot.endFocus)continue;
   const {states}=evaluate(scene,(shot.start+shot.end)/2,plan.propDesigns),state=states[shot.actorIds[0]];
   const design=plan.characters.find(c=>c.id===shot.actorIds[0]);
   if(!state||design?.visualSpec?.renderMode==='replace'||['dog','cat','lion'].includes(design?.kind))continue;
   shot.focus=localToWorld(state,state.head);
  }
 }
 return plan;
}
