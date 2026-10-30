import {readFile,writeFile} from 'node:fs/promises';
import {evaluate} from '../renderer/engine.mjs';
import {localToWorld} from '../shared/math.mjs';
import {validatePlan} from '../shared/schema.mjs';

const dir='deliverables/hulk-fanta-child';
const plan=validatePlan(JSON.parse(await readFile(dir+'/plan.json','utf8')));
const scene=plan.scenes[0],issues=[];
let maxReach=0;
for(let frame=0;frame<1200;frame++){
 const time=frame/60,result=evaluate(scene,time,plan.propDesigns);
 for(const [actor,state] of Object.entries(result.states)){
  maxReach=Math.max(maxReach,state.reachError.left,state.reachError.right);
  for(const channel of ['position','head','leftHand','rightHand','leftFoot','rightFoot'])
   if(!state[channel].every(Number.isFinite))issues.push({time,actor,channel});
 }
 if(time<10.5){
  const cap=result.props.cap.position,bottle=result.props.fanta.position;
  if(Math.hypot(cap[0]-bottle[0],cap[1]-bottle[1]+138.75)>1)
   issues.push({time,problem:'Cap detached before the successful opening'});
 }
}
for(const [time,owner] of [[2,'hulk'],[3.5,null],[5,'hulk'],[8,null],[12.5,'kid'],[14,'hulk']]){
 const actual=evaluate(scene,time,plan.propDesigns).props.fanta.owner?.actorId??null;
 if(actual!==owner)issues.push({time,expectedOwner:owner,actual});
}
const contact=14.7+.8*.42,state=evaluate(scene,contact,plan.propDesigns);
const fist=localToWorld(state.states.kid,state.states.kid.leftHand);
const punchDistance=Math.hypot(fist[0]-285,fist[1]-543);
if(punchDistance>8)issues.push({problem:'Punch misses the staged cheek contact',distance:punchDistance});
if(maxReach>8)issues.push({problem:'Hand target exceeds the available arm reach',maxReach});
const report={sampledFrames:1200,maxHandReachError:maxReach,punchContactTime:contact,punchContactDistance:punchDistance,issues,passed:!issues.length,limits:'Mechanical checks for this authored sample; visual quality and audio suitability require separate review.'};
await writeFile(dir+'/sample-motion-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(issues.length)process.exitCode=1;
