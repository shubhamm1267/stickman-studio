import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {validatePlan} from '../shared/schema.mjs';
import {assertRenderable} from '../server/inspect.mjs';
import {buildAudio} from '../server/media.mjs';
import {renderFilm} from '../server/render.mjs';
const input=JSON.parse(await readFile('examples/motion-ir-lantern.json','utf8'));
for(const [fps,quality] of [[60,'full'],[120,'draft']]){
 const plan=validatePlan({...input,renderFps:fps}),dir='deliverables/dynamic-core-'+fps;
 await mkdir(dir,{recursive:true});assertRenderable(plan);
 const {audio}=await buildAudio(plan,dir,{},undefined,{bundled:true});
 await writeFile(dir+'/plan.json',JSON.stringify(plan,null,2));
 await renderFilm(plan,dir,audio,{quality,progress:(m,p)=>console.log(fps,p,m)});
 await writeFile(dir+'/provenance.json',JSON.stringify({handAuthoredRuntimeFixture:true,aiGenerated:false,providerCalls:0,containsSpeech:false,fps,quality,claim:'Generic custom vector geometry and canonical motion-track runtime/export proof; not an AI story-generation test.'},null,2));
}
