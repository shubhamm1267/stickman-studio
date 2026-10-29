import presets from '../assets/motion-presets.json' with {type:'json'};
import {lerp} from './math.mjs';
import {evaluateMotion} from './motion-ir.mjs';

export function instantiateMotionPreset(name,initial,{floorY=initial.position[1],to=initial.position}={}){
 const preset=presets[name];if(!preset)throw Error('Unsupported motion data preset: '+name);
 const keyframes=structuredClone(preset.keyframes);
 const channels=new Set(keyframes.flatMap(k=>Object.keys(k.pose)));
 keyframes[0].pose={...Object.fromEntries([...channels].map(k=>[k,initial[k]])),...keyframes[0].pose};
 for(const k of keyframes)k.pose.position=lerp(initial.position,to,k.at);
 return{keyframes,constraints:preset.groundPoints?[{kind:'ground',points:[...preset.groundPoints],floorY}]:[]};
}
export function sampleMotionPreset(name,initial,fraction,options){return evaluateMotion(initial,instantiateMotionPreset(name,initial,options),fraction);}
