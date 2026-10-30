import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateObjectBlueprint} from '../server/object-blueprint.mjs';
import {planObjectDrawing,reviewPropRecognition,assetPreview} from '../server/asset-recognition.mjs';
const name=process.argv[2],output=process.argv[3];
if(!name||!output)throw Error('Usage: node scripts/generate-object-json.mjs "object description" output-directory');
const dir=path.resolve(output);await mkdir(dir,{recursive:true});
const credentials={gemini:process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL};
const signal=AbortSignal.timeout(240000);
const design={id:'object',name,type:'drawing',visualAssetRequest:{description:name,requiredFeatures:[]}};
const brief=await planObjectDrawing(design,credentials,signal);
design.visualAssetRequest.requiredFeatures=brief.recognitionCues;
await writeFile(path.join(dir,'brief.json'),JSON.stringify(brief,null,2));
let feedback='',images=[];
for(let attempt=0;attempt<3;attempt++){
 try{
  const asset=await generateObjectBlueprint({design,brief,requested:brief.recognitionCues,feedback,images,credentials,signal});
  const png=assetPreview(asset.visualSpec);
  await writeFile(path.join(dir,`attempt-${attempt}.json`),JSON.stringify(asset,null,2));
  await writeFile(path.join(dir,`attempt-${attempt}.png`),png);
  const review=await reviewPropRecognition(design,asset,credentials,signal);
  await writeFile(path.join(dir,`review-${attempt}.json`),JSON.stringify(review,null,2));
  if(review.recognizable&&!review.missingDetails.length){
   await writeFile(path.join(dir,'accepted.json'),JSON.stringify({design,brief,asset,review},null,2));
   await writeFile(path.join(dir,'accepted.png'),png);console.log('PASS '+name+' -> '+dir);break;
  }
  feedback=`Rejected drawing: ${JSON.stringify(review)}. Repair visible geometry; keep original requested object and details.`;
  images=[{inlineData:{mimeType:'image/png',data:png.toString('base64')}}];
  if(attempt===2)throw Error('Object recognition still failed: '+review.missingDetails.join('; '));
 }catch(error){
  if(attempt===2||signal.aborted)throw error;
  feedback+=' Invalid geometry JSON: '+error.message;
 }
}
