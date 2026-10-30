import {z} from 'zod';
import {geminiJSON} from './providers.mjs';

const observationSchema=z.object({
 intelligibleSpeech:z.boolean(),music:z.boolean(),
 events:z.array(z.object({id:z.string().min(1),start:z.number().min(0),end:z.number().min(0),description:z.string().min(5),acoustics:z.string().min(8)}).strict()).max(40),
 uncertainties:z.array(z.string()),
}).strict();
const matchSchema=z.object({accepted:z.boolean(),eventId:z.string().nullable(),reason:z.string().min(5)}).strict();

// Listen without the query or Freesound title first. Metadata is a search aid,
// not acoustic evidence that a snap, grunt or spoken word is a toy squeak.
export async function reviewSoundRecording(bytes,{query,role='effect',duration,sourceStart=0,sourceDuration},credentials,signal,fetcher=fetch){
 if(!Number.isFinite(sourceDuration)||sourceDuration<=0||bytes.length>20*1024*1024)throw Error('Invalid SFX review recording');
 const observation=await geminiJSON(`Listen only to this audio recording. No intended sound or filename is supplied. Describe concrete audible events with unique IDs and onset/end seconds. For EACH event, acoustics MUST describe audible pitch, tonal/noisy texture, onset/decay and duration, independently of any guessed source. A description such as "bird vocalization" alone is insufficient acoustic evidence: describe its chirping/whistling/squealing sound. Physical source/material cannot always be known from sound alone; mark source guesses uncertain. Distinguish transient snaps/clicks from sustained tonal squeaks, throaty human grunts, and intelligible words. Flag intelligible speech and music honestly. Silence is not a sound event. Recording duration is ${sourceDuration}s.`,observationSchema,credentials,signal,fetcher,[{inlineData:{mimeType:'audio/mpeg',data:bytes.toString('base64')}}]);
 const ids=new Set();
 for(const event of observation.events){
  if(ids.has(event.id)||event.end<=event.start||event.end>sourceDuration+.1)throw Error('SFX observation has invalid event times or duplicate IDs');
  ids.add(event.id);
 }
 if(observation.intelligibleSpeech||observation.music||!observation.events.length)return {accepted:false,reason:'Recording contains speech/music or no audible event',observation};
 const match=await geminiJSON(`Compare an intended silent-cartoon sound with an INDEPENDENT BLIND AUDIO OBSERVATION. Use only the observation as evidence; a search query is a requirement, never proof. Query: ${JSON.stringify(query)}. Role: ${role}. Available cue window: ${duration}s. ${sourceStart>0?`An explicit sourceStart ${sourceStart}s must be retained: select an event audible in ${sourceStart}..${sourceStart+duration}s.`:'Select a recognizable event; its onset will be used to avoid cropping a silent or unrelated beginning.'} Judge acoustic suitability from pitch/timbre/envelope, not whether a guessed physical source equals the query noun. Foley reuse is allowed when the audible qualities fit: a chirping squeal may serve a toy squeak without proving the recording source was a toy. A bare guessed source with no matching acoustic evidence must not pass. Reject a transient snap/click when a sustained tonal squeak is required, a throaty human grunt for a mechanical effect, intelligible speech/music, or an event that cannot be recognized within this cue window. accepted:true must cite exactly one real eventId and explain the matching audible qualities. Return null eventId on rejection. OBSERVATION: ${JSON.stringify(observation)}`,matchSchema,credentials,signal,fetcher);
 const event=observation.events.find(e=>e.id===match.eventId);
 if(!match.accepted||!event)return {...match,accepted:false,observation};
 if(sourceStart>0&&(event.end<=sourceStart||event.start>=sourceStart+duration))return {...match,accepted:false,reason:'Selected event does not overlap the explicit source slice',observation};
 return {...match,accepted:true,sourceStart:sourceStart>0?sourceStart:Math.max(0,event.start-.015),observation};
}

export async function resolveReviewedSound({query,role,duration,sourceStart=0,signal,search,load,review,progress=()=>{},maxAttempts=3}){
 const rejected=[],reports=[];
 for(let attempt=0;attempt<maxAttempts;attempt++){
  signal?.throwIfAborted();
  const item=await search({excludeIds:rejected,retry:attempt});
  const loaded=await load(item);
  const verdict=await review(loaded,{query,role,duration,sourceStart,sourceDuration:loaded.duration});
  reports.push({id:item.id,...verdict});
  if(verdict.accepted)return {item,file:loaded.file,sourceStart:verdict.sourceStart??sourceStart,reports};
  rejected.push(item.id);progress(`Sound did not match the cue; trying another Freesound recording (${attempt+1}/${maxAttempts})`);
 }
 const error=Error('No acoustically matching CC0 Freesound recording after '+maxAttempts+' candidates for: '+query);
 error.soundReviews=reports;throw error;
}

const fallbackSchema=z.object({alternatives:z.array(z.object({query:z.string().min(2).max(80),reason:z.string().min(8)}).strict()).max(2)}).strict();
export async function planSoundFallback({query,role,story,scene,intents,reports},credentials,signal,fetcher=fetch){
 return geminiJSON(`Select at most TWO practical alternate Freesound Foley searches after failed acoustic matches. Preserve the physical action, material, emotional intent and all sounds explicitly required by the user's original request. An engine-invented sound choice may be replaced by another fitting cartoon Foley sound. Do not change an explicitly requested squeak into a click. No intelligible speech, music, bundled fixture or generated audio. Queries must be short literal English sound terms, one audible event each, without adjectives such as funny/cartoon. Return no alternatives if none can preserve the story. Original request: ${JSON.stringify(story)}. Scene: ${JSON.stringify(scene)}. Action intents: ${JSON.stringify(intents)}. Failed query: ${JSON.stringify(query)}. Role: ${role}. Rejected acoustic evidence: ${JSON.stringify(reports.map(r=>({id:r.id,reason:r.reason})))}`,fallbackSchema,credentials,signal,fetcher);
}

export async function resolveSoundWithFallback(options,alternativePlanner){
 try{return await resolveReviewedSound(options);}catch(error){
  if(options.signal?.aborted||!error.soundReviews)throw error;
  const reports=[...error.soundReviews],original=options.query;
  const proposal=await alternativePlanner(reports);
  const queries=new Set([original.toLowerCase().trim()]);
  for(const alternative of proposal.alternatives.slice(0,2)){
   const query=alternative.query.trim();if(queries.has(query.toLowerCase()))continue;queries.add(query.toLowerCase());
   options.progress?.('Trying alternate action Foley from Freesound: '+query);
   try{const result=await resolveReviewedSound({...options,query,maxAttempts:3,search:selection=>options.search({...selection,queryOverride:query})});
    return{...result,reports:[...reports,...result.reports],selectedQuery:query,substitutionReason:alternative.reason};
   }catch(next){if(options.signal?.aborted||!next.soundReviews)throw next;reports.push(...next.soundReviews);}
  }
  const exhausted=Error('No acoustically matching CC0 Freesound recording after literal and alternate action Foley searches for: '+original);exhausted.soundReviews=reports;throw exhausted;
 }
}

export async function reviewSoundForCue(bytes,spec,credentials,signal,fetcher,renderSlice){
 const recording=await reviewSoundRecording(bytes,spec,credentials,signal,fetcher);
 if(!recording.accepted)return recording;
 // A correct long recording can still become a click or silence when cropped.
 // Inspect the exact prepared cue including its trim/rate before accepting it.
 const sliceBytes=await renderSlice(recording.sourceStart??spec.sourceStart??0);
 const sliceReview=await reviewSoundRecording(sliceBytes,{...spec,sourceStart:0,sourceDuration:spec.duration},credentials,signal,fetcher);
 return {...recording,accepted:sliceReview.accepted,reason:sliceReview.reason,sliceReview};
}
