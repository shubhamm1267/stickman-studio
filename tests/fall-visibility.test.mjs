import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleMotionPreset} from '../shared/motion-presets.mjs';
const fallPose=(rest,t)=>sampleMotionPreset('sideLanding',rest,t);
import {localToWorld} from '../shared/math.mjs';
import {foregroundLimbs} from '../shared/occlusion.mjs';
import {actor} from '../renderer/draw.mjs';
const rest={position:[220,780],scale:.85,hip:[0,-160],head:[0,-405],leftHand:[-60,-130],rightHand:[60,-130],leftFoot:[-30,0],rightFoot:[35,0]};
test('fall folds knees before landing and keeps the lowest contact on the floor at 60/120 fps',()=>{
 for(const fps of [60,120])for(let i=0;i<=fps;i++){
  const s={...rest,...fallPose(rest,i/fps)};
  const bottom=Math.max(...['hip','leftFoot','rightFoot','rightHand'].map(k=>localToWorld(s,s[k])[1]));
  assert.ok(Math.abs(bottom-780)<.001);
 }
 const crouch=fallPose(rest,.16),land=fallPose(rest,.76),settle=fallPose(rest,1);
 assert.ok(crouch.hip[1]>rest.hip[1]+20);assert.ok(land.bodyAngle>70);assert.equal(land.hip[1],0);
 assert.notEqual(land.bodyAngle,settle.bodyAngle);
});
test('bare head-hold hands bring both connected arms in front of the face',()=>{
 const s={...rest,rigVersion:2,head:[0,-245],hip:[0,0],leftHand:[-55,-295],rightHand:[55,-295],headAngle:0,muscle:0};
 const limbs=foregroundLimbs({beats:[]},0,{man:s},{},'man');
 assert.deepEqual(limbs.forearms,['leftHand','rightHand']);
 const svg=actor({skin:'#eee',artStyle:'pencil'},{...s,overlayHands:limbs.hands,overlayForearms:limbs.forearms},0,'full',true);
 assert.match(svg,/data-foreground-arm="leftHand"/);assert.match(svg,/data-foreground-arm="rightHand"/);
});
