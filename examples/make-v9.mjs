import{evaluate}from'../renderer/engine.mjs';
import fs from'node:fs';import{validatePlan}from'../shared/schema.mjs';import{planHash,assertRenderable}from'../server/inspect.mjs';import{directSceneSounds}from'../server/sound-director.mjs';
for(const[name,source,fps]of[['superhero-v9','superhero-return',60],['cool-cap-v9','cool-cap-v8',120]]){
 let p=JSON.parse(fs.readFileSync(new URL(source+'.json',import.meta.url)));delete p.review;p.renderFps=fps;
 if(name==='cool-cap-v9'){
  p.propDesigns.find(d=>d.id==='egg').gripOffset=[-30,18];
  const s=p.scenes[2],pick=s.beats[0],grip=evaluate(s,pick.start+pick.duration,p.propDesigns).states.Raju.leftHand;
  s.beats[1].keyframes[0].pose.leftHand=[...grip];
  for(const b of s.beats)for(const k of b.keyframes||[])if(k.pose.leftHand?.[0]===5&&k.pose.leftHand[1]===-360)k.pose.leftHand=[-22,-354];
 }
 if(name==='superhero-v9'){
  p.scenes[0].beats[0].motionEffect='flight';p.scenes[0].sounds=p.scenes[0].sounds.filter(c=>c.fixture!=='air-swish');
  p.scenes[0].motions[0].timing='gravity';p.scenes[0].motions[0].arc=0;p.scenes[0].motions[0].impactOnEnd=true;
  p.scenes[1].beats[1].motionEffect='flight';p.scenes.at(-1).motions[0].impactOnEnd=true;
 }
 if(name==='superhero-v9')for(const s of p.scenes)for(const c of s.sounds)if(s.motions.some(m=>m.impactOnEnd&&Math.abs(m.start+m.duration-c.start)<.025)){c.category='plop';c.fixture='wet-plop';c.duration=.4;c.volume=.18;}
 p.scenes=p.scenes.map(directSceneSounds);p=validatePlan(p);p.review={method:'authored-example',planHash:planHash(p),summary:'V9 authored sample: visible connected reaching forearms, semantic flight air and wind streaks, gravity drop and contact particles, cheek-local punch flash; recorded CC0 gibberish. Not a live Gemini output.'};
 assertRenderable(p);fs.writeFileSync(new URL(name+'.json',import.meta.url),JSON.stringify(p,null,2));console.log(name,fps,p.scenes.reduce((n,s)=>n+s.duration,0));
}
