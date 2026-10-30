import test from 'node:test';
import assert from 'node:assert/strict';
import {compileObjectBlueprint,generateObjectBlueprint} from '../server/object-blueprint.mjs';
const raw=()=>({objectState:'empty cup',viewpoint:'side view',parts:[
 {id:'body',purpose:'cup shell',primitives:[{kind:'roundedRect',rect:[-20,-50,40,50],cornerRadius:4,fill:'#eeeecc',stroke:'#293329',width:1.5}]},
 {id:'handle',parentId:'body',purpose:'curved hand grip',pivot:[20,-30],primitives:[{kind:'path',d:'M20 -40 C50 -40 50 -10 20 -10',fill:'none',stroke:'#293329',width:2}]}
],anchors:{grip:[30,-25],base:[0,0],support:[0,-50]},features:[{featureIndex:0,partIds:['handle'],visibleDetail:'large curved handle'}]});
test('object JSON compiles named parts, hierarchy and real contact anchors without redrawing',()=>{
 const input=raw(),asset=compileObjectBlueprint(input,['curved handle']);
 assert.equal(asset.visualSpec.geometryRecipe[0].children[1].id,'handle');
 const offset=asset.visualSpec.geometryRecipe[0].position;
 assert.deepEqual(asset.visualSpec.motionAnchors.find(a=>a.id==='grip').position,[30+offset[0],-25+offset[1]]);
 assert.deepEqual(asset.visualSpec.motionAnchors.find(a=>a.id==='base').position,[0,0]);
 assert.deepEqual(asset.features[0].nodeIds,['handle']);assert.equal(input.parts[0].primitives.length,1);
});
test('broken object hierarchy and missing feature links cannot reach the renderer',()=>{
 for(const kind of ['cycle','parent','feature']){
  const input=raw();
  if(kind==='cycle')input.parts[0].parentId='handle';
  if(kind==='parent')input.parts[1].parentId='missing';
  if(kind==='feature')input.features[0].partIds=['missing'];
  assert.throws(()=>compileObjectBlueprint(input,['handle']));
 }
 const input=raw();input.features[0].featureIndex=1;
 assert.throws(()=>compileObjectBlueprint(input,['handle']),/exactly one geometry link/);
 const disconnected=raw();disconnected.parts[1].primitives[0].d='M100 -40 C150 -40 150 -10 100 -10';
 assert.throws(()=>compileObjectBlueprint(disconnected,['handle']),/Disconnected object part/);
});
test('generic object geometry comes from the Gemini response, including unfamiliar shapes',async()=>{
 let calls=0;
 const fake=async(url,options)=>{
  calls++;const text=JSON.parse(options.body).contents[0].parts.at(-1).text;
  assert.match(text,/invented folding kettle/);assert.match(text,/ASSET-LOCAL/);
  return Response.json({outputs:[{text:JSON.stringify(raw())}]});
 };
 const asset=await generateObjectBlueprint({design:{id:'invented',name:'invented folding kettle'},brief:{},requested:['handle'],credentials:{gemini:'test'},fetcher:fake});
 assert.equal(calls,1);assert.equal(asset.visualSpec.geometryRecipe[0].id,'body');
});
test('object behaviors need real parts, ordered limits and usable hinge pivots',()=>{
 const valid=raw();valid.behaviors=[{partId:'handle',operation:'rotate',rotationLimits:[-20,40]}];
 assert.equal(compileObjectBlueprint(valid,['handle']).behaviors[0].partId,'handle');
 const missing=structuredClone(valid);missing.behaviors[0].partId='ghost';assert.throws(()=>compileObjectBlueprint(missing,['handle']),/missing part/);
 const reversed=structuredClone(valid);reversed.behaviors[0].rotationLimits=[40,-20];assert.throws(()=>compileObjectBlueprint(reversed,['handle']),/reversed/);
 delete valid.parts[1].pivot;assert.throws(()=>compileObjectBlueprint(valid,['handle']),/pivot/);
});

test('filled object contours may explicitly disable their outline without changing their shape',()=>{
 const input=raw();input.parts[0].primitives[0].stroke='none';
 const asset=compileObjectBlueprint(input,['handle']);
 const contour=asset.visualSpec.geometryRecipe[0].children[0];
 assert.equal(contour.width,0);assert.equal(contour.fill,'#eeeecc');
 assert.equal(input.parts[0].primitives[0].stroke,'none');
});

test('tall artwork and its contact anchors normalize together without clipping or stretching',()=>{
 const input=raw();input.parts[0].primitives[0].rect=[-20,-240,40,280];
 input.anchors={grip:[20,-240],base:[0,40],support:[0,-240]};
 const asset=compileObjectBlueprint(input,['handle']),root=asset.visualSpec.geometryRecipe[0];
 assert.ok(root.scale[0]<1);assert.equal(root.scale[0],root.scale[1]);
 const grip=asset.visualSpec.motionAnchors.find(a=>a.id==='grip').position;
 assert.deepEqual(grip,[20*root.scale[0]+root.position[0],-240*root.scale[1]+root.position[1]]);
 assert.ok(Math.abs(grip[1])<=250);
});

test('excessive part nesting reports the mechanical hierarchy limit before renderer schema errors',()=>{
 const input=raw();
 for(let i=0;i<4;i++)input.parts.push({id:'detail'+i,parentId:i?'detail'+(i-1):'handle',purpose:'nested detail',primitives:structuredClone(input.parts[1].primitives)});
 assert.throws(()=>compileObjectBlueprint(input,['handle']),/Maximum is 4/);
});

test('an anchor outside actual artwork cannot become an invisible grasp target',()=>{
 const input=raw();input.anchors.grip=[200,-200];
 assert.throws(()=>compileObjectBlueprint(input,['handle']),/grip anchor.*outside the actual drawn bounds/);
});
