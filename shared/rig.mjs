import {add,ik}from './math.mjs';
// V2 shoulders belong to the torso, not to head rotation.
export function neckOf(s){if(s.spineAngle!==undefined){const a=s.spineAngle*Math.PI/180;return add(s.hip,[164*Math.sin(a),-164*Math.cos(a)]);}return s.rigVersion===2?add(s.hip,[0,-164]):add(s.head,[-Math.sin(s.headAngle*Math.PI/180)*76,Math.cos(s.headAngle*Math.PI/180)*76]);}
export const shoulderOf=s=>add(neckOf(s),[0,24]);
export const armRoot=(s,left)=>add(shoulderOf(s),[(left?-1:1)*(s.shoulderWidth??8),0]);
export function wristDirection(elbow,wrist,explicit=0,type='fist'){return type==='grip'?explicit:(Math.atan2(wrist[1]-elbow[1],wrist[0]-elbow[0])*180/Math.PI+90+explicit);}

// Canonical segment artwork runs from (0,0) to (0,100). Skin the artwork
// against the same IK solution used by the native limbs, without AI having
// to redraw each limb on every keyframe.
export const SEGMENT_BONES=['leftUpperArm','leftForearm','rightUpperArm','rightForearm','leftThigh','leftShin','rightThigh','rightShin'];
export function segmentAnchor(bone,s) {
  const left=bone.startsWith('left'),arm=/Arm|Forearm/.test(bone);
  const root=arm?armRoot(s,left):s.hip;
  const target=arm?s[left?'leftHand':'rightHand']:s[left?'leftFoot':'rightFoot'];
  const side=arm?(s[left?'leftElbowSide':'rightElbowSide']??(target[1]<s.head[1]+85||s.flex?(left?-1:1):(left?1:-1))):(s[left?'leftKneeSide':'rightKneeSide']??(left?1:-1));
  const solved=ik(root,target,arm?98:86,arm?102:86,side);
  const distal=/Forearm|Shin/.test(bone),a=distal?solved.elbow:root,b=distal?solved.hand:solved.elbow;
  return {position:a,rotation:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI-90,scale:[1,Math.hypot(b[0]-a[0],b[1]-a[1])/100]};
}
