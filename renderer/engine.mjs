import {locomotionPose} from "../shared/locomotion.mjs";
import {resolvePartAttachments} from "../shared/part-attachments.mjs";
import{foregroundLimbs}from"../shared/occlusion.mjs";
import {sampleMotionPreset} from "../shared/motion-presets.mjs";
import {evaluateMotion,performanceTrack} from "../shared/motion-ir.mjs";
import{neckOf,armRoot}from"../shared/rig.mjs";
import{scoldKeys,punchPhases}from"../shared/choreography.mjs";
import{settle,impactJolt}from"../shared/secondary-motion.mjs";
import {performancePose} from "../shared/performance.mjs";
import { locateFrame } from "../shared/timeline.mjs";
import { ease, lerp, add, ik, clamp, motionEase, localToWorld, worldToLocal } from "../shared/math.mjs";
import { group, actor, prop, background, path, effect, animal, groundShadow, visualSpec as renderVisualSpec } from "./draw.mjs";
import { compileSceneGraph } from "../shared/scene-graph.mjs";
export function locate(plan, t) {
  let off = 0;
  for (let i = 0; i < plan.scenes.length; i++) {
    let s = plan.scenes[i];
    if (t < off + s.duration || i === plan.scenes.length - 1)
      return { scene: s, time: Math.max(0, t - off), offset: off, index: i };
    off += s.duration;
  }
}
function base(c) {
  const state = {
    rigVersion:c.rigVersion,
    shoulderWidth:c.shoulderWidth,
    sweat:0,
    blush:0,
    headScale:[1,1],
    eyeOpen:undefined,
    mouthOpen:undefined,
    handScale:1,
    leftWristAngle:0,
    gait: 0,
    gaitPhase: 0,
    shadow: c.shadow !== false,
    species: c.species,
    groundY: c.y,
    position: [c.x, c.y],
    scale: c.scale,
    facing: c.facing,
    gaze: [7, 4],
    head: ["dog","cat","lion"].includes(c.species) ? [66,-110] : [0, -405],
    hip: [0, -160],
    leftHand: [-60, -130],
    rightHand: [60, -130],
    leftFoot: [-30, 0],
    rightFoot: [35, 0],
    wristAngle: 0,
    bodyAngle: 0,
    headAngle: 0,
    muscle: 0,
    face: "neutral",
    red: 0,
    flex: false,
    leftType: "fist",
    rightType: "fist",
    talk: 0,
    wrap: 0,
    ...Object.fromEntries(Object.entries(c.initialPose || {}).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    face: c.emotion || "neutral",
  };
  if(state.spineAngle!==undefined&&!c.initialPose?.head){const a=state.spineAngle*Math.PI/180;state.head=[state.hip[0]+245*Math.sin(a),state.hip[1]-245*Math.cos(a)];state.headAngle+=state.spineAngle;}
  return state;
}
const target = (p, dx, dy, s) => {const a=(p.angle||0)*Math.PI/180;return worldToLocal(s,[p.position[0]+(dx*Math.cos(a)-dy*Math.sin(a))*p.scale,p.position[1]+(dx*Math.sin(a)+dy*Math.cos(a))*p.scale]);};
const move = (s, k, v, u) => (s[k] = lerp(s[k], v, u));
const rotatePoint = (point, degrees) => {
  const angle = degrees * Math.PI / 180;
  return [
    point[0] * Math.cos(angle) - point[1] * Math.sin(angle),
    point[0] * Math.sin(angle) + point[1] * Math.cos(angle),
  ];
};
function resolveLocalAttachment(prop, owner, actor, design) {
  const head = owner.hand === "head",
    boneAngle = head ? actor.headAngle : owner.hand === "rightHand" ? actor.wristAngle || 0 : actor.leftWristAngle || 0,
    offset = [...owner.offset];
  if (head && actor.rigVersion === 2)
    offset.splice(0, offset.length, ...offset.map((v, i) => v * (actor.headScale?.[i] || 1)));
  const localOffset = rotatePoint(offset, boneAngle),
    bonePoint = add(actor[owner.hand], localOffset),
    anchorPoint = localToWorld(actor, bonePoint),
    angle = (owner.baseAngle || 0) + (actor.bodyAngle || 0) + boneAngle,
    propAnchor = owner.propAnchorId && [
      ...(design?.interactionAnchors || []),
      ...(design?.visualSpec?.motionAnchors || []),
    ].find(a => a.id === owner.propAnchorId);
  prop.angle = angle;
  if (propAnchor) {
    const anchorOffset = rotatePoint(propAnchor.position.map(v => v * prop.scale), angle);
    prop.position = [anchorPoint[0] - anchorOffset[0], anchorPoint[1] - anchorOffset[1]];
  } else {
    prop.position = anchorPoint;
  }
}
function scaleAt(scene,id,t) {
 const p=scene.props.find(p=>p.designId===id);
 let scale=p.scale*(p.attachment?scene.cast.find(c=>c.characterId===p.attachment.actorId).scale:1);
 for(const m of [...(scene.motions||[])].filter(m=>m.targetId===id&&m.start<=t).sort((a,b)=>a.start-b.start))if(m.scale!==undefined)scale=lerp(scale,m.scale,ease((t-m.start)/m.duration));
 return scale;
}
export function evaluate(scene, t, designs, memo = new Map()) {
  if(memo.has(t))return memo.get(t);
  let states = Object.fromEntries(
      scene.cast.map((c) => [c.characterId, base(c)]),
    ),
    props = Object.fromEntries(
      scene.props.map((p) => [
        p.designId,
        {
          position: [p.x, p.y],
          scale: p.scale*(p.attachment ? scene.cast.find(c=>c.characterId===p.attachment.actorId).scale : 1),
          open: p.open || 0,
          owner: p.attachment && (p.attachAt===undefined || t>=p.attachAt) ? {actorId:p.attachment.actorId,hand:p.attachment.bone,offset:p.attachment.offset,propAnchorId:p.attachment.propAnchorId,baseAngle:p.angle||0,local:true} : null,
          angle: p.angle || 0,
        },
      ]),
    );
  for(const placement of scene.props)for(const event of placement.attachmentEvents||[])if(t>=event.at){const q=props[placement.designId],a=event.attachment;if(!a){const prior=event.at>0?evaluate(scene,event.at-0.000001,designs,memo).props[placement.designId]:q;q.position=event.position?[...event.position]:[...prior.position];q.angle=event.angle??prior.angle;}q.owner=a?{actorId:a.actorId,hand:a.bone,offset:a.offset,propAnchorId:a.propAnchorId,baseAngle:placement.angle||0,local:true}:null;}
  for (const m of [...(scene.motions || [])].sort(
    (a, b) => a.start - b.start,
  )) {
    if (t < m.start) continue;
    let p = props[m.targetId],
      u = m.timing==="gravity"?clamp((t-m.start)/m.duration)**2:m.timing==="linear"?clamp((t-m.start)/m.duration):ease((t - m.start) / m.duration);
    p.position = lerp(p.position, m.to, u);
    p.position[1] -= Math.sin(Math.PI * u) * m.arc;
    p.angle = lerp(p.angle, m.angle, u);
    if (m.scale !== undefined) p.scale = lerp(p.scale, m.scale, u);
  }
  for (const b of [...scene.beats].sort((a, b) => a.start - b.start)) {
    if (t < b.start) continue;
    let s = states[b.actorId],
      p = props[b.targetId],
      u = motionEase((t - b.start) / b.duration, b.timing),
      active = t < b.start + b.duration,
      kind = b.kind,
      hand = b.hand === "left" ? "leftHand" : "rightHand";
    if(p?.owner?.local) {
      const a=states[p.owner.actorId],design=designs.find(d=>d.id===b.targetId);
      resolveLocalAttachment(p,p.owner,a,design);
    }
    if (b.emotion) s.face = b.emotion;
    if(b.leftHandShape)s.leftType=b.leftHandShape;
    if(b.rightHandShape)s.rightType=b.rightHandShape;
    const reachJar = () => {
      s.leftType = "grip";
      s.rightType = "grip";
      s.flex = false;
      move(s, "leftHand", target(p, -26, 8, s), u);
      move(s, "rightHand", target(p, 15, -38, s), u);
    };
    if (["walk", "run"].includes(kind)) {
      let from = [...s.position],
        to = b.to || from,
        dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
      s.position = lerp(from, to, u);
      s.groundY = s.position[1];
      s.facing = to[0] < from[0] ? -1 : 1;
      if (!["dog","cat","lion"].includes(s.species)) {
        const gait=locomotionPose({from,to,time:Math.min(t-b.start,b.duration),duration:b.duration,scale:s.scale,kind,timing:b.timing});
        s.leftFoot=gait.leftFoot;s.rightFoot=gait.rightFoot;s.gait=gait.gait;s.gaitPhase=gait.gaitPhase;
        s.hip[1]+=gait.bob;s.head[1]+=gait.bob;
        s.leftKneeSide=s.rightKneeSide=-s.facing;
        s.leftElbowSide=s.rightElbowSide=s.facing;
        if(active)for(const [h,sg] of [["leftHand",-1],["rightHand",1]]) {
          if(!Object.values(props).some(p=>p.owner?.actorId===b.actorId&&p.owner.hand===h)) {
            s[h]=kind==="run"?[s.facing*15+gait.swing*sg*65,-180-gait.swing*sg*s.facing*25]:[sg*35+gait.swing*sg*24,-115-Math.abs(gait.swing)*7];
            s[h==="leftHand"?"leftType":"rightType"]=kind==="run"?"fist":"open";
          }
        }
      } else       if (active) {
        let travelled = dist * u,
          q = (travelled * 0.62) / ((["dog","cat","lion"].includes(s.species) ? 56 : 68) * s.scale * (s.species === "lion" ? 1.4 : s.species === "cat" ? .85 : 1)),
          cycle = (phase) => {
            let f = (q + phase) % 1;
            return f < 0.62
              ? [s.facing * (34 - (68 * f) / 0.62), 0]
              : [
                  s.facing * (-34 + 68 * ease((f - 0.62) / 0.38)),
                  -(kind === "run" ? 52 : 30) *
                    Math.sin((Math.PI * (f - 0.62)) / 0.38),
                ];
          };
        s.gait = 1;
        s.gaitPhase = q * Math.PI * 2;
        let z = [cycle(0), cycle(0.5)];
        z[0][0] -= 15;
        z[1][0] += 15;
        let settle = ease(((t - b.start) / b.duration - 0.92) / 0.08);
        s.leftFoot = lerp(z[0], [-30, 0], settle);
        s.rightFoot = lerp(z[1], [35, 0], settle);
        s.head[1] += Math.abs(Math.sin(q * Math.PI * 2)) * 3;
        for (const [h, sg] of [
          ["leftHand", -1],
          ["rightHand", 1],
        ])
          if (
            !Object.values(props).some(
              (p) => p.owner?.actorId === b.actorId && p.owner.hand === h,
            )
          )
            s[h] = [sg * 45 + Math.sin(q * Math.PI * 2) * sg * 20, -130];
      }
    }
    if (["hold", "reach", "struggle"].includes(kind)) {
      if (kind === "reach") {
        move(s, hand, target(p, 0, 0, s), u);
        s[hand === "leftHand" ? "leftType" : "rightType"] = "open";
      } else reachJar();
      if (kind === "struggle") {
        s.face = b.emotion || "strain";
        if (active) {
          let amp = Math.min(
              1,
              (t - b.start) * 7,
              (b.start + b.duration - t) * 9,
            ),
            v = Math.sin(t * 53) * amp * b.amount;
          s.red = b.amount;
          s.head[0] += 10 + v * 1.8;
          s.head[1] += 12;
          s.headAngle += 6 + v;
          s.leftHand[0] += v * 0.6;
          s.rightHand[0] -= v * 0.6;
          s.wristAngle = v * 4;
        }
      }
    }
    if (kind === "flex") {
      s.flex = true;
      move(s, "leftHand", [-125, -330], u);
      move(s, "rightHand", [125, -330], u);
      s.leftType = s.rightType = "fist";
      s.muscle = lerp(s.muscle, Math.min(1.3, b.amount), u);
      s.face = b.emotion || "smug";
      s.headAngle = -6;
    }
    if (kind === "deflate") {
      s.muscle = lerp(s.muscle, 0, u);
      s.face = "defeat";
      s.headAngle = 10;
      s.head[1] += 20 * u;
    }
    if (["react", "idle", "laugh", "cry", "talk"].includes(kind)) {
      if (kind !== "idle")
        s.face =
          b.emotion ||
          { laugh: "laugh", cry: "cry", talk: "talk" }[kind] ||
          "shock";
      if (kind === "react") {
        move(s, "leftHand", [-62, -130], u);
        move(s, "rightHand", [62, -130], u);
        s.flex = false;
        s.red = 0;
      }
      if (active && kind === "laugh") {
        s.head[1] += Math.sin(t * 18) * 4;
        s.headAngle = Math.sin(t * 8) * 4;
      }
      if (active && kind === "talk")
        s.talk = 0.2 + Math.abs(Math.sin(t * 16)) * 0.8;
    }
    if (kind === "tap") {
      s.leftType = "grip";
      s.rightType = "point";
      move(s, "leftHand", target(p, -26, 8, s), Math.min(1, u * 6));
      let f = clamp((t - b.start) / b.duration),
        count = Math.max(1, Math.round(b.amount)),
        q = 0;
      for (let i = 0; i < count; i++) {
        let center = 0.35 + (i * 0.45) / Math.max(1, count - 1);
        q = Math.max(q, Math.max(0, 1 - Math.abs(f - center) / 0.12));
      }
      move(s, "rightHand", target(p, 5, -32 + 14 * q, s), Math.min(1, u * 6));
    }
    if (kind === "open") {
      p.open = u;
      reachJar();
      s.rightHand = target(p, 23 + 7.6 * u, -35 - 59 * u, s);
      s.face = b.emotion || "calm";
    }
    if (kind === "swat") {
      let f = clamp((t - b.start) / b.duration),
        v =
          f < 0.42
            ? ease(f / 0.42)
            : f < 0.64
              ? 1
              : 1 - ease((f - 0.64) / 0.36),
        contact = b.to ? worldToLocal(s,b.to) : target(p, 0, 0, s),
        prep = [hand === "leftHand" ? -145 : 145, -295];
      s[hand] =
        f < 0.42
          ? lerp(s[hand], prep, ease(f / 0.42))
          : f < 0.64
            ? lerp(prep, contact, ease((f - 0.42) / 0.22))
            : lerp(
                contact,
                [hand === "leftHand" ? -62 : 62, -130],
                ease((f - 0.64) / 0.36),
              );
      s[hand === "leftHand" ? "leftType" : "rightType"] = "open";
      s.flex = false;
    }
    if (kind === "sneeze" && active) {
      let f = (t - b.start) / b.duration,
        inhale = Math.sin(Math.PI * Math.min(1, f / 0.6)),
        blast = Math.max(0, 1 - Math.abs(f - 0.68) / 0.13);
      s.headAngle = -16 * inhale + 32 * blast;
      s.head[0] -= 12 * inhale;
      s.head[1] -= 12 * inhale;
      s.face = blast > 0.2 ? "shock" : "strain";
      s.red = 0.2 * inhale;
    }
    if (kind === "duck") {
      move(s, "head", [0, -285], u);
      move(s, "hip", [0, -90], u);
      move(s, "leftHand", [-90, -190], u);
      move(s, "rightHand", [90, -190], u);
      s.flex = false;
    }
    if (kind === "stand") {
      move(s,"position",[s.position[0],s.groundY],u);
      move(s,"leftFoot",[-30,0],u);
      move(s,"rightFoot",[35,0],u);
      s.bodyAngle = lerp(s.bodyAngle || 0, 0, u);
      move(s, "head", [0, -405], u);
      move(s, "hip", [0, -160], u);
      move(s, "leftHand", [-60, -130], u);
      move(s, "rightHand", [60, -130], u);
      s.headAngle = lerp(s.headAngle, 0, u);
    }
    if (kind === "wave" && active) {
      move(
        s,
        hand,
        [hand === "leftHand" ? -110 : 110, -370 + Math.sin(t * 14) * 18],
        Math.min(1, u * 5),
      );
      s[hand === "leftHand" ? "leftType" : "rightType"] = "open";
    }
    if (kind === "dance" && active) {
      let q = (t - b.start) * 9;
      s.headAngle = Math.sin(q) * 9;
      s.hip[0] += Math.sin(q) * 16;
      s.leftHand = [-100, -260 + Math.sin(q) * 50];
      s.rightHand = [100, -260 - Math.sin(q) * 50];
      s.leftFoot[1] -= Math.max(0, Math.sin(q)) * 18;
      s.rightFoot[1] -= Math.max(0, -Math.sin(q)) * 18;
    }
    if (kind === "point") {
      move(s, hand, b.to || [90, -250], u);
      s[hand === "leftHand" ? "leftType" : "rightType"] = "point";
    }
    if (kind === "pick") {
      let d = designs.find((x) => x.id === b.targetId),
        off = d?.gripOffset || (d?.type === "cup" ? [12, 2] : d?.type === "headphones" ? [65,0] : d?.type === "cap" ? [82,3] : [0, 0]);
      if(p.owner?.hand==='head'&&p.owner.actorId===b.actorId){
        // Reach around the face through a nearly straight outer elbow, then lift over the crown.
        // Changing elbow branch at full extension avoids an elbow pop or a forearm through the eyes.
        const side=hand==='leftHand'?-1:1,sh=add(neckOf(s),[side*8,24]),way=add(sh,[side*200,0]),end=target(p,...off,s);
        s[hand]=u<.5?lerp(s[hand],way,ease(u*2)):lerp(way,end,ease((u-.5)*2));
        s[hand==='leftHand'?'leftElbowSide':'rightElbowSide']=u<.5?-side:side;
      }else move(s, hand, target(p, ...off, s), u);
      s[hand === "leftHand" ? "leftType" : "rightType"] = "grip";
      if (u > 0.98)
        p.ownerChangedAt=b.start+b.duration*.98;
      if (u > 0.98)
        p.owner = {
          actorId: b.actorId,
          hand,
          offset: [-off[0] * p.scale, -off[1] * p.scale],
        };
    }
    if(kind === "drink") {
      const f=clamp((t-b.start)/b.duration), lift=f<.27?ease(f/.27):f<.72?1:1-ease((f-.72)/.28),
        tilt=-s.facing*72*lift, a=tilt*Math.PI/180,
        d=designs.find(d=>d.id===b.targetId), top=d.type==="cup"?-12:d.type==="bottle"?-62:-42,
        ha=s.headAngle*Math.PI/180,mouth=add(s.head,[s.facing*10*Math.cos(ha)-39*Math.sin(ha),s.facing*10*Math.sin(ha)+39*Math.cos(ha)]), v=top*p.scale/s.scale,
        center=[mouth[0]+v*Math.sin(a),mouth[1]-v*Math.cos(a)];
      s[hand]=lerp(s[hand],center,lift);s[hand==="leftHand"?"leftWristAngle":"wristAngle"]=tilt===0?0:tilt;
      s[hand==="leftHand"?"leftType":"rightType"]="grip";
      p.owner={actorId:b.actorId,hand,offset:[0,0]};
      p.level=Math.max(0,(d.stock??1)-b.amount*ease((f-.27)/.45));
      if(active && lift>.95){s.face="kiss";s.mouthOpen=.5;}
    }
    if (kind === "throw") {
      let f = clamp((t-b.start)/b.duration), release=.4, prep=[s.facing*95,-300];
      s[hand] = f < release ? lerp(s[hand],prep,ease(f/release)) : lerp(prep,[s.facing*125,-225],ease((f-release)/.6));
      if (f >= release) {
        p.ownerChangedAt=b.start+b.duration*release;
        p.drivenUntil = b.start + b.duration;
        p.scale = scaleAt(scene,b.targetId,b.start);
        p.owner = null;
        let launch=[s.position[0]+prep[0]*s.scale,s.position[1]+prep[1]*s.scale],v=clamp((f-release)/.6);
        p.position=lerp(launch,b.to,v); p.position[1]-=Math.sin(Math.PI*v)*90*b.amount;
        p.angle=360*v;
      }
    }
    if (kind === "place") {
      const to = b.to || p.position,
        design = designs.find((x) => x.id === b.targetId),
        off = design?.gripOffset || (design?.type === "cup" ? [12,2] : design?.type === "headphones" ? [65,0] : design?.type === "cap" ? [82,3] : [0,0]);
      p.angle=(s.bodyAngle||0)+(hand==="rightHand"?s.wristAngle||0:0);
      const pa=p.angle*Math.PI/180,anchor=[to[0]+(off[0]*Math.cos(pa)-off[1]*Math.sin(pa))*p.scale,to[1]+(off[0]*Math.sin(pa)+off[1]*Math.cos(pa))*p.scale];
      move(
        s,
        hand,
        worldToLocal(s,anchor),
        u,
      );
      if (!active) {
        p.ownerChangedAt=b.start+b.duration;
        p.drivenUntil = b.start + b.duration;
        p.scale = scaleAt(scene,b.targetId,b.start);
        p.owner = null;
        p.position = [...to];
        const bin = scene.props.find(q => designs.find(d => d.id === q.designId)?.type === "dustbin" && Math.abs(q.x-to[0]) < 58*q.scale && to[1] > q.y-150*q.scale && to[1] < q.y);
        if (bin) p.containedBy = bin.designId;
      }
    }
    if (kind === "jump") {
      if (active) {
        let v = Math.sin((Math.PI * (t - b.start)) / b.duration);
        s.position[1] -= v * 100 * b.amount;
      }
    }
    if (kind === "fall") {
      Object.assign(s,sampleMotionPreset('sideLanding',s,(t-b.start)/b.duration));
      s.face=b.emotion||"shock";
    }
    if (kind === "sit") {
      move(s, "hip", [0, -100], u);
      move(s, "leftFoot", [-60, 0], u);
      move(s, "rightFoot", [65, 0], u);
      s.head[1] += 55 * u;
    }
    if (kind === "fart" && active) {
      let q =
        Math.sin((t - b.start) * 48) *
        Math.sin((Math.PI * (t - b.start)) / b.duration);
      s.hip[0] += q * 3 * b.amount;
      s.headAngle += q * 2;
      s.face = b.emotion || "strain";
      s.red = 0.4;
    }
    if (kind === "nosePinch") {
      move(s, hand, add(s.head, [s.facing * 26, 9]), u);
      s[hand === "leftHand" ? "leftType" : "rightType"] = "grip";
      s.face = b.emotion || "annoyed";
      s.flex = false;
    }
    if (kind === "scoot" && active) {
      let f = (t - b.start) / b.duration,
        v = Math.sin(f * Math.PI * 4) * Math.sin(Math.PI * f);
      s.position[0] += v * 7 * b.amount;
      s.headAngle += v * 5;
      s.hip[0] += v * 3;
    }
    if (kind === "panic" && active) {
      let f = (t - b.start) / b.duration,
        v = Math.sin(f * 30);
      s.headAngle += v * 4;
      s.head[0] += v * 2;
      s.face = b.emotion || "shock";
      s.red = 0.2;
    }
    if (kind === "pullPaper") {
      let f = clamp((t - b.start) / b.duration),
        v = ease(f);
      const dest = b.to || p.position,
        from = target(p, 12, 30, s),
        to = [
          (dest[0] - s.position[0]) / s.scale,
          (dest[1] - s.position[1]) / s.scale,
        ];
      s[hand] = lerp(from, to, v);
      s[hand === "leftHand" ? "leftType" : "rightType"] = "grip";
      p.paper = Math.max(p.paper || 0, v * b.amount);
      p.spin = v * 540 * b.amount;
      p.tether = { actorId: b.actorId, hand };
    }
    if (kind === "wrap") {
      s.wrap = lerp(s.wrap, Math.min(1, b.amount), u);
      p.paper = Math.max(p.paper || 0, u * 3);
      p.spin = u * 1600;
      p.tether = { actorId: b.actorId, hand };
      if (active) {
        s.headAngle += Math.sin(t * 18) * 4;
        s.face = b.emotion || "shock";
      }
    }
    if (kind === "tearFree") {
      s.wrap = lerp(s.wrap, 0, u);
      p.tether = null;
      p.paperEnd = null;
      p.paper = 0;
      s.face = b.emotion || "shock";
    }
    if (kind === "openDoor") {
      let f = clamp((t - b.start) / b.duration),
        v = ease((f - 0.35) / 0.65),
        shrink = 1 - 0.9 * v;
      p.open = v;
      move(s, hand, target(p, -65 + 93 * shrink, 0, s), Math.min(1, u * 3));
      s[hand === "leftHand" ? "leftType" : "rightType"] = "grip";
    }
    { let f = clamp((t-b.start)/b.duration);
      if (kind === "roar") {
        s.roar = active ? Math.sin(Math.PI*f) : 0;
        s.face = active ? "jawdrop" : "smug";
        s.headAngle = active ? -12*Math.sin(Math.PI*f) : 0;
      }
      if (kind === "cower") { s.cower = motionEase(f, b.timing); s.face = "shock"; }
      if (kind === "pawPress") {
        let p = props[b.targetId];
        let press = active ? Math.sin(Math.PI*f) : 0;
        s.press = press;
        s.pawTarget = p.position;
        p.squash = .22*press;
      }
      if (kind === "slip") {
        const origin=[...s.position],dest=b.to||[origin[0]+100,origin[1]];
        Object.assign(s,sampleMotionPreset('sideLanding',s,f,{to:dest}));
        s.face = "shock";
      }
    }
    if(kind === "scold")Object.assign(s,performancePose(s,scoldKeys(s.facing),clamp((t-b.start)/b.duration)));
    if(kind === "punch"){
      const f=clamp((t-b.start)/b.duration),v=b.targetActorId?states[b.targetActorId]:null,
       point=b.to||(v?localToWorld(v,add(v.head,[-s.facing*34,13])):localToWorld(s,[s.facing*150,-350])),
       contact=worldToLocal(s,point),home=s[hand],prep=[-s.facing*85,-285];
      if(active){
       s[hand]=f<.25?lerp(home,prep,ease(f/.25)):f<.42?lerp(prep,contact,ease((f-.25)/.17)):f<.5?contact:lerp(contact,home,ease((f-.5)/.5));
       s.hip[0]+=-s.facing*8*Math.sin(Math.PI*Math.min(1,f/.42));
       s.head[0]+=-s.facing*6*Math.sin(Math.PI*Math.min(1,f/.42));
       s[hand==='leftHand'?'leftType':'rightType']='fist';s.face=b.emotion||'annoyed';
       const age=t-b.start-b.duration*.42;
       if(v && b.hit!==false && age>=0){const peak=age<.04?ease(age/.04):settle(age-.04,{stiffness:380,damping:14});
        v.head[0]+=s.facing*22*peak;v.headAngle+=s.facing*13*peak;v.headScale=[1+.18*peak,1-.17*peak];v.eyeOpen=age<.09?0:.8;v.face=age<.09?'strain':'jawdrop';v.blush=.45*Math.max(0,peak);
       }
      }
    }
    if (kind === "perform") Object.assign(s,evaluateMotion(s,performanceTrack(scene,b),clamp((t-b.start)/b.duration)));
    if (kind === "custom") {
      for (const [k, v] of Object.entries(b.pose)) move(s, k, v, u);
      if(b.pose.spineAngle!==undefined&&!b.pose.head){const a=s.spineAngle*Math.PI/180;s.head=[s.hip[0]+245*Math.sin(a),s.hip[1]-245*Math.cos(a)];s.headAngle=s.spineAngle+(b.pose.headAngle||0);}
    }
  }
  // Ownership events happen on the timeline, after older persistent pick/place poses.
  // A completed pick must not reattach an object after a later release or landing.
  for(const placement of scene.props){
    const events=[...(placement.attachment?[{at:placement.attachAt||0,attachment:placement.attachment}]:[]),...(placement.attachmentEvents||[])];
    for(const event of events){if(t<event.at)continue;const p=props[placement.designId];if(event.at<(p.ownerChangedAt??-Infinity))continue;
      const a=event.attachment;p.owner=a?{actorId:a.actorId,hand:a.bone,offset:a.offset,propAnchorId:a.propAnchorId,baseAngle:placement.angle||0,local:true}:null;p.ownerChangedAt=event.at;
    }
  }
  for(const m of [...(scene.motions||[])].sort((a,b)=>a.start-b.start)) {
    const p=props[m.targetId];
    if(p.owner || p.drivenUntil === undefined || m.start < p.drivenUntil || t < m.start)continue;
    const u=m.timing==="gravity"?clamp((t-m.start)/m.duration)**2:m.timing==="linear"?clamp((t-m.start)/m.duration):ease((t-m.start)/m.duration);
    p.position=lerp(p.position,m.to,u);p.position[1]-=Math.sin(Math.PI*u)*m.arc;
    p.angle=lerp(p.angle,m.angle,u);if(m.scale!==undefined)p.scale=lerp(p.scale,m.scale,u);
  }
  // Small rant accents follow measured vocal energy before IK, without moving a grip.
  for(const cue of scene.sounds||[]){
    if(cue.role!=='nonverbal'||!cue.actorId||!cue.mouthCues?.length||t<cue.start||t>=cue.start+cue.duration)continue;
    if(!scene.beats.some(b=>b.actorId===cue.actorId&&b.kind==='scold'&&t>=b.start&&t<b.start+b.duration))continue;
    const s=states[cue.actorId],energy=cue.mouthCues[Math.min(cue.mouthCues.length-1,Math.floor((t-cue.start)/.05))].open;
    for(const hand of ['leftHand','rightHand'])if(!Object.values(props).some(p=>p.owner?.actorId===cue.actorId&&p.owner.hand===hand))s[hand][1]-=energy*(hand==='rightHand'?8:5);
  }
  // Clamp hands before attachments are resolved: props remain in the actual gripping hand.
  for (const s of Object.values(states)) {
    let neck = neckOf(s),
      sh = add(neck, [0, 24]);
    let l = ik(armRoot(s,true), s.leftHand, 98, 102, s.leftElbowSide ?? (s.flex ? -1 : 1)),
      r = ik(armRoot(s,false), s.rightHand, 98, 102, s.rightElbowSide ?? (s.flex ? 1 : -1));
    s.reachError = { left: l.error * s.scale, right: r.error * s.scale };
    s.leftHand = l.hand;
    s.rightHand = r.hand;
  }
  for (const [designId,p] of Object.entries(props))
    if (p.owner) {
      let s = states[p.owner.actorId];
      if(p.owner.hand==="leftHand")s.leftType="grip";if(p.owner.hand==="rightHand")s.rightType="grip";
      if(p.owner.local) {
        resolveLocalAttachment(p,p.owner,s,designs.find(d=>d.id===designId));continue;
      }
      let h = s[p.owner.hand], anchor=localToWorld(s,h),angle=((s.bodyAngle||0)+(p.owner.hand==="rightHand"?s.wristAngle||0:s.leftWristAngle||0))*Math.PI/180;
      p.position=[anchor[0]+p.owner.offset[0]*Math.cos(angle)-p.owner.offset[1]*Math.sin(angle),anchor[1]+p.owner.offset[0]*Math.sin(angle)+p.owner.offset[1]*Math.cos(angle)];
      p.angle=(s.bodyAngle||0)+(p.owner.hand==="rightHand"?s.wristAngle||0:s.leftWristAngle||0);
    }
  for (const p of Object.values(props))
    if (p.tether) {
      let a = states[p.tether.actorId],
        h = a[p.tether.hand];
      p.paperEnd = localToWorld(a,h);
    }
  resolvePartAttachments(scene,t,props,designs,(scene,at,designs)=>evaluate(scene,at,designs,memo));
  const effects = [];
  for(const b of scene.beats)if(b.motionEffect==='flight'&&t>=b.start&&t<b.start+b.duration){
    const a=states[b.actorId];effects.push({kind:'wind',origin:localToWorld(a,a.hip),direction:a.facing,phase:t*2,amount:a.scale});
  }
  for(const m of scene.motions||[]){const age=t-m.start-m.duration;
    if(m.impactOnEnd&&age>=0&&age<.25)effects.push({kind:'landing',origin:m.to,phase:age/.25,amount:props[m.targetId].scale});
    if(m.timing==='gravity'&&t>=m.start&&t<m.start+m.duration)effects.push({kind:'fall',origin:props[m.targetId].position,phase:(t-m.start)/m.duration,amount:props[m.targetId].scale});
  }
  for(const b of scene.beats)if((b.accent==="impact"||b.kind==="punch") && b.hit!==false && (b.contactAt!==undefined||b.kind==="punch")){
    const age=t-b.start-b.duration*(b.kind==="punch"?.42:b.contactAt);
    if(age>=0 && age<.14){const a=states[b.actorId],victim=states[b.targetActorId];const origin=victim?localToWorld(victim,add(victim.head,[-a.facing*34,13])):localToWorld(a,a[b.hand==="left"?"leftHand":"rightHand"]);effects.push({kind:"impact",origin,phase:age/.14});}
  }
  for (const b of scene.beats) {
    if (b.kind === "tearFree" && t >= b.start && t < b.start + 1.2) {
      let a = states[b.actorId];
      effects.push({
        kind: "paperBurst",
        origin: [a.position[0], a.position[1] - 240 * a.scale],
        phase: (t - b.start) / 1.2,
      });
    }
    if (b.kind !== "fart") continue;
    let age = t - b.start - b.duration * 0.2,
      life = b.duration + 0.9;
    if (age < 0 || age > life) continue;
    let a = states[b.actorId],
      origin = [a.position[0], a.position[1] + a.hip[1] * a.scale],
      end = b.to || [origin[0] + (a.facing > 0 ? -95 : 95), origin[1] - 95];
    effects.push({
      kind: "stink",
      origin,
      end,
      phase: clamp(age / life),
      amount: b.amount,
      actorId: b.actorId,
    });
  }
  const result={states,props,effects};memo.set(t,result);return result;
}
export function svgFrame(
  plan,
  t,
  { format = plan.format, thumbnail = false } = {},
) {
  const { scene, time } = locate(plan, t);
  return renderSceneFrame(plan, scene, time, { format, thumbnail });
}

export function svgFrameAtFrame(
  plan,
  frame,
  { format = plan.format, thumbnail = false } = {},
) {
  const { scene, time } = locateFrame(plan, frame);
  return renderSceneFrame(plan, scene, time, { format, thumbnail });
}

export function svgFrameForScene(
  plan,
  sceneIndex,
  sceneTime,
  { format = plan.format, thumbnail = false } = {},
) {
  const scene = plan.scenes[sceneIndex];
  if (!scene) throw Error(`Unknown scene index ${sceneIndex}.`);
  const time = Math.max(0, Math.min(scene.duration - 0.001, sceneTime));
  return renderSceneFrame(plan, scene, time, { format, thumbnail });
}

function renderSceneFrame(plan, scene, time, { format, thumbnail }) {
  const { states, props, effects } = evaluate(scene, time, plan.propDesigns);
  const land = format === "landscape",
    square = format === "square",
    w = land ? 960 : 540,
    h = land ? 540 : square ? 540 : 960,
    shot =
      scene.shots.find((q) => time >= q.start && time < q.end) ||
      scene.shots.at(-1),
    z =
      lerp(
        shot.zoom,
        shot.endZoom ?? shot.zoom,
        ease((time - shot.start) / (shot.end - shot.start)),
      ) * (land ? 0.73 : square ? 0.72 : 1),
    focus = lerp(
      shot.focus,
      shot.endFocus || shot.focus,
      ease((time - shot.start) / (shot.end - shot.start)),
    ),
    off = [w / 2 - focus[0] * z, h * (land ? 0.51 : 0.52) - focus[1] * z];
  for (const p of Object.values(props)) {p.time = time;p.sceneId=scene.id;}
  for (const v of scene.dialogue) {
    let s = states[v.actorId];
    if (
      time >= v.start &&
      time < v.start + (v.audioDuration || Math.min(8, v.text.length / 7))
    ) {
      s.speaking = true;
      const age=time-v.start;
      if(v.mouthCues?.length){const ix=Math.min(v.mouthCues.length-1,Math.floor(age/.05));s.talk=v.mouthCues[ix].open;s.mouthOpen=s.talk;}
      else s.talk=.1+Math.abs(Math.sin(age*19))*.8;
    }
  }
  for(const cue of scene.sounds){if(!cue.actorId||cue.role!=="nonverbal"||time<cue.start||time>=cue.start+cue.duration)continue;
    const s=states[cue.actorId],index=Math.floor((time-cue.start)/.05);s.speaking=true;s.talk=cue.mouthCues?.[Math.min(index,(cue.mouthCues?.length||1)-1)]?.open??.5;s.mouthOpen=s.talk;
  }
  for(const placement of scene.props){const p=props[placement.designId],design=plan.propDesigns.find(q=>q.id===placement.designId);if(design.type==="gasMask" && p.owner?.local && p.owner.hand==="head")states[p.owner.actorId].coveredMouth=true;}
  let jolt=[0,0];for(const b of scene.beats)if(b.kind==='punch'&&b.hit!==false||b.accent==='impact'){const j=impactJolt(time-b.start-b.duration*(b.kind==='punch'?.42:b.contactAt??.5));jolt=add(jolt,j);}off[0]+=jolt[0];off[1]+=jolt[1];
  const graph = compileSceneGraph({ plan, scene, time, states, props, effects, shot, camera: { focus, zoom: z } });
  const graphCharacters = graph.entities.filter((entity) => entity.category === "character");
  const graphShadows = graph.entities.filter((entity) => entity.category === "shadow");
  const graphProps = graph.entities.filter((entity) => entity.category === "prop");
  const graphEffects = graph.entities.filter((entity) => entity.category === "effect");
  const graphCamera = graph.entities.find((entity) => entity.category === "cameraTarget");
  const graphEnvironment = graph.entities.find((entity) => entity.category === "environment");
  const graphSurface = graph.entities.find((entity) => entity.category === "surface");
  const graphOff = graphCamera
    ? [w / 2 - graphCamera.pose.focus[0] * graphCamera.pose.zoom + jolt[0], h * (land ? 0.51 : 0.52) - graphCamera.pose.focus[1] * graphCamera.pose.zoom + jolt[1]]
    : off;
  const characterEntity = (cast) => graphCharacters.find((entity) => entity.sourceId === cast.characterId);
  const propEntity = (placement) => graphProps[scene.props.indexOf(placement)];
  const castOrder = [...scene.cast].sort((a, b) =>
    (characterEntity(a)?.layering.zIndex || 0) - (characterEntity(b)?.layering.zIndex || 0)
    || a.characterId.localeCompare(b.characterId),
  );
  const propOrder = [...scene.props].sort((a, b) =>
    (propEntity(a)?.layering.zIndex || 0) - (propEntity(b)?.layering.zIndex || 0)
    || `${a.designId}:${a.x}:${a.y}:${a.layer || ""}`.localeCompare(
      `${b.designId}:${b.x}:${b.y}:${b.layer || ""}`,
    ),
  );
  let d = graphEnvironment?.visible
    ? `<g data-scene-entity-category="environment" data-scene-entity-id="${graphEnvironment.id}">${background(scene.background, scene.backgroundNodes, plan.productionMode, graphSurface?.id,time,scene.id)}</g>`
    : "";
  const shown = (cast) => characterEntity(cast)?.visible === true;
  const drawing = (placement) => {
    const entity = propEntity(placement);
    if (!entity?.visible) return "";
    const value = props[placement.designId];
    const design = plan.propDesigns.find((item) => item.id === placement.designId);
    const base = {
      id: entity.id, sceneId:scene.id,
      position: value.position, rotation: value.angle || 0, scale: [value.scale, value.scale],
    };
    const behind = renderVisualSpec(design.visualSpec, time, base, {
      componentLayer: "behind", includeLegacy: false,
    });
    const overlay = renderVisualSpec(design.visualSpec, time, base, {
      componentLayer: "overlay",
    });
    const foreground = renderVisualSpec(design.visualSpec, time, base, {
      componentLayer: "foreground", includeLegacy: false,
    });
    return `<g data-scene-entity-category="prop" data-scene-entity-id="${entity.id}"><g data-prop-id="${placement.designId}">${behind}${design.visualSpec?.renderMode==='replace'?'':prop(design, value)}${overlay}${foreground}</g></g>`;
  };
  for(const c of castOrder.filter(shown)){
    const a=plan.characters.find(q=>q.id===c.characterId);
    const shadow=graphShadows.find(entity=>entity.sourceId===c.characterId);
    if(shadow?.visible)d+=`<g data-scene-entity-category="shadow" data-scene-entity-id="${shadow.id}">${groundShadow(a,states[c.characterId])}</g>`;
  }
  for(const p of propOrder)if(propEntity(p)?.layering.band==="back")d+=drawing(p);
  for(const [index,e] of effects.entries())if(e.kind!=="impact"&&graphEffects[index]?.visible)d+=`<g data-scene-entity-category="effect" data-scene-entity-id="${graphEffects[index].id}">${effect(e,time)}</g>`;
  // Selective trails on fast hands, not ghosting the whole character or camera.
  if(scene.beats.some(b=>b.kind==='punch'&&time>b.start+b.duration*.25&&time<b.start+b.duration*.52)){
    for(const lag of[1/60,2/60]){const previous=evaluate(scene,Math.max(0,time-lag),plan.propDesigns);
     for(const b of scene.beats.filter(b=>b.kind==='punch'&&time>b.start+b.duration*.25&&time<b.start+b.duration*.52)){
      const a=states[b.actorId],old=previous.states[b.actorId],bone=b.hand==='left'?'leftHand':'rightHand',from=localToWorld(old,old[bone]),to=localToWorld(a,a[bone]);
      if(Math.hypot(to[0]-from[0],to[1]-from[1])>7)d+=`<g data-hand-motion-trail="true" opacity="${lag===1/60?.22:.12}">${path(`M${from[0]} ${from[1]} Q${(from[0]+to[0])/2} ${Math.min(from[1],to[1])-12} ${to[0]} ${to[1]}`,"none",12,"#6d7565")}</g>`;
     }
    }
  }
  for(const c of castOrder.filter(shown)){
    const a={...plan.characters.find(q=>q.id===c.characterId),referenceStyle:plan.referenceStyle}, state=states[c.characterId], entity=characterEntity(c);
    const rendered=a.visualSpec?.renderMode==='replace'?'':["dog","cat","lion"].includes(a.kind)?animal(a,state,time):actor(a,state,time,shot.detail);
    const base = {
      id: entity.id, sceneId:scene.id,
      position: state.position,
      rotation: state.bodyAngle || 0,
      scale: [state.scale, state.scale],
      pose: state,
    };
    const behind = renderVisualSpec(a.visualSpec, time, base, {
      componentLayer: "behind", includeLegacy: false, pose: state,
    });
    const overlay = renderVisualSpec(a.visualSpec, time, base, {
      componentLayer: "overlay", pose: state,
    });
    const foreground = renderVisualSpec(a.visualSpec, time, base, {
      componentLayer: "foreground", includeLegacy: false, pose: state,
    });
    d+=`<g data-scene-entity-category="character" data-scene-entity-id="${entity.id}" data-actor-id="${c.characterId}">${behind}<g data-character-base="true">${rendered}</g>${overlay}${foreground}</g>`;
  }
  for(const p of propOrder)if(propEntity(p)?.layering.band==="world")d+=drawing(p);

  for(const c of castOrder.filter(shown)){
    const a=plan.characters.find(q=>q.id===c.characterId);
    const {hands,forearms}=foregroundLimbs(scene,time,states,props,c.characterId);
    if(a.visualSpec?.renderMode!=='replace' && hands.length && !["dog","cat","lion"].includes(a.kind))d+=`<g data-grip-overlay="${c.characterId}">${actor(a,{...states[c.characterId],overlayHands:hands,overlayForearms:forearms},time,shot.detail,true)}</g>`;
  }

  for(const p of propOrder)if(propEntity(p)?.layering.band==="front")d+=`<g data-foreground-prop="${p.designId}">${drawing(p)}</g>`;
  for(const [index,e] of effects.entries())if(e.kind==="impact"&&graphEffects[index]?.visible)d+=`<g data-scene-entity-category="effect" data-scene-entity-id="${graphEffects[index].id}">${effect(e,time)}</g>`;
  const cameraMarker = graphCamera
    ? ` data-scene-entity-category="cameraTarget" data-scene-entity-id="${graphCamera.id}" data-focus-x="${graphCamera.pose.focus[0]}" data-focus-y="${graphCamera.pose.focus[1]}" data-camera-zoom="${graphCamera.pose.zoom}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${plan.productionMode==="dialogue-toon"?"#ffdf63":plan.productionMode==="silent-sfx"?"#c6c7b2":"#f5f2dc"}"/><g${cameraMarker}>${group(graphOff, 0, graphCamera?.pose.zoom ?? z, d)}</g></svg>`;
}
