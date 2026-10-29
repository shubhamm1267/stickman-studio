import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {geminiJSON} from './providers.mjs';
import {DirectorScoreSchema,SoundScoreSchema,DIRECTOR_ACTIONS} from '../shared/director-score.mjs';
import {compileDirection,stampDirectedPlan} from './choreographer.mjs';
import {StoryContractSchema,validateStoryContract} from './story-contract.mjs';
import {comedyCategoryInstructions} from '../shared/comedy-category.mjs';
import {CapabilityCompilationError,compileDirectorCapabilities,diagnoseDirectorCapabilities,plannerCapabilityData} from '../shared/capability-compiler.mjs';

const AuditSchema=z.object({passed:z.boolean(),missingEvents:z.array(z.string().max(400)).max(40),problems:z.array(z.string().max(600)).max(40),summary:z.string().min(10).max(1200)}).strict();
const ContractSchema=z.object({events:z.array(z.object({eventId:z.string(),subjectId:z.string(),verbs:z.array(z.enum(DIRECTOR_ACTIONS)).min(1).max(5),silent:z.boolean()}).strict()).min(1).max(1000)}).strict();
export function validateEventContracts(score,contract){
  const events=score.scenes.flatMap(s=>s.events);
  const aliases={approach:['approach','walk'],walk:['walk','approach'],run:['run','approach'],press:['press','approach'],strain:['strain','press','approach'],liftAttempt:['liftAttempt','strain','approach'],grab:['grab','approach'],slip:['slip','jump','fall']};
  for(const e of events){const c=contract.events.find(c=>c.eventId===e.id);if(!c)throw Error('Missing independent action contract for '+e.id);
    const subject=e.verb==='fly'?e.targetId:e.actorId;
    if(c.subjectId!==subject)throw Error(`Event ${e.id} describes movement of ${c.subjectId}, but ${e.verb} animates ${subject}. fly moves ONLY a prop; use jump/slip/fall for an actor.`);
    const supported=e.verb==='sit'&&e.holdHead?['sit','headHold']:e.verb==='fly'&&['face','floor'].includes(e.destination)?['fly','fall']:aliases[e.verb]||[e.verb];
    const implemented=[...supported,...(e.verb==='grab'&&e.effort?['strain']:[]),...(e.recover?[e.recover,...(e.holdHead?['headHold']:[])]:[]),...(e.gestures||[]),...(e.verb==='fly'?[]:['react'])];
    if(e.verb!=='perform'&&c.verbs.some(v=>!implemented.includes(v)))throw Error(`Event ${e.id} needs ${c.verbs.join('+')}, but its selected verb ${e.verb} cannot perform those actions. Split compound events or select the actual verb.`);
    if(c.silent&&!e.silent)throw Error('Event '+e.id+' explicitly requires silence; set silent:true.');
  }
}
export function resolveEventContracts(score,contract){
  const standing=new Map(score.characters.map(c=>[c.id,true]));
  const props=new Set(score.props.map(p=>p.id));
  for(const e of score.scenes.flatMap(s=>s.events)){
    const c=contract.events.find(c=>c.eventId===e.id);if(!c)continue;
    // A bouncing rigid object uses the same trajectory as prop flight. Actor
    // jumps remain separate; the full-story contract checks additional actors.
    if(props.has(c.subjectId)&&['fly','jump','fall','slip'].includes(e.verb)&&c.verbs.every(v=>['fly','jump','fall','slip'].includes(v))){
      if(e.verb!=='fly'){e.destination ||=e.verb==='jump'?'sky':'floor';e.verb='fly';e.targetId=c.subjectId;}
      c.verbs=[...new Set(c.verbs.map(v=>['jump','fall','slip'].includes(v)?'fly':v))];
    }
    if(standing.get(e.actorId)&&['react','approach','walk','run'].includes(e.verb))c.verbs=c.verbs.filter(v=>v!=='stand');
    e.silent=c.silent;
    if(c.subjectId===e.actorId){
      if(['strain','press','grab'].includes(e.verb)&&c.verbs.includes('liftAttempt')&&!c.verbs.includes('grab'))e.verb='liftAttempt';
      if(e.verb==='grab'&&c.verbs.includes('strain'))e.effort=true;
      if(['fall','slip'].includes(e.verb)){
        if(c.verbs.includes('sit'))e.recover='sit';else if(c.verbs.includes('stand'))e.recover='stand';
        if(e.recover==='sit'&&c.verbs.includes('headHold'))e.holdHead=true;
      }
      if(e.verb==='press'&&c.verbs.includes('strain'))e.verb='strain';
      if(c.verbs.every(v=>['sit','headHold'].includes(v))&&c.verbs.includes('sit')){e.verb='sit';e.holdHead=c.verbs.includes('headHold');}
      else if(c.verbs.length===1&&['jump','slip','fall','headHold','sit','stand'].includes(c.verbs[0])&&['react','fly'].includes(e.verb))e.verb=c.verbs[0];
      if(e.verb==='react')e.gestures=[...new Set([...(e.gestures||[]),...c.verbs.filter(v=>['stand','headHold','nosePinch','point','wave'].includes(v))])];
    }
    if(['fall','slip','sit'].includes(e.verb))standing.set(e.actorId,false);if(e.verb==='stand'||e.recover==='stand'||e.gestures?.includes('stand'))standing.set(e.actorId,true);
  }
  validateEventContracts(score,contract);return score;
}
async function directScore(options,credentials,signal,progress,fetcher,previous,critique){
  const capabilityData=plannerCapabilityData();
  const guide=(await readFile(new URL('../prompts/semantic-director.md',import.meta.url),'utf8'))+'\n'+(options.category?comedyCategoryInstructions(options)+'\n':'')+'Validated planner capability contract: '+JSON.stringify(capabilityData)+'. Use only the listed primitive IDs and rig controls. Select technical behavior only by primitive ID and entity ID; character names, prop names and story text are labels, never dispatch keys. A new display name is valid when its registered kind and requested primitive are supported. Include only physical events expressible by these primitives. Do not emit an unsupported primitive and expect the compiler to ignore it; do not conceal an unsupported action as a description, reaction, or fallback. The compiler migrates validated performance data into canonical versioned motion tracks.';
  let feedback=critique||'',score=previous;
  let capabilityReport;
  for(let attempt=0;attempt<4;attempt++){
    progress(`Story and choreography direction ${attempt+1}/4`,10+attempt*4);
    try{
    let generated;
    try{
      generated=await geminiJSON(`${guide}\nAvailable verbs: ${DIRECTOR_ACTIONS.join(',')}. Language=${options.language||'hi'}, format=${options.format||'shorts'}, comedy profile=${options.humorProfile||'clean'}. ${options.durationMode==='manual'?`Total duration EXACTLY ${options.duration} seconds.`:'Choose a natural concise duration for this gag, normally 12–24 seconds.'} Original user story: ${options.story?.trim()||'Invent an original visual comedy.'} ${score?'Previous score to repair: '+JSON.stringify(score):''} Fix these concrete errors: ${feedback}. ${options.story?.trim()?"Preserve every event of the explicit USER story; report unsupported requirements instead of dropping them.":"This is YOUR invented story, so revise infeasible gag mechanics freely. Rewrite the story, blueprint and events together into a coherent achievable original gag. Do not preserve an invented impossible mechanism merely because it appeared in your previous draft."}`,DirectorScoreSchema,credentials,signal,fetcher);
    }catch(error){
      const diagnostics=diagnoseDirectorCapabilities(error.generatedValue);
      if(diagnostics.length)throw new CapabilityCompilationError(diagnostics);
      throw error;
    }
    capabilityReport=compileDirectorCapabilities(generated);
    score=capabilityReport.score;
      score=JSON.parse(compileDirection(score,options).directionScore);
      progress('Checking actor versus object action contracts',30);
      const contract=await geminiJSON(`Extract the literal primary physical subject and required action(s) of each event DESCRIPTION below, without seeing the selected animation verbs. Use the supplied character/object IDs. Return each eventId exactly once. fly means a PROP flying; jump means an ACTOR rising; slip includes a short upward lift and fall, so a person slipping into a fall can simply be slip. react is facial reaction only, never sitting up, holding a head, walking, or moving an object. sit is sitting up, headHold is hands on or grabbing the actors own HEAD (not grab, which picks up a PROP), nosePinch is holding or pinching the NOSE (never headHold). An already upright actor who "stands shocked" only needs react; stand means physically getting up from a fall or seated position. Set silent:true ONLY when the text explicitly says no sound, silently or a quiet failed attempt. A nonverbal cartoon is NOT soundless; ordinary motion and reactions have silent:false. Do not suggest object fly for an actor launching into the air. A PROP slipping out of a hand, bouncing or jumping is fly, not actor slip/jump. A failed attempt to lift an object is liftAttempt (a pull upwards with no pickup), never press or strain. Successful effortful lifting is grab+strain: grab means it actually enters the hand and is carried. Never require grab for an unsuccessful attempt. Prefer the literal main physical action, not every incidental adjective. Actions: ${DIRECTOR_ACTIONS.join(',')}. CHARACTERS: ${JSON.stringify(score.characters.map(c=>({id:c.id,name:c.name})))}. OBJECTS: ${JSON.stringify(score.props.map(p=>({id:p.id,name:p.name})))}. EVENTS: ${JSON.stringify(score.scenes.flatMap(s=>s.events.map(e=>({eventId:e.id,description:e.description}))))}`,ContractSchema,credentials,signal,fetcher);
      resolveEventContracts(score,contract);
      score=JSON.parse(compileDirection(score,options).directionScore);
      progress('Extracting every literal story event',28);
      const literal=await geminiJSON(`Extract EVERY plot-critical physical event from the FULL STORY below in chronological order. List in unsupportedActions any physical requirement the named actions cannot implement: rigid prop inflation/growth, tearing, liquid motion, machinery, kicks, or arbitrary creature deformation. Do not conceal these as strain, fly or perform: strain only animates hand pressure and an effort face, fly only moves a rigid unchanged prop, and perform only moves a human rig. You are NOT given the animation events; do not assume they implement the story. Use the supplied actor/prop IDs. List plot-critical objects without designs in missingEntities (a bottle cap that moves separately needs a separate design). No invented actions. Use one atom for each actual action: fly ONLY for moving props, jump for deliberate human jumping, slip for slipping (it already includes brief lift and fall), press for poking, strain for harder pressing, liftAttempt for trying but failing to lift a heavy object, headHold for hands on HEAD, nosePinch for holding NOSE, react for facial shock, sit for sitting up. Do not treat 'stands shocked' as getting up when already standing. A prop flying into a face then rebounding to the floor is two fly atoms with destination face and floor. A popping-out doorbell is a real fly atom, not just actor surprise. Repeated attempts each need an atom; a quiet failed press has silent:true. targetId is the object acted on, or the receiver actor/prop for a flying object; omit for a free floor destination. 'Looks at the table' does not require pressing it. For walking to a table use targetId, NOT destination: destination is only for prop trajectories/releases or falling bodies. A room/kitchen explicitly listed in SETTINGS already exists; do not mark it as a missing entity. Functional doors/buttons/tables are props, not implied by a room background. Choose perform only for a bespoke gesture outside the named primitives. Available verbs: ${DIRECTOR_ACTIONS.join(',')}. ORIGINAL USER REQUEST: ${options.story?.trim()||'Create an original comedy.'}. FULL STORY: ${score.story}. DESIGNED CHARACTERS: ${JSON.stringify(score.characters.map(c=>({id:c.id,name:c.name})))}. DESIGNED OBJECTS: ${JSON.stringify(score.props.map(p=>({id:p.id,name:p.name,type:p.type})))}. SETTINGS: ${JSON.stringify(score.scenes.map(s=>s.background))}.`,StoryContractSchema,credentials,signal,fetcher);
      validateStoryContract(score,literal);
      progress('Independent story/action audit',32);
      const audit=await geminiJSON(`Independently compare the original user request, generated story, comedy blueprint and sequential event score. List every missing/contradictory visible event or object. Check the actual verb, not description alone: fly moves ONLY a prop, jump moves an ACTOR into the air, slip already lifts the actor briefly and rotates into a fall (it does not need prop fly), sit sits up, headHold places hands on the head, react only changes facial expression, press is hand contact, fall is body fall; an intent label cannot substitute for a verb. A face hit must be fly with destination face and targetActorId, a head landing crown+land:true. Silent failed attempts must have silent:true. Ensure prose does not invent a second object or an ending absent from events. Preserve the user's specific actions; do not simplify an explicit story to fit. All cast identities and props must exist. Naughty/adult comedy uses adults. Return passed only when no errors remain. ORIGINAL: ${options.story?.trim()||'An original comedy.'}. SCORE: ${JSON.stringify(score)}`,AuditSchema,credentials,signal,fetcher);
      if(!audit.passed||audit.problems.length||audit.missingEvents.length)throw Error([...audit.problems,...audit.missingEvents,audit.passed?'':audit.summary].filter(Boolean).join('; '));
      return {score,audit,capabilityReport};
    }catch(e){if(signal?.aborted||e.capabilityDiagnostics?.length||/Provider HTTP|unsupported animation capability/.test(e.message))throw e;if(e.generatedValue?.characters&&e.generatedValue?.props&&e.generatedValue?.scenes)score=e.generatedValue;feedback=e.message;progress('Correcting choreography: '+feedback.slice(0,150),25);}
  }
  throw Object.assign(Error('Story could not be choreographed faithfully after 4 attempts: '+feedback),{generatedScore:score});
}

async function finishScore(score,audit,options,credentials,signal,progress,fetcher,capabilityReport){
  progress('Sound director: action-specific Freesound cues',38);
  const sounds=await geminiJSON(`You are a nonverbal cartoon sound director. Assign precise short English Freesound search queries to the real sequential story events below. Each cue references eventId. Do NOT sound events with silent:true. Do not add a squeak on a failed silent squeeze. Match literal physical action/material, not a generic boing/fart everywhere. Laugh/cry/scold/effort voices must be role nonverbal and contain no intelligible dialogue or music. Contact sounds use when contact, wind/flight uses start, landing uses contact/end. Usually one salient cue per action, with deliberate silence for reactions. No audience laughter under unrelated action. Do not reuse one grunt as every character or emotion. Return only necessary cues with volume<=.4 and duration within the event. STORY SCORE: ${JSON.stringify(score)}`,SoundScoreSchema,credentials,signal,fetcher);
  const plan=compileDirection(score,options,sounds);
  const disclosure=capabilityReport?.disclosures?.length
    ?'Capability disclosures: '+capabilityReport.disclosures.join(' ')
    :'';
  const summary=disclosure
    ?`${audit.summary.slice(0,Math.max(0,1498-disclosure.length))} ${disclosure}`.trim()
    :audit.summary.slice(0,1500);
  return stampDirectedPlan(plan,summary);
}

export async function directSemanticStory(options,credentials,signal,progress=()=>{},fetcher=fetch){
  if(options.productionMode==='dialogue-toon')throw Error('Semantic director currently produces nonverbal comedy. Select silent SFX for this director.');
  if(options.directionDraft){
    const previous=DirectorScoreSchema.parse(options.directionDraft);
    const {score,audit,capabilityReport}=await directScore(options,credentials,signal,progress,fetcher,previous,'Resume this previously generated draft using the current choreography capabilities. Recheck every event and fix all errors; do not assume the previous draft passed validation.');
    return finishScore(score,audit,options,credentials,signal,progress,fetcher,capabilityReport);
  }
  let feedback='',last;
  for(let attempt=0;attempt<(options.story?.trim()?1:3);attempt++){
    try{const {score,audit,capabilityReport}=await directScore(options,credentials,signal,progress,fetcher,undefined,feedback);return await finishScore(score,audit,options,credentials,signal,progress,fetcher,capabilityReport);}
    catch(e){if(options.story?.trim()||signal?.aborted||/Provider HTTP|API key|SAFETY/.test(e.message))throw e;last=e;feedback='Choose a DIFFERENT original gag using whole-object motion, not disassembly or unsupported mechanics. Do not reuse this failed idea: '+e.generatedScore?.story+'. Previous failure: '+e.message;if(attempt<2)progress('Choosing a different feasible original gag, attempt '+(attempt+2)+'/3',8);}
  }
  throw last;
}
export async function repairSemanticPlan(plan,report,credentials,signal,progress=()=>{},fetcher=fetch){
  const options={story:plan.sourceIdea==='Create an original visual comedy.'?'':plan.sourceIdea,duration:plan.scenes.reduce((sum,s)=>sum+s.duration,0),durationMode:'manual',renderFps:plan.renderFps,format:plan.format,language:plan.language,humorProfile:plan.humorProfile,category:plan.category,comedySettings:plan.comedySettings,adultOptIn:plan.adultModeAcknowledged,productionMode:'silent-sfx'};
  const previous=DirectorScoreSchema.parse(JSON.parse(plan.directionScore));
  const {score,audit,capabilityReport}=await directScore(options,credentials,signal,progress,fetcher,previous,'Actual rendered video rejected this score. Fix all audiovisual issues: '+JSON.stringify(report));
  return finishScore(score,audit,options,credentials,signal,progress,fetcher,capabilityReport);
}

export async function upgradeSemanticPlan(plan,credentials,signal,progress=()=>{}){
  const options={story:plan.sourceIdea,duration:plan.scenes.reduce((n,s)=>n+s.duration,0),durationMode:plan.durationMode||'auto',renderFps:plan.renderFps,format:plan.format,language:plan.language,humorProfile:plan.humorProfile,category:plan.category,comedySettings:plan.comedySettings,adultOptIn:plan.adultModeAcknowledged,productionMode:'silent-sfx'};
  const capabilityReport=compileDirectorCapabilities(DirectorScoreSchema.parse(JSON.parse(plan.directionScore)));
  const score=capabilityReport.score;
  return finishScore(score,{summary:plan.review.summary+' Recompiled from the reviewed semantic score with the current choreography engine.'},options,credentials,signal,progress,fetch,capabilityReport);
}
