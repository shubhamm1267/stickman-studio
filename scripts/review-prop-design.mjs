import 'dotenv/config';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {VisualSpecSchema} from '../shared/schema.mjs';
import {z} from 'zod';
import {geminiJSON} from '../server/providers.mjs';
import {normalizeGeneratedArt} from '../shared/normalize-art.mjs';
import {reviewPropRecognition,assetPreview,planObjectDrawing} from '../server/asset-recognition.mjs';
import {propConstruction} from '../shared/prop-construction.mjs';
const [file,id]=process.argv.slice(2);
if(!file||!id)throw Error('Usage: node scripts/review-prop-design.mjs plan.json propId');
const plan=JSON.parse(await readFile(file,'utf8')),design=plan.propDesigns.find(d=>d.id===id);
if(!design?.visualSpec)throw Error('Prop has no custom visual design');
const credentials={gemini:process.env.GEMINI_API_KEY},signal=AbortSignal.timeout(180000);
const schema=z.object({visualSpec:VisualSpecSchema});schema.normalizeGeneratedValue=normalizeGeneratedArt;
let asset={visualSpec:design.visualSpec},report;
const brief=await planObjectDrawing(design,credentials,signal);
const dir=path.resolve('artifacts/prop-review',id);await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'before.png'),assetPreview(asset.visualSpec));
for(let attempt=0;attempt<3;attempt++){
 report=await reviewPropRecognition(design,asset,credentials,signal);
 if(report.recognizable&&!report.missingDetails.length)break;
 if(attempt===2)break;
 const rejected=assetPreview(asset.visualSpec),construction=propConstruction(design.type);let feedback=construction?'A second attached image is an ORIGINAL CONSTRUCTION GUIDE with correct connected silhouette. Use that topology and clear flaps, not the rejected blob.':'';
 for(let format=0;format<3;format++){
  try{
   const candidate=await geminiJSON(`Redraw this original ink cartoon object so it is clearly recognizable. First attached image is REJECTED. Design: ${JSON.stringify({id:design.id,name:design.name,type:design.type,request:design.visualAssetRequest})}. CONSTRUCTION: ${JSON.stringify(brief)}. Concrete review: ${JSON.stringify(report)}. Rebuild the contours, not just the colors. Use connected cubic Bezier paths for organic silhouettes, proper tapered edges and visible inner surfaces, seams or joints as appropriate. Preserve named motion groups and anchors only where used; interior contours may be redrawn freely. Keep geometry local within -100..100, bottom at y=0 and center around x=0, no text or labels. geometryRecipe MUST be an ARRAY of nodes. Use raw path/ellipse/line/group geometry only; omit proceduralComponents. All colors six-digit hex. Return complete visualSpec with renderMode replace, normalizedDimensions 100x100. Format repair: ${feedback}`,schema,credentials,signal,fetch,[{inlineData:{mimeType:'image/png',data:rejected.toString('base64')}},...(construction?[{inlineData:{mimeType:'image/png',data:assetPreview(construction).toString('base64')}}]:[])]);
   assetPreview(candidate.visualSpec);asset=candidate;break;
  }catch(error){if(format===2)throw error;feedback=error.message;}
 }
}
await writeFile(path.join(dir,'after.png'),assetPreview(asset.visualSpec));
await writeFile(path.join(dir,'design.json'),JSON.stringify({...design,visualSpec:asset.visualSpec},null,2));
await writeFile(path.join(dir,'review.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output:dir,...report}));
if(!report.recognizable||report.missingDetails.length)process.exitCode=1;
