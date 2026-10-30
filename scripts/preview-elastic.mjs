import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';
import {svgFrame} from '../renderer/engine.mjs';

// Offline preview of the real renderer; no provider credentials required.
const plan=JSON.parse(await readFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),'utf8'));
plan.referenceStyle='elastic-meme';
for(const character of plan.characters)character.artStyle='classic';
const output=new URL('../artifacts/reference-review/',import.meta.url);
await mkdir(output,{recursive:true});
const svg=svgFrame(plan,1);
await writeFile(new URL('elastic-preview.svg',output),svg);
await writeFile(new URL('elastic-preview.png',output),new Resvg(svg,{fitTo:{mode:'width',value:540}}).render().asPng());
console.log('Elastic preview: artifacts/reference-review/elastic-preview.png');
