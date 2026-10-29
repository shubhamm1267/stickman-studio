import {instantiateMotionPreset} from '../shared/motion-presets.mjs';
import {migrateMotionIR} from '../shared/motion-ir.mjs';
import {DirectorScoreSchema} from '../shared/director-score.mjs';
import {validatePlan} from '../shared/schema.mjs';
import {evaluate} from '../renderer/engine.mjs';
import {localToWorld,worldToLocal,clamp} from '../shared/math.mjs';
import {inspectPlan,planHash} from './inspect.mjs';
import {normalizeComedySettings} from '../shared/comedy-category.mjs';

const X={left:145,center:270,right:395},Y={floor:780,table:590,chest:475,sky:220};
const animals=new Set(['dog','cat','lion']);
const headHoldPose=head=>({leftHand:[head[0]-55,head[1]-50],rightHand:[head[0]+55,head[1]-50]});
const cleanDesign=({slot,height,scale,onId,...design})=>design;
const poseKeys=['position','head','hip','leftHand','rightHand','leftFoot','rightFoot','bodyAngle','headAngle','muscle','wristAngle','leftWristAngle','headScale','eyeOpen','mouthOpen','gaze','sweat','blush'];

export function compileDirection(input,options={},soundScore={cues:[]}){
  const score=DirectorScoreSchema.parse(input);
  const characterIds=new Set(score.characters.map(c=>c.id)),propIds=new Set(score.props.map(p=>p.id));
  for(const event of score.scenes.flatMap(s=>s.events)){
    if(event.propId){if(event.targetId&&event.targetId!==event.propId)throw Error('Conflicting object IDs in '+event.id);event.targetId=event.propId;delete event.propId;}
    if(event.characterId){if(event.actorId&&event.actorId!==event.characterId)throw Error('Conflicting actor IDs in '+event.id);event.actorId=event.characterId;delete event.characterId;}
    if(event.verb!=='fly'&&characterIds.has(event.targetId)){
      if(event.targetActorId&&event.targetActorId!==event.targetId)throw Error('Conflicting target actors in '+event.id);
      event.targetActorId=event.targetId;delete event.targetId;
    }
    if(['place','throw','fly'].includes(event.verb)&&!event.destination)event.destination='table';
    if(!event.targetId&&['press','strain','liftAttempt','grab','open'].includes(event.verb)){
      const candidates=score.props.filter(p=>!['table','bench','chair','door','toilet','dustbin'].includes(p.type));
      if(candidates.length===1)event.targetId=candidates[0].id;
    }
    if(event.verb==='fly'){
      if(propIds.has(event.actorId)){
        const moving=event.actorId;if(characterIds.has(event.targetId)){event.targetActorId=event.targetId;event.targetId=moving;}
        else if(event.targetId&&event.targetId!==moving){event.targetPropId=event.targetId;event.targetId=moving;if(!['floor','sky'].includes(event.destination))event.destination='table';}
        else event.targetId=moving;
        event.actorId=characterIds.has(event.targetActorId)?event.targetActorId:score.characters[0].id;
      }
      if(!event.actorId)event.actorId=characterIds.has(event.targetActorId)?event.targetActorId:score.characters[0].id;
      if(!event.targetActorId&&score.characters.length===1&&['face','crown','leftHand','rightHand'].includes(event.destination))event.targetActorId=score.characters[0].id;
    }else if(!event.actorId&&score.characters.length===1)event.actorId=score.characters[0].id;
  }
  if(options.durationMode==='manual'){
    const events=score.scenes.flatMap(s=>s.events),minimum=events.length*.35,total=events.reduce((n,e)=>n+e.duration,0),target=options.duration;
    if(target<minimum)throw Error('Too many actions to read within the requested duration.');
    for(const e of events)e.duration=.35+(target-minimum)*(total>minimum?(e.duration-.35)/(total-minimum):1/events.length);
    if(events.some(e=>e.duration>8))throw Error('The requested duration needs more story events instead of a long static hold.');
  }
  if(score.blockedReasons.length)throw Error('Unsupported story: '+score.blockedReasons.join('; '));
  const characters=score.characters.map(c=>({...cleanDesign(c),rigVersion:2,artStyle:'pencil'}));
  const propDesigns=score.props.map(cleanDesign),coverage=[],requirements=[],scenes=[],eventMap=new Map();
  const allIds=[...characters.map(c=>c.id),...propDesigns.map(p=>p.id)];
  if(new Set(allIds).size!==allIds.length)throw Error('Director IDs must be unique.');
  let previous;
  for(const source of score.scenes){
    const duration=source.events.reduce((sum,e)=>sum+e.duration,0);
    if(duration<2||duration>60)throw Error('Scene duration must be between 2 and 60 seconds.');
    const scene={id:source.id,summary:source.summary,duration,background:source.background,backgroundNodes:[],cast:score.characters.map(c=>({characterId:c.id,rigVersion:2,species:c.kind,x:X[c.slot],y:780,scale:c.scale,facing:c.slot==='right'?-1:1,emotion:'curious'})),props:score.props.map(p=>({designId:p.id,x:X[p.slot],y:p.type==='table'?780-188*p.scale:p.type==='bench'?780-55*p.scale:Y[p.height],scale:p.scale,angle:0,open:0})),beats:[],motions:[],shots:[],sounds:[],dialogue:[]};
    for(const p of score.props){if(!p.onId)continue;const base=scene.props.find(q=>q.designId===p.onId),placed=scene.props.find(q=>q.designId===p.id);if(!base)throw Error('Unknown supporting object '+p.onId);placed.x=base.x;placed.y=base.y-30*p.scale;}
    const supports=new Set(score.props.map(p=>p.onId).filter(Boolean));
    const solids=scene.props.filter(p=>supports.has(p.designId)||['table','bench','chair','toilet','dustbin'].includes(propDesigns.find(d=>d.id===p.designId).type));
    const staged=[];
    for(const actor of scene.cast){
      const clear=x=>solids.every(p=>Math.abs(x-p.x)>80*p.scale+30*actor.scale)&&staged.every(a=>Math.abs(x-a.x)>55*(a.scale+actor.scale)+5);
      const choices=[actor.x,145,395,75,465,225,315].sort((a,b)=>Math.abs(a-actor.x)-Math.abs(b-actor.x));
      const x=choices.find(clear);if(x===undefined)throw Error('Stage is too crowded to keep cast and furniture readable; split the scene or change staging.');
      actor.x=x;staged.push(actor);
    }
    if(!previous||source.resetStage)for(const actor of scene.cast){
      const opening=source.events.find(e=>e.actorId===actor.characterId);if(opening?.verb!=='approach')continue;
      const target=scene.props.find(p=>p.designId===opening.targetId)||scene.cast.find(c=>c.characterId===opening.targetActorId);if(!target)continue;
      const arrival=clamp(target.x-actor.facing*115,65,475),start=clamp(arrival-actor.facing*100,65,475);
      if(solids.every(p=>Math.abs(start-p.x)>80*p.scale+30*actor.scale)&&scene.cast.every(c=>c===actor||Math.abs(start-c.x)>55*(c.scale+actor.scale)+5))actor.x=start;
    }
    if(previous&&!source.resetStage){
      for(const c of scene.cast){const a=previous.states[c.characterId];c.x=a.position[0];c.y=780;c.initialPose=Object.fromEntries(poseKeys.map(k=>[k,a[k]]));c.emotion=a.face;}
      for(const p of scene.props){const old=previous.props[p.designId];p.x=old.position[0];p.y=old.position[1];p.angle=old.angle;p.open=old.open;p.scale=old.scale;
        if(old.owner){const a=previous.states[old.owner.actorId],bone=old.owner.hand;p.scale=old.scale/a.scale;p.angle=old.angle-(a.bodyAngle||0)-(bone==='head'?a.headAngle:bone==='rightHand'?a.wristAngle||0:a.leftWristAngle||0);p.attachment={actorId:old.owner.actorId,bone,offset:old.owner.local?old.owner.offset:old.owner.offset.map(v=>v/a.scale)};}
      }
    }
    const state=t=>evaluate(scene,t,propDesigns);
    const add=(e,kind,start,duration,extra={})=>{scene.beats.push({actorId:e.actorId,kind,start,duration,timing:'snappy',amount:1,hand:'right',intent:e.description,...(e.emotion?{emotion:e.emotion}:{}),...extra});return scene.beats.length-1;};
    const attach=(p,at,attachment)=>{p.attachmentEvents ||= [];const old=p.attachmentEvents.find(e=>Math.abs(e.at-at)<.00001);if(old)old.attachment=attachment;else p.attachmentEvents.push({at,attachment});p.attachmentEvents.sort((a,b)=>a.at-b.at);};
    let at=0;
    for(const event of source.events){
      if(eventMap.has(event.id))throw Error('Duplicate event ID '+event.id);
      const e=event,d=e.duration,end=at+d,first=scene.beats.length;
      const actor=scene.cast.find(c=>c.characterId===e.actorId),placed=scene.props.find(p=>p.designId===e.targetId),design=propDesigns.find(p=>p.id===e.targetId);
      if(!actor)throw Error('Unknown event actor '+e.actorId);
      const needProp=['approach','press','strain','liftAttempt','grab','place','throw','fly','open'].includes(e.verb);
      if(needProp&&!placed&&!e.targetActorId)throw Error(e.verb+' needs a real target object/actor.');
      let q=state(at),a=q.states[e.actorId],target=placed?q.props[e.targetId].position:e.targetActorId?q.states[e.targetActorId]?.position:undefined;
      if(e.targetActorId&&!q.states[e.targetActorId])throw Error('Unknown target actor '+e.targetActorId);
      const carried=Object.entries(q.props).filter(([,p])=>p.owner?.actorId===e.actorId&&['leftHand','rightHand'].includes(p.owner.hand));
      if(carried.length&&e.verb!=='headHold'&&(e.holdHead||e.gestures?.includes('headHold')))throw Error('Put carried props down before a two-handed head-hold or recovery gesture.');
      if(animals.has(a.species)&&!['approach','walk','run','press','jump','react','sneeze','perform','fly','roar','cower','pawPress'].includes(e.verb))throw Error('Unsupported animal choreography '+e.verb);
      let contact=at+d*.42;
      const destination=()=>{
        if(e.targetPropId){const support=state(end).props[e.targetPropId];if(!support)throw Error('Unknown destination object '+e.targetPropId);return{point:[support.position[0],['floor','sky'].includes(e.destination)?Y[e.destination]:support.position[1]-30*(placed?.scale||1)]};}
        if(e.targetActorId&&!['floor','table','sky'].includes(e.destination)){const other=state(end).states[e.targetActorId];const bone=e.destination==='leftHand'||e.destination==='rightHand'?e.destination:'head';const offset=e.destination==='crown'?[0,-75]:bone==='head'?[other.facing*10,12]:[0,0];return {point:localToWorld(other,[other[bone][0]+offset[0],other[bone][1]+offset[1]]),bone,offset};}
        return {point:[e.toSlot?X[e.toSlot]:target?.[0]??270,Y[e.destination]??590]};
      };
      if(['approach','walk','run'].includes(e.verb)){
        const tx=e.toSlot?X[e.toSlot]:target?target[0]-a.facing*115:a.position[0]+a.facing*90;
        add(e,e.verb==='run'?'run':'walk',at,d,{to:[clamp(tx,65,475),780]});contact=at+d*.5;
      }else if(['press','strain','liftAttempt','grab','open'].includes(e.verb)){
        if(!placed)throw Error(e.verb+' requires targetId.');
        // Approach and bend are authored before contact, never replaced with stretched arms.
        const nearFloor=target[1]>a.position[1]-110;
        const tx=clamp(target[0]-a.facing*(nearFloor?45:105),65,475),needsMove=Math.abs(a.position[0]-tx)>20;
        let prep=0;
        if(Math.abs(a.bodyAngle)>10){prep=Math.min(.3,d*.2);add(e,'stand',at,prep);}
        if(needsMove){const walk=Math.min(.35,d*.24);add(e,'walk',at+prep,walk,{to:[tx,780]});prep+=walk;}
        q=state(at+prep);a=q.states[e.actorId];target=q.props[e.targetId].position;
        const floor=target[1]>a.position[1]-110;
        if(floor){const crouch=Math.min(.22,d*.2);add(e,'custom',at+prep,crouch,{pose:{hip:[0,-50],head:[0,-275]}});prep+=crouch;}
        const body=state(at+prep).states[e.actorId];
        const grip=design.gripOffset||[0,0],hand=worldToLocal(body,[target[0]+grip[0]*placed.scale,target[1]+grip[1]*placed.scale]);
        const recover=floor?Math.min(.25,d*.2):0;
        const remaining=d-prep-recover;if(remaining<.12)throw Error('Not enough time to approach and contact '+e.targetId);
        if(e.verb==='grab'){
          const effort=e.effort?remaining*.5:0;
          if(effort)add(e,'perform',at+prep,effort,{targetId:e.targetId,keyframes:[
            {at:0,pose:{rightHand:body.rightHand}},
            {at:.25,pose:{rightHand:hand},emotion:'strain'},
            {at:.4,pose:{rightHand:[hand[0]-6,hand[1]-3]},emotion:'strain'},
            {at:.6,pose:{rightHand:[hand[0]+6,hand[1]-3]},emotion:'strain'},
            {at:.8,pose:{rightHand:hand},emotion:'strain'},
            {at:1,pose:{rightHand:hand},emotion:'strain'}]});
          add(e,'pick',at+prep+effort,remaining-effort,{targetId:e.targetId});
        }
        else if(e.verb==='open'){if(design.type!=='jar')throw Error('Opening this object needs a supported articulated design: '+design.name);add(e,'open',at+prep,remaining,{targetId:e.targetId});}
        else if(e.verb==='liftAttempt'){
          if(q.props[e.targetId].owner)throw Error('A failed lift attempt requires an unheld prop; use grab with effort for a successful pickup.');
          const brace=[hand[0]-a.facing*18,hand[1]+8],head=[...body.head],hip=[...body.hip];
          const reach={rightHand:hand,leftHand:brace};
          add(e,'perform',at+prep,remaining,{targetId:e.targetId,contactAt:.2,keyframes:[
            {at:0,pose:{rightHand:body.rightHand,leftHand:body.leftHand,head,hip}},
            {at:.2,pose:reach,emotion:'strain',rightHandShape:'grip',leftHandShape:'grip'},
            {at:.35,pose:{...reach,head:[head[0],head[1]-22],hip:[hip[0],hip[1]-15]},emotion:'strain'},
            {at:.45,pose:{...reach,head:[head[0]+6,head[1]-25],hip:[hip[0]+3,hip[1]-20]},emotion:'strain'},
            {at:.55,pose:{...reach,head:[head[0]-6,head[1]-25],hip:[hip[0]-3,hip[1]-20]},emotion:'strain'},
            {at:.65,pose:{...reach,head:[head[0]+6,head[1]-25],hip:[hip[0]+3,hip[1]-20]},emotion:'strain'},
            {at:.8,pose:{...reach,head,hip},emotion:'defeat'},
            {at:1,pose:{rightHand:body.rightHand,leftHand:body.leftHand,head,hip},emotion:'defeat'}]});
        }
        else if(animals.has(a.species)){add(e,'pawPress',at+prep,remaining,{targetId:e.targetId});}
        else {
          const rest=[...body.rightHand],windup=[hand[0]-a.facing*25,hand[1]-50];
          const strain=e.verb==='strain';
          const keys=[{at:0,pose:{rightHand:rest}},{at:.25,pose:{rightHand:windup},emotion:e.emotion||'curious'},{at:.42,pose:{rightHand:hand},rightHandShape:'point'},{at:.48,pose:{rightHand:hand},rightHandShape:'point'},{at:.65,pose:{rightHand:strain?[hand[0]+3,hand[1]-2]:hand},emotion:strain?'strain':e.emotion||'curious'},{at:1,pose:{rightHand:strain?hand:rest}}];
          add(e,'perform',at+prep,remaining,{targetId:e.targetId,contactAt:.42,keyframes:keys});
        }
        contact=at+prep+remaining*(e.verb==='grab'?.98:e.verb==='liftAttempt'?.2:.42);
        if(recover)add(e,'stand',end-recover,recover);
      }else if(e.verb==='place'){
        if(q.props[e.targetId]?.owner?.actorId!==e.actorId)throw Error('Place requires the actor to grab '+e.targetId+' first; an object already on the table is an initial state, not a placement action.');
        const to=destination().point;let prep=0;
        if(to[1]>a.position[1]-110){prep=Math.min(.25,d*.25);add(e,'custom',at,prep,{pose:{hip:[0,-50],head:[0,-275]}});}
        add(e,'place',at+prep,d-prep,{targetId:e.targetId,to});contact=end;
      }else if(e.verb==='fly'){
        if(!placed)throw Error('Fly needs a placed object.');
        const to=destination(),hit=e.destination==='face',flight=d*(hit?.6:e.land?.72:1);contact=at+flight;
        attach(placed,at,null);
        scene.motions.push({targetId:e.targetId,start:at,duration:flight,to:to.point,arc:e.arc??(hit?20:65),angle:hit?-20:0,impactOnEnd:hit});
        if(e.land&&to.bone)attach(placed,contact,{actorId:e.targetActorId,bone:to.bone,offset:to.offset});
        else if(hit)scene.motions.push({targetId:e.targetId,start:contact,duration:d-flight,to:[clamp(to.point[0]+a.facing*65,50,490),750],arc:35,angle:90,impactOnEnd:true});
        add(e,'react',at,d,{emotion:e.emotion||'shock'});
        if(hit&&e.targetActorId){
          const victim=state(contact).states[e.targetActorId],direction=Math.sign(to.point[0]-target[0])||-victim.facing,recoil=Math.min(.35,d-flight);
          add({...e,actorId:e.targetActorId},'perform',contact,recoil,{keyframes:[{at:0,pose:{head:victim.head,headAngle:victim.headAngle}},{at:.2,pose:{head:[victim.head[0]+direction*14,victim.head[1]+4],headAngle:direction*8,headScale:[1.08,.92]},emotion:'jawdrop'},{at:1,pose:{head:victim.head,headAngle:victim.headAngle,headScale:[1,1]},emotion:'shock'}]});
        }
      }else if(e.verb==='throw'){
        if(q.props[e.targetId]?.owner?.actorId!==e.actorId)throw Error('Throw requires the actor to grab '+e.targetId+' first.');
        add(e,'throw',at,d,{targetId:e.targetId,to:destination().point});contact=at+d*.4;
      }else if(e.verb==='punch'){
        if(!e.targetActorId)throw Error('Punch needs targetActorId.');
        const other=q.states[e.targetActorId],tx=clamp(other.position[0]-a.facing*135,65,475),prep=Math.min(.35,d*.3);
        add(e,'walk',at,prep,{to:[tx,780]});add(e,'punch',at+prep,d-prep,{targetActorId:e.targetActorId});contact=at+prep+(d-prep)*.42;
      }else if(['fall','slip'].includes(e.verb)&&e.recover){
        if(d<.9)throw Error('A fall and recovery need at least 0.9 seconds to be readable.');
        const fall=d*.55,recover=d-fall;
        add(e,'perform',at,fall,{...instantiateMotionPreset('sideLanding',a,{floorY:780,to:[e.toSlot?X[e.toSlot]:a.position[0],780]}),semanticAction:e.verb,contactAt:.76,emotion:e.emotion||'shock'});
        if(e.recover==='stand')add(e,'stand',at+fall,recover);
        else{
          const fallen=state(at+fall).states[e.actorId],hands=e.holdHead?headHoldPose([0,-245]):{};
          const seated={bodyAngle:0,hip:[0,0],head:[0,-245],position:[clamp(fallen.position[0],65,475),780],leftFoot:[-85,0],rightFoot:[90,0],leftHand:[-100,-70],rightHand:[100,-70],...hands};
          const start=Object.fromEntries(['bodyAngle','hip','head','position','leftFoot','rightFoot','leftHand','rightHand'].map(k=>[k,fallen[k]]));
          add(e,'perform',at+fall,recover,{keyframes:[{at:0,pose:start},{at:.8,pose:seated},{at:1,pose:seated}]});
        }
        contact=at+fall*.75;
      }else if(['fall','slip'].includes(e.verb)){
        add(e,'perform',at,d,{...instantiateMotionPreset('sideLanding',a,{floorY:780,to:[e.toSlot?X[e.toSlot]:a.position[0],780]}),semanticAction:e.verb,contactAt:.76,emotion:e.emotion||'shock'});contact=at+d*.76;
      }else if(e.verb==='sit'){
        const hands=e.holdHead?headHoldPose([0,-245]):{};
        add(e,'perform',at,d,{keyframes:[{at:0,pose:{bodyAngle:a.bodyAngle,hip:a.hip,head:a.head,position:a.position}},{at:.5,pose:{bodyAngle:0,hip:[0,0],head:[0,-245],position:[clamp(a.position[0],65,475),780],leftFoot:[-85,0],rightFoot:[90,0],...hands}},{at:1,pose:{bodyAngle:0,hip:[0,0],head:[0,-245],...hands}}]});
      }else if(e.verb==='headHold'){
        let prep=0;
        if(carried.length){
          if(carried.length>1)throw Error('Put carried props down before holding the head with both hands.');
          const [id,held]=carried[0],original=score.props.find(p=>p.id===id);
          const tables=score.props.filter(p=>p.type==='table').sort((p,r)=>(p.id===original?.onId?-1:r.id===original?.onId?1:Math.abs(q.props[p.id].position[0]-a.position[0])-Math.abs(q.props[r.id].position[0]-a.position[0])));
          if(!tables.length)throw Error('Head-hold needs free hands: explicitly place the carried object before this gesture.');
          const support=q.props[tables[0].id].position;prep=Math.min(.6,d*.3);
          if(d-prep<.5)throw Error('Allow time to put the prop down before holding the head.');
          add(e,'place',at,prep,{targetId:id,to:[support[0],support[1]-30*held.scale]});
          a=state(at+prep).states[e.actorId];
        }
        add(e,'perform',at+prep,d-prep,{keyframes:[{at:0,pose:{leftHand:a.leftHand,rightHand:a.rightHand}},{at:.3,pose:headHoldPose(a.head),leftHandShape:'open',rightHandShape:'open',emotion:e.emotion||'defeat'},{at:1,pose:headHoldPose(a.head)}]});
      }else if(e.verb==='perform'){
        if(!e.keyframes)throw Error('A bespoke action needs actual keyframes, not only a description.');
        add(e,'perform',at,d,{keyframes:e.keyframes,...(e.targetId?{targetId:e.targetId}:{})});
      }else {
        const extra={};if(e.targetId)extra.targetId=e.targetId;
        if(['slip','fall','jump'].includes(e.verb))extra.to=[e.toSlot?X[e.toSlot]:a.position[0],780];
        add(e,e.verb,at,d,extra);
      }
      for(const gesture of [...new Set(e.gestures||[])]){
        if(gesture===e.verb)continue;
        if(gesture==='headHold'){
          const final=state(end).states[e.actorId],head=final.head;
          add(e,'perform',at,d,{keyframes:[{at:0,pose:{leftHand:a.leftHand,rightHand:a.rightHand}},{at:.35,pose:headHoldPose(head),leftHandShape:'open',rightHandShape:'open'},{at:1,pose:headHoldPose(head)}]});
        }else add(e,gesture,at,gesture==='stand'?Math.min(.35,d*.4):d);
      }
      const indices=Array.from({length:scene.beats.length-first},(_,i)=>first+i);
      coverage.push({storyEvent:e.description,sceneId:scene.id,beatIndices:indices});
      if(e.land&&e.destination==='crown')requirements.push({description:e.description,sceneId:scene.id,characterId:e.targetActorId,propId:e.targetId,worn:true});
      eventMap.set(e.id,{event:e,scene,at,end,contact,indices});
      // A reaction close-up follows the cause; action shots always retain spatial context.
      const current=state(at+Math.min(d*.5,.5)).states[e.actorId];
      const head=localToWorld(current,current.head),reaction=e.camera==='reaction'&&['react','laugh','cry','scold'].includes(e.verb);
      scene.shots.push({start:at,end,focus:reaction?[head[0],head[1]+25]:[270,505],zoom:reaction?2.15:1.05,detail:'full'});
      at=end;
    }
    // Frame the actual sampled performance, including flight arcs and the whole fall.
    for(const item of [...eventMap.values()].filter(v=>v.scene===scene)){
      const shot=scene.shots.find(s=>s.start===item.at),e=item.event;
      if(e.camera==='reaction'&&['react','laugh','cry','scold'].includes(e.verb)){shot.zoom=2.5;shot.actorIds=[e.actorId];continue;}
      if(['press','strain','open'].includes(e.verb)||e.camera==='contact'&&['grab','place'].includes(e.verb)){
        const q=state(item.contact),p=q.props[e.targetId];
        if(p){shot.focus=[p.position[0]-15,p.position[1]-22];shot.zoom=2.4;continue;}
      }
      const points=[];
      const samples=['fall','slip'].includes(e.verb)?Array.from({length:61},(_,i)=>Math.min(.999,i/60)):[0,.25,.5,.75,.999];
      for(const f of samples){
        const snapshot=state(item.at+e.duration*f);
        for(const a of Object.values(snapshot.states)){
          const head=localToWorld(a,a.head);points.push([head[0]-85*a.scale,head[1]-90*a.scale],[head[0]+85*a.scale,head[1]+90*a.scale],localToWorld(a,a.leftFoot),localToWorld(a,a.rightFoot),localToWorld(a,a.leftHand),localToWorld(a,a.rightHand));
        }
        for(const p of Object.values(snapshot.props))points.push([p.position[0]-45*p.scale,p.position[1]-65*p.scale],[p.position[0]+45*p.scale,p.position[1]+35*p.scale]);
      }
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      shot.zoom=clamp(Math.min(1.6,460/(maxX-minX+20),820/(maxY-minY+20)),.4,1.6);shot.focus=[(minX+maxX)/2,(minY+maxY)/2+19.2/shot.zoom];
    }
    if(scene.shots.length>30)throw Error('Too many camera cuts in one scene.');
    scenes.push(scene);previous=evaluate(scene,duration,propDesigns);
  }
  for(const cue of soundScore.cues){const item=eventMap.get(cue.eventId);if(!item)throw Error('Sound director references unknown event '+cue.eventId);if(item.event.silent)continue;
    let start=cue.when==='start'?item.at:cue.when==='end'?item.end:item.contact;
    if(start>=item.scene.duration)start=item.scene.duration-.12;
    const duration=Math.min(cue.duration,item.scene.duration-start,item.event.duration);
    if(duration<.1)continue;
    const vocal=cue.role==='nonverbal'||/laugh|chuckl|gasp|grunt|groan|sobb|crying|mutter|babbl|gibberish|sigh|scream|snor/i.test(cue.query);
    item.scene.sounds.push({query:cue.query,start,duration,volume:cue.volume,required:true,trimSilence:true,sourceStart:0,playbackRate:1,pan:0,role:vocal?'nonverbal':'effect',...(vocal?{actorId:item.event.actorId}:{})});
  }
  const first=scenes[0],opening=coverage.find(c=>c.sceneId===first.id&&c.beatIndices.some(i=>first.beats[i].start<2.5&&first.beats[i].kind!=='idle'));
  const total=scenes.reduce((sum,s)=>sum+s.duration,0);
  if(options.durationMode==='manual'&&Math.abs(total-options.duration)>.15)throw Error(`Director durations total ${total.toFixed(2)}s, must equal ${options.duration}s.`);
  let plan=validatePlan({schemaVersion:2,provenance:{origin:'generated',sourceSchemaVersion:2,generator:'sticklaugh-director'},version:1,title:score.title,story:score.story,sourceIdea:options.story||'Create an original visual comedy.',directionScore:JSON.stringify(score),directionVersion:3,soundScore:JSON.stringify(soundScore),productionMode:'silent-sfx',renderFps:options.renderFps||60,durationMode:options.durationMode||'auto',humorProfile:options.humorProfile||'clean',...(options.category?{category:options.category,comedySettings:normalizeComedySettings(options.category,options.comedySettings),...(options.category==='adult-comedy'?{adultModeAcknowledged:options.adultOptIn===true}:{})}:{}),language:options.language||'hi',format:options.format||'shorts',characters,propDesigns,scenes,requirements,coverage,comedy:score.comedy,seo:score.seo,blockedReasons:[],hook:{sceneId:first.id,start:0,end:Math.min(3,first.duration),evidence:score.comedy.hook,beatIndices:opening?.beatIndices.filter(i=>first.beats[i].start<3)||[]}});
  const migrated=migrateMotionIR(plan,{seed:options.seed??plan.seed});
  if(options.seed!==undefined)migrated.seed=options.seed;
  plan=validatePlan(migrated);
  const report=inspectPlan(plan,{requireCoverage:true});if(!report.ok)throw Error('Choreography validation: '+JSON.stringify(report.issues.filter(i=>i.severity==='error')));
  return plan;
}

export function stampDirectedPlan(plan,summary){plan.review={method:'gemini',planHash:planHash(plan),summary};return validatePlan(plan);}
