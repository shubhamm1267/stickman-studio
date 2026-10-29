// Metadata-only migration after removal of legacy spoken-voice descriptions.
// Prove the picture and complete audio cue configuration are unchanged before updating.
import fs from'node:fs/promises';import{svgFrame}from'../renderer/engine.mjs';import{inspectPlan,planHash}from'../server/inspect.mjs';import{creatorPack}from'../server/creator.mjs';
const n='hero-silent',folder=new URL('../deliverables/'+n+'/',import.meta.url),before=JSON.parse(await fs.readFile(new URL('plan.json',folder))),after=JSON.parse(await fs.readFile(new URL('../examples/'+n+'.json',import.meta.url)));
for(let f=0;f<750;f++)if(svgFrame(before,f/30)!==svgFrame(after,f/30))throw Error('Picture differs at '+f);
const audio=p=>p.scenes.map(s=>({duration:s.duration,sounds:s.sounds,dialogue:s.dialogue}));if(JSON.stringify(audio(before))!==JSON.stringify(audio(after)))throw Error('Audio configuration changed');
const report=inspectPlan(after);report.storyReview=after.review.method;report.reviewCurrent=after.review.planHash===planHash(after);if(!report.ok||!report.reviewCurrent)throw Error('Updated metadata is not valid');
const credits=JSON.parse(await fs.readFile(new URL('sound-credits.json',folder))),pack=creatorPack(after,credits);
for(const[name,data]of[['plan.json',after],['quality-report.json',report],['creator-pack.json',pack]])await fs.writeFile(new URL(name,folder),JSON.stringify(data,null,2));await fs.writeFile(new URL('description.txt',folder),pack.description);
console.log('Metadata synchronized; all 750 SVG frames and all audio cues identical.');
