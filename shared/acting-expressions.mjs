// Native expressive controls. Positive brow height raises a brow in draw.mjs.
// Each score emotion has a visible pose; a neutral mouth must not flatten a
// laugh, cry or shocked face just because the actor uses directed keyframes.
export function emotionControls(emotion,intensity=1){
 const amount=Math.max(0,Math.min(1,intensity));
 const controls={eyeOpen:1,mouthAperture:0,mouthWidth:1,mouthCurve:0,browHeight:[0,0],browTilt:[0,0]};
 const poses={
  curious:{browHeight:[13,2],browTilt:[-9,6],eyeOpen:.95},
  shock:{browHeight:[15,12],browTilt:[-7,7],mouthAperture:.75,mouthWidth:1.15},
  jawdrop:{browHeight:[18,16],browTilt:[-6,6],mouthAperture:1,mouthWidth:1.25},
  laugh:{eyeOpen:.38,mouthAperture:.6,mouthCurve:.65,mouthWidth:1.35,browHeight:[5,5]},
  cry:{eyeOpen:.55,mouthAperture:.3,mouthCurve:-.7,browHeight:[7,7],browTilt:[-18,18]},
  annoyed:{eyeOpen:.55,mouthCurve:-.45,browHeight:[-5,-5],browTilt:[16,-16]},
  strain:{eyeOpen:.45,mouthCurve:-.35,mouthAperture:.25,browHeight:[-4,-4],browTilt:[18,-18]},
  extreme:{eyeOpen:.3,mouthAperture:.75,mouthCurve:-.4,mouthWidth:1.3,browHeight:[-6,-6],browTilt:[22,-22]},
  confident:{eyeOpen:.75,mouthCurve:.45,browHeight:[3,3]},
  smug:{eyeOpen:.5,mouthCurve:.55,browHeight:[9,1],browTilt:[-5,4]},
  idea:{eyeOpen:1,mouthCurve:.45,mouthAperture:.15,browHeight:[15,15]},
  kiss:{eyeOpen:.6,mouthWidth:.65,mouthAperture:.15,browHeight:[5,5]},
  defeat:{eyeOpen:.4,mouthCurve:-.4,browHeight:[-3,-3],browTilt:[-9,9]},
  calm:{eyeOpen:.65},talk:{mouthAperture:.2},neutral:{},
 };
 for(const [key,value] of Object.entries(poses[emotion]||{})){
  const baseline=controls[key];
  controls[key]=Array.isArray(value)?value.map((v,i)=>baseline[i]+(v-baseline[i])*amount):baseline+(value-baseline)*amount;
 }
 return controls;
}
