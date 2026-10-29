export function scoldKeys(facing=1){const d=facing,K=(at,pose,emotion,hand)=>({at,pose,emotion,...(hand?{rightHandShape:hand}:{})});return[
 K(0,{rightHand:[d*60,-150],leftHand:[-60,-150],headAngle:0},'annoyed','fist'),
 K(.12,{rightHand:[d*60,-440],headAngle:-5,headScale:[1.04,.98]},'annoyed','point'),
 K(.28,{rightHand:[d*110,-345],leftHand:[-d*65,-245],headAngle:5},'annoyed','open'),
 K(.4,{rightHand:[d*60,-430],headAngle:-7,headScale:[.98,1.04]},'annoyed','point'),
 K(.54,{rightHand:[d*85,-255],headAngle:3,headScale:[1,1]},'annoyed','fist'),
 K(.68,{rightHand:[d*100,-320],leftHand:[-d*100,-300],headAngle:-4},'shock','open'),
 K(.82,{rightHand:[d*60,-430],leftHand:[-d*60,-150],headAngle:2},'annoyed','point'),
 K(1,{rightHand:[d*60,-150],leftHand:[-d*60,-150],headAngle:0,headScale:[1,1]},'annoyed','fist')];}
export const punchPhases={windup:.25,contact:.42,hold:.5};
