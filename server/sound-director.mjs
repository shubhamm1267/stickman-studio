import{actionEvents}from'./timing.mjs';
const known={punch:'impact',whoosh:'air-swish',gibberish:'scolding',mutter:'mutter-a',steps:'steps',plop:'wet-plop',cloth:'paper'};
export function directSceneSounds(scene){
 const s=structuredClone(scene);for(const c of s.sounds){if(c.category&&known[c.category]){c.fixture=known[c.category];c.trimSilence=false;c.sourceStart=0;}}
 // Generated semantic cues are rebuilt, so repeated review/render never doubles beds or landings.
 s.sounds=s.sounds.filter(c=>!['flight air rush','object landing plop'].includes(c.query));
 for(const m of s.motions||[])if(m.impactOnEnd){const at=m.start+m.duration;if(at<s.duration&&!s.sounds.some(c=>Math.abs(c.start-at)<.04&&['pop','wet-plop','slap','impact'].includes(c.fixture)))s.sounds.push({fixture:'pop',query:'object landing plop',start:at,duration:.18,volume:.18,required:true,sourceStart:0,trimSilence:false,playbackRate:1,pan:0});}
 for(const[i,b]of s.beats.entries()){
  if(b.motionEffect==='flight'){
   for(let offset=0;offset<b.duration;offset+=2.8)s.sounds.push({fixture:'flight-wind',query:'flight air rush',start:b.start+offset,duration:Math.min(3.1,b.duration-offset),volume:.11,required:true,sourceStart:0,trimSilence:false,playbackRate:1,pan:0});
  }
  if(b.kind==='punch'){
   // A miss has air movement only. A connected punch has a separate, exact contact event.
   s.sounds=s.sounds.filter(c=>!(c.beatIndex===i&&(c.syncTo==='contact'||c.category==='whoosh')));
   const t=actionEvents(s,b,[])[0];
   if(b.hit!==false)s.sounds.push({fixture:'impact',category:'punch',query:'cartoon fist body impact',start:t,duration:.38,volume:.24,required:true,beatIndex:i,syncTo:'contact',sourceStart:0,trimSilence:false,playbackRate:1,pan:0});
   s.sounds.push({fixture:'air-swish',category:'whoosh',query:'fast fist swish',start:Math.max(b.start,t-.15),beatIndex:i,duration:.2,volume:.14,required:true,sourceStart:0,trimSilence:false,playbackRate:1,pan:0});
  }
  const vocal={scold:['scolding','angry gibberish mumbling'],laugh:[undefined,'cartoon laughter'],cry:[undefined,'crying sobbing'],struggle:['grunt','effort grunt'],panic:[undefined,'surprised gasp']}[b.kind];
  const end=Math.min(s.duration,b.start+b.duration),start=b.start+Math.min(.1,b.duration*.1);
  if(vocal&&end>start&&!s.sounds.some(c=>c.actorId===b.actorId&&c.role==='nonverbal'&&c.start<end&&c.start+c.duration>b.start))s.sounds.push({fixture:vocal[0],actorId:b.actorId,role:'nonverbal',query:vocal[1],start,duration:Math.min(3,end-start),volume:.3,required:true,sourceStart:0,trimSilence:true,playbackRate:1,pan:0});
 }
 return s;
}
export function applySoundDirection(plan){return{...plan,scenes:plan.scenes.map(directSceneSounds)};}
