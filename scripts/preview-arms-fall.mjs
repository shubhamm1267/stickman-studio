import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {compileDirection} from '../server/choreographer.mjs';
import {svgFrame} from '../renderer/engine.mjs';
import {findBrowser} from '../server/browser.mjs';
const old=JSON.parse(await readFile('deliverables/final-original-story/plan.json','utf8'));
const plan=compileDirection(JSON.parse(old.directionScore),{durationMode:'manual',duration:10,renderFps:60,format:'shorts',language:old.language,story:old.sourceIdea},JSON.parse(old.soundScore));
await mkdir('deliverables/arms-fall-corrected',{recursive:true});
await writeFile('deliverables/arms-fall-corrected/plan.json',JSON.stringify(plan,null,2));
const fall=plan.scenes[0].beats.find(b=>b.semanticAction==='fall'||b.kind==='fall');
const times=[0,2,3,4,fall.start, ...[.16,.42,.65,.76,.88,1].map(f=>fall.start+fall.duration*f),6,7,8,9];
const browser=await chromium.launch({executablePath:await findBrowser(),headless:true});
try{const page=await browser.newPage({viewport:{width:1080,height:1230}});
await page.setContent('<body style="margin:0;display:grid;grid-template-columns:repeat(5,216px);background:#fff">'+times.map(t=>`<div style="height:410px"><div style="height:384px">${svgFrame(plan,t)}</div><div>${t.toFixed(2)}s</div></div>`).join('')+'</body>');
await page.screenshot({path:'docs/original-encoded-review/arms-fall-local.jpg',fullPage:true});}finally{await browser.close();}
