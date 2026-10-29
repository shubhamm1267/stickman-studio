import {z} from 'zod';
import {DIRECTOR_ACTIONS} from '../shared/director-score.mjs';

export const StoryContractSchema=z.object({unsupportedActions:z.array(z.string().min(5).max(400)).max(40).default([]),missingEntities:z.array(z.string().min(2).max(150)).max(40),events:z.array(z.object({description:z.string().min(5).max(400),subjectId:z.string().min(1).max(80),verb:z.enum(DIRECTOR_ACTIONS),targetId:z.string().max(80).optional(),destination:z.enum(['face','crown','leftHand','rightHand','floor','table','sky']).optional(),silent:z.boolean().default(false)}).strict()).min(1).max(1000)}).strict();

// Match literal story atoms in order. Descriptions cannot supply a missing motion.
export function validateStoryContract(score,contract){
  if(contract.unsupportedActions?.length)throw Error('Story needs unimplemented motion: '+contract.unsupportedActions.join('; '));
  const backgrounds=new Set(score.scenes.map(s=>s.background?.toLowerCase()).filter(Boolean));
  const missing=contract.missingEntities.filter(name=>!backgrounds.has(name.trim().toLowerCase()));
  if(missing.length)throw Error('Story objects/characters are not designed: '+missing.join(', '));
  const events=score.scenes.flatMap(s=>s.events),capabilities=[],displaced=new Set();
  const propDesigns=score.props||[];
  for(const [index,e] of events.entries()){
    const walkTarget=propDesigns.find(p=>p.id===e.targetId);
    const nearTable=['approach','walk','run'].includes(e.verb)&&!e.toSlot&&!displaced.has(e.targetId)&&(walkTarget?.type==='table'||walkTarget?.onId&&propDesigns.some(p=>p.id===walkTarget.onId&&p.type==='table'));
    const add=(verb,subjectId=e.actorId,targetId=e.targetActorId||e.targetId,destination=e.destination??(['fall','slip','sit','stand'].includes(verb)?'floor':undefined))=>capabilities.push({index,verb,subjectId,targetId,destination,nearTable,silent:e.silent,used:false});
    if(e.verb==='fly'){
      add('fly',e.targetId,e.targetActorId||e.targetPropId,e.destination||'table');
      if(e.destination==='face'&&!e.land)add('fly',e.targetId,undefined,'floor');
      add('react',e.actorId,undefined,undefined);
    }else{
      add(e.verb);
      if(e.verb==='strain')add('press');
      if(e.verb==='liftAttempt')add('strain');
      if(e.verb==='grab')add('approach');
      if(e.verb==='grab'&&e.effort)add('strain');
      if(e.verb==='slip')add('fall',e.actorId,undefined,undefined);
      if(e.recover)add(e.recover,e.actorId,undefined,'floor');
      if(['walk','run'].includes(e.verb))add('approach');
      if(e.verb==='approach')add('walk');
      // Approaching an untouched object on a table also approaches its support.
      // Once that object moves, its initial support no longer proves location.
      if(['approach','walk','run'].includes(e.verb)&&e.targetId){
        const prop=propDesigns.find(p=>p.id===e.targetId);
        if(prop?.onId&&!displaced.has(prop.id)){add('walk',e.actorId,prop.onId);add('approach',e.actorId,prop.onId);}
        for(const child of propDesigns.filter(p=>p.onId===e.targetId&&!displaced.has(p.id))){add('walk',e.actorId,child.id);add('approach',e.actorId,child.id);}
      }
      if(e.holdHead)add('headHold',e.actorId,undefined,undefined);
      for(const gesture of e.gestures||[])add(gesture,e.actorId,undefined,undefined);
      if(e.verb!=='react')add('react',e.actorId,undefined,undefined);
    }
    if(['grab','place','throw','fly'].includes(e.verb))displaced.add(e.targetId);
  }
  let cursor=0;
  const props=new Set((score.props||[]).map(p=>p.id));
  for(const literal of contract.events){
    const atom=props.has(literal.subjectId)&&['jump','slip','fall'].includes(literal.verb)?{...literal,verb:'fly'}:literal;
    const implicitSelf=atom.targetId===atom.subjectId&&['headHold','nosePinch','react','laugh','cry','flex','deflate','sit','stand','jump','fall'].includes(atom.verb);
    const match=capabilities.find(c=>!c.used&&c.index>=cursor&&c.subjectId===atom.subjectId&&c.verb===atom.verb&&(!atom.targetId||c.targetId===atom.targetId||implicitSelf)&&(!atom.destination||c.destination===atom.destination||atom.destination==='table'&&['approach','walk','run'].includes(atom.verb)&&c.nearTable)&&(!atom.silent||c.silent));
    if(!match)throw Error(`Missing actual story action: ${atom.description}. Need ${atom.subjectId} ${atom.verb}${atom.targetId?' -> '+atom.targetId:''}${atom.destination?' / '+atom.destination:''}, in the stated order. Add a real event; do not rename a reaction.`);
    match.used=true;cursor=match.index;
  }
  return true;
}
