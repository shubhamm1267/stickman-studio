import {lerp,motionEase,clamp} from './math.mjs';
// Evaluate each channel independently. Missing channels hold their last key;
// evaluating out of order produces exactly the same state as forward playback.
export function performancePose(initial, keys, fraction) {
 const f=clamp(fraction),out={};
 const channels=new Set(keys.flatMap(k=>Object.keys(k.pose)));
 const defaults={eyeOpen:1,eyeOpenLeft:1,eyeOpenRight:1,mouthWidth:1,mouthCurve:0,mouthAperture:0,browHeight:[0,0],browTilt:[0,0]};
 for(const channel of channels){let value=initial[channel] ?? defaults[channel] ?? 0,at=0;
  for(const key of keys){if(key.pose[channel]===undefined)continue;
   if(f>=key.at){value=key.pose[channel];at=key.at;continue;}
   value=lerp(value,key.pose[channel],motionEase((f-at)/Math.max(.000001,key.at-at),key.timing));break;
  }out[channel]=Array.isArray(value)?[...value]:value;
 }
 for(const key of keys)if(f>=key.at){if(key.emotion)out.face=key.emotion;if(key.leftHandShape)out.leftType=key.leftHandShape;if(key.rightHandShape)out.rightType=key.rightHandShape;}
 return out;
}
