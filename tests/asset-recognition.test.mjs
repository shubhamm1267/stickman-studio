import test from 'node:test';
import assert from 'node:assert/strict';
import {assetPreview,reviewPropRecognition} from '../server/asset-recognition.mjs';
import {normalizeGeneratedArt} from '../shared/normalize-art.mjs';
import {VisualSpecSchema} from '../shared/schema.mjs';
import {constructionCatalog,propConstruction} from '../shared/prop-construction.mjs';

test('every reusable construction is valid renderer geometry with an actual drawable PNG',()=>{
 for(const entry of constructionCatalog){
  const spec=VisualSpecSchema.parse(propConstruction(entry.id));
  assert.ok(spec.geometryRecipe.length>0);assert.equal(assetPreview(spec).subarray(1,4).toString(),'PNG');
 }
});
test('single-node drawings and shorthand colors preserve their rendered meaning',()=>{
 const source={visualSpec:{geometryRecipe:{kind:'ellipse',center:[0,0],radius:[10,20],fill:'#fc0',stroke:'none'}}};
 const lowered=normalizeGeneratedArt(source);
 const parsed=VisualSpecSchema.parse(lowered.visualSpec);
 assert.equal(parsed.geometryRecipe[0].fill,'#ffcc00');assert.equal(parsed.geometryRecipe[0].width,0);
 assert.equal(source.visualSpec.geometryRecipe.stroke,'none');
});
test('prop recognition observes pixels without the intended name, then rejects an ambiguous silhouette',async()=>{
 const design={id:'testCup',name:'Coffee cup',visualAssetRequest:{description:'A cup with a handle'}};
 const asset={visualSpec:{renderMode:'replace',geometryRecipe:[{kind:'ellipse',center:[0,0],radius:[25,25],fill:'#ffff00'}]}};
 assert.equal(assetPreview(asset.visualSpec).subarray(1,4).toString(),'PNG');
 let calls=0;
 const fake=async(url,init)=>{
  const parts=JSON.parse(init.body).contents[0].parts;
  if(calls++===0){assert.ok(parts[0].inlineData);assert.ok(!parts.at(-1).text.includes('Coffee cup'));return Response.json({outputs:[{text:JSON.stringify({identity:'yellow circle',visibleDetails:['round'],ambiguities:['no handle']})}]});}
  assert.match(parts.at(-1).text,/Coffee cup/);
  return Response.json({outputs:[{text:JSON.stringify({recognizable:false,missingDetails:['rim','handle'],repair:'Draw an open rim and curved handle'})}]});
 };
 const verdict=await reviewPropRecognition(design,asset,{gemini:'test'},undefined,fake);
 assert.equal(verdict.recognizable,false);assert.equal(calls,2);
});
test('a recognition pass cannot omit evidence for requested visible parts',async()=>{
 const design={id:'bike',name:'Bicycle',visualAssetRequest:{requiredFeatures:['spoked wheels','pedals']}};
 const asset={visualSpec:{geometryRecipe:[{kind:'ellipse',center:[0,0],radius:[20,20]}]}};
 let call=0;const fake=async()=>Response.json({outputs:[{text:JSON.stringify(call++===0?{identity:'bicycle icon',visibleDetails:['two wheels'],ambiguities:[]}:{recognizable:true,missingDetails:[],repair:'',featureEvidence:[{featureIndex:0,visible:true,evidence:'spokes visible'}]})}]});
 const result=await reviewPropRecognition(design,asset,{gemini:'test'},undefined,fake);
 assert.equal(result.recognizable,false);assert.match(result.missingDetails.join(' '),/pedals/);
});
