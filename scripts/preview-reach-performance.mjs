import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';
import {svgFrame} from '../renderer/engine.mjs';
import {compileStylePerformance} from '../shared/style-performance.mjs';
// Authored action regression preview, not an automatically generated story.
let plan=JSON.parse(await readFile(new URL('../deliverables/dynamic-live/plan.json',import.meta.url),'utf8'));
plan.referenceStyle='elastic-meme';
for(const c of plan.characters)c.artStyle='classic';
const scene=plan.scenes[0];plan.scenes=[scene];scene.duration=4;
scene.backgroundNodes=[];scene.motions=[];scene.sounds=[];scene.dialogue=[];
scene.props=scene.props.filter(p=>p.designId==='peel1');
scene.beats=[{actorId:'ramesh',kind:'pick',targetId:'peel1',hand:'right',start:.4,duration:1.5,amount:1,intent:'He crouches, grips the peel, and rises holding it.'}];
scene.shots=[{start:0,end:4,focus:[270,530],zoom:1,detail:'full'}];
plan=compileStylePerformance(plan);
const dir=new URL('../artifacts/reach-performance/',import.meta.url);await mkdir(dir,{recursive:true});
await writeFile(new URL('plan.json',dir),JSON.stringify(plan,null,2));
for(let frame=0;frame<120;frame++){
 const svg=svgFrame(plan,frame/30);
 await writeFile(new URL(`frame-${String(frame).padStart(4,'0')}.png`,dir),new Resvg(svg,{fitTo:{mode:'width',value:640}}).render().asPng());
}
console.log('Rendered 120 action preview frames');
