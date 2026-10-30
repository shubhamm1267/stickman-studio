import test from 'node:test';
import assert from 'node:assert/strict';
import {reachPhase,reachHand,crouchForTarget} from '../shared/reach-performance.mjs';
test('reach arrives before the grip, holds contact and recovers without a jump',()=>{
 const home=[60,-130],contact=[100,0];
 for(const time of [.8,.95,1])assert.deepEqual(reachHand(home,contact,reachPhase(time,1)),contact);
 assert.deepEqual(reachHand(home,contact,reachPhase(1.4,1)),home);
 const a=reachHand(home,contact,reachPhase(1-1e-6,1));
 const b=reachHand(home,contact,reachPhase(1+1e-6,1));
 assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<.001);
});
test('low contact bends the body while both planted feet retain their locations',()=>{
 const s={hip:[0,-160],head:[0,-405],headAngle:0,leftHand:[-60,-130],rightHand:[60,-130],leftFoot:[-30,0],rightFoot:[35,0]};
 crouchForTarget(s,[100,0],1);
 assert.deepEqual(s.leftFoot,[-30,0]);assert.deepEqual(s.rightFoot,[35,0]);
 assert.equal(s.hip[1],-25);assert.equal(s.head[1],-270);
 assert.ok(s.leftHand[1]>-130);
});
