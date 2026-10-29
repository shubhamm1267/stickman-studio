import{spring}from'remotion';
export function settle(age,{stiffness=520,damping=15,mass=.45}={}){if(age<0||age>.6)return 0;return 1-spring({frame:age*60,fps:60,config:{stiffness,damping,mass}});}
// Deterministic at arbitrary render order; no CSS transitions or mutable simulation.
export function impactJolt(age){return age<0||age>.18?[0,0]:[-2.6*settle(age,{stiffness:900,damping:14}),1.3*settle(age,{stiffness:700,damping:17})];}
