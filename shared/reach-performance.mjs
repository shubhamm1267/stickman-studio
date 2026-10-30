import {ease,clamp,lerp} from './math.mjs';

// Approach, contact hold and recovery use the same clock for torso and hands.
// Pure sampling makes scrubbing and parallel rendering deterministic.
export function reachPhase(elapsed,duration){
 const phase=clamp(elapsed/duration);
 return {approach:ease(phase/.78), recovery:elapsed<=duration?0:ease((elapsed-duration)/.4)};
}

export function crouchForTarget(state,localTarget,amount){
 const depth=Math.min(135,Math.max(0,localTarget[1]+140))*amount;
 if(!depth)return;
 state.hip[1]+=depth;
 state.head[1]+=depth;
 state.headAngle+=8*amount;
 // Grounded feet remain unchanged. Keep the unused hand with the torso.
 state.leftHand[1]+=depth*.65;
 state.rightHand[1]+=depth*.65;
}

export function reachHand(home,contact,phase){
 const forward=lerp(home,contact,phase.approach);
 // A modest upward arc clears nearby surfaces; exact contact is preserved.
 if(phase.approach>0 && phase.approach<1)
   forward[1]-=Math.sin(Math.PI*phase.approach)*12;
 return lerp(forward,home,phase.recovery);
}
