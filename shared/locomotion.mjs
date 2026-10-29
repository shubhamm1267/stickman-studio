import {clamp, ease, motionEase, lerp} from './math.mjs';

// Plan contacts in world space. During stance a foot stays at the exact same
// floor point, even while the root accelerates or the film is scrubbed backwards.
export function locomotionPose({from,to,time,duration,scale=1,kind='walk',timing='smooth'}) {
  const f=clamp(time/duration), rootAt=t=>lerp(from,to,motionEase(clamp(t/duration),timing));
  const position=rootAt(time), distance=Math.hypot(to[0]-from[0],to[1]-from[1]);
  const facing=to[0]<from[0]?-1:1;
  if(distance<.001)return {position,leftFoot:[-30,0],rightFoot:[35,0],gait:0,gaitPhase:0,bob:0,swing:0};
  // Bound reach at peak speed, including the smooth root's acceleration.
  const steps=Math.max(2,Math.ceil(duration/(kind==='run'?.23:.38)),Math.ceil(distance/(scale*32)));
  const stepDuration=duration/steps,step=Math.min(steps-1,Math.floor(time/stepDuration)),phase=clamp((time-step*stepDuration)/stepDuration);
  const feet=[-30,35].map((offset,side)=>{
    // Right foot leads. Each foot alternates a swing and a planted interval.
    const first=side===1?0:1;
    const landing=k=>{
      const end=(k+1)*stepDuration;
      // Final contact for each foot is at the resting destination.
      const center=rootAt(k>=steps-2?duration:Math.min(duration,end+stepDuration*.45));
      return [center[0]+offset*scale,center[1]];
    };
    let last=step-((step-first)%2+2)%2;
    if(last<first)return [offset+(from[0]-position[0])/scale,(from[1]-position[1])/scale];
    let world,lift=0;
    if(last===step){
      const start=last===first?[from[0]+offset*scale,from[1]]:landing(last-2);
      world=lerp(start,landing(last),ease(phase));
      lift=phase===0||phase===1?0:(kind==='run'?42:24)*Math.sin(Math.PI*phase)**2;
    }else world=landing(last);
    return [(world[0]-position[0])/scale,(world[1]-position[1])/scale-lift];
  });
  const envelope=Math.sin(Math.PI*f)**.5,cycle=Math.PI*(step+phase);
  return {position,leftFoot:feet[0],rightFoot:feet[1],gait:f<1?1:0,gaitPhase:cycle,
    bob:Math.sin(cycle)**2*(kind==='run'?9:4)*envelope,
    swing:Math.sin(cycle)*envelope*facing};
}
