import {z} from 'zod';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {geminiJSON} from './providers.mjs';
import {VisualSpecSchema} from '../shared/schema.mjs';
import {DATA} from './files.mjs';
import {ObjectBehaviorSchema} from '../shared/performance-direction.mjs';
import {Resvg} from '@resvg/resvg-js';
import {visualSpec as renderVisualSpec} from '../renderer/draw.mjs';

function drawnBounds(spec){
 const content=renderVisualSpec(spec);
 const raster=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="-500 -500 1000 1000">${content}</svg>`).render();
 const bytes=raster.pixels;let left=1000,top=1000,right=-1,bottom=-1;
 for(let y=0;y<1000;y++)for(let x=0;x<1000;x++)if(bytes[(y*1000+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<0)throw Error('Object part has no visible drawing');
 if(left===0||top===0||right===999||bottom===999)throw Error('Object drawing exceeds the local construction area; keep all contours within -250..250');
 return {left:left-500,top:top-500,right:right+1-500,bottom:bottom+1-500};
}

const coordinate=z.number().finite().min(-250).max(250);
const point=z.tuple([coordinate,coordinate]);
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const paint={fill:z.union([color,z.literal('none')]),stroke:z.union([color,z.literal('none')]),width:z.number().min(0).max(5)};
const primitive=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('path'),d:z.string().min(3).max(3000),...paint}).strict(),
 z.object({kind:z.literal('ellipse'),center:point,radius:z.tuple([z.number().min(.1).max(200),z.number().min(.1).max(200)]),...paint}).strict(),
 z.object({kind:z.literal('line'),from:point,to:point,stroke:color,width:z.number().min(.1).max(5)}).strict(),
 z.object({kind:z.literal('roundedRect'),rect:z.tuple([coordinate,coordinate,z.number().min(.1).max(300),z.number().min(.1).max(300)]),cornerRadius:z.number().min(0).max(50),...paint}).strict(),
]);
export const ObjectBlueprintSchema=z.object({
 objectState:z.string().min(3),viewpoint:z.string().min(3),
 behaviors:z.array(ObjectBehaviorSchema).max(30).default([]),
 parts:z.array(z.object({id,parentId:id.optional(),purpose:z.string().min(3),pivot:point.optional(),primitives:z.array(primitive).min(1).max(15)}).strict()).min(2).max(20),
 anchors:z.object({grip:point,base:point,support:point}).strict(),
 features:z.array(z.object({featureIndex:z.number().int().min(0),partIds:z.array(id).min(1),visibleDetail:z.string().min(3)}).strict()).min(1).max(24),
}).strict();

export function compileObjectBlueprint(raw,requested=[]){
 const blueprint=ObjectBlueprintSchema.parse(raw);
  for(const part of blueprint.parts)for(const primitive of part.primitives){
    // A fill-only contour is ordinary geometry, not a missing stroke color.
    if(primitive.stroke==='none'){primitive.stroke='#000000';primitive.width=0;}
  }
 const ids=new Set(blueprint.parts.map(p=>p.id));
 if(ids.size!==blueprint.parts.length)throw Error('Object parts have duplicate IDs');
 const nodes=new Map(blueprint.parts.map(p=>[p.id,{id:p.id,kind:'group',...(p.pivot?{pivot:p.pivot}:{}),children:structuredClone(p.primitives)}]));
 const roots=[];
 const bounds=new Map(blueprint.parts.map(p=>[p.id,drawnBounds({geometryRecipe:p.primitives})]));
 for(const part of blueprint.parts){
  let current=part,ancestors=new Set([part.id]);
  while(current.parentId){
   if(!ids.has(current.parentId))throw Error('Unknown object parent '+current.parentId);
   if(ancestors.has(current.parentId))throw Error('Object part hierarchy contains a cycle');
   ancestors.add(current.parentId);current=blueprint.parts.find(p=>p.id===current.parentId);
  }
  if(ancestors.size>4)throw Error(`Object part ${part.id} has ${ancestors.size} nested parts. Maximum is 4 including the root. Keep decorative details as primitives in their structural part; use parentId only for real mechanical dependencies.`);
  if(part.parentId){
   const a=bounds.get(part.id),b=bounds.get(part.parentId);
   const gap=Math.hypot(Math.max(0,a.left-b.right,b.left-a.right),Math.max(0,a.top-b.bottom,b.top-a.bottom));
   if(gap>2)throw Error(`Disconnected object part ${part.id}: ${gap.toFixed(1)} local units from parent ${part.parentId}. Join the actual drawn contours; hierarchy alone does not connect artwork.`);
   nodes.get(part.parentId).children.push(nodes.get(part.id));
  }else roots.push(nodes.get(part.id));
 }
 for(const feature of blueprint.features)for(const partId of feature.partIds)
  if(!ids.has(partId))throw Error('Object feature refers to missing part '+partId);
 for(const behavior of blueprint.behaviors){
  if(!ids.has(behavior.partId))throw Error('Object behavior refers to missing part '+behavior.partId);
  if(behavior.rotationLimits&&behavior.rotationLimits[0]>behavior.rotationLimits[1])throw Error('Object rotation limits are reversed');
  if(behavior.operation==='rotate'&&!blueprint.parts.find(p=>p.id===behavior.partId).pivot)throw Error('Rotating object part needs an explicit pivot '+behavior.partId);
 }
 for(let index=0;index<requested.length;index++)
  if(blueprint.features.filter(f=>f.featureIndex===index).length!==1)throw Error(`Object feature ${index} needs exactly one geometry link`);
 if(roots.length!==1)throw Error('One physical object needs one root part; connect each structural part with its parentId');
 const whole=drawnBounds({geometryRecipe:roots});
 const offset=[-(whole.left+whole.right)/2,-whole.bottom];
 // Bottom alignment can push valid source anchors below -250. Normalize the
 // entire hierarchy uniformly, including anchors; never clamp a hand contact
 // independently or distort a tall object to fit its construction frame.
 const scale=Math.min(1,240/Math.max(1,whole.bottom-whole.top),480/Math.max(1,whole.right-whole.left));
 for(const [id,point] of Object.entries(blueprint.anchors)){
  if(point[0]<whole.left-4||point[0]>whole.right+4||point[1]<whole.top-4||point[1]>whole.bottom+4)
   throw Error(`Object ${id} anchor ${JSON.stringify(point)} lies outside the actual drawn bounds ${JSON.stringify(whole)}. Put contact anchors on the visible contour; do not clamp or invent a distant hand target.`);
 }
 for(const root of roots){root.position=offset.map(v=>v*scale);if(scale<1)root.scale=[scale,scale];}
 const visualSpec=VisualSpecSchema.parse({renderMode:'replace',geometryRecipe:roots,normalizedDimensions:{width:100,height:100},motionAnchors:Object.entries(blueprint.anchors).map(([id,position])=>({id,position:id==='base'?[0,0]:[(position[0]+offset[0])*scale,(position[1]+offset[1])*scale]}))});
 return {visualSpec,behaviors:blueprint.behaviors,features:blueprint.features.map(f=>({featureIndex:f.featureIndex,feature:requested[f.featureIndex] || f.visibleDetail,nodeIds:f.partIds,nativeProperties:[]}))};
}

export async function generateObjectBlueprint({design,brief,requested=[],feedback='',images=[],credentials,signal,fetcher=fetch}){
 feedback=`Use at most four nested structural parts including the root. Draw seams, rims and colour patches as primitives inside their structural part, not long chains of child parts. Each path contour and its control points must fit -240..240 local coordinates, including tall bottle bodies. Declare behaviors for usable parts: grip/support anchors for carried/resting objects, rotate/open/slide/press only where the drawn anatomy supports it. Rotation needs a real pivot and ordered rotationLimits in local degrees. Do not invent movement for a rigid object. These limits are enforced on part animation. ${feedback}`;
 const raw=await geminiJSON(`Design ONE original ink cartoon physical object as executable geometry JSON. Object data: ${JSON.stringify(design)}. Construction brief: ${JSON.stringify(brief)}. Required features indexed from zero: ${JSON.stringify(requested.map((feature,featureIndex)=>({featureIndex,feature})))}. Supply every requested index once with concrete partIds and visibleDetail. With no listed features supply index0 for the object's identity. Use real proportions and a clear side or three-quarter silhouette. All primitives use ASSET-LOCAL coordinates; center x=0, drawn bottom y=0, width typically80..160 and height proportional. Every part shares this local coordinate frame; parentId carries future rotation, not repeated world placement. Keep parts physically connected. IMPORTANT: SVG Y grows DOWNWARD. A point y=-100 is ABOVE y=-20. An upward kettle spout must end at a MORE NEGATIVE y than its body connection. Umbrella canopy apex is above its rim, shaft extends downward from apex, hooked handle is BELOW the canopy. Base is the lowest drawn point. One physical object has exactly ONE root part; every attached structural part needs a parentId and its actual contour must touch or overlap its parent within 2 local units. Use curved closed paths for organic forms. Include appropriate openings, inner surfaces, handles, rims, seams, hinges and joints large enough to see. Do not return a logo, icon, badge, schematic, text label or abstract symbol. Use sparse useful details and consistent thin dark outlines. Anchors must be actual drawn points: grip where a hand holds, base where it rests, support on the upper surface. Moving parts need named groups and real pivot positions. Six-digit hex colors. Path d must contain valid SVG path commands. No URLs, raw SVG, code or image API. Attached images are construction guides or rejected candidates as explained in feedback. ${feedback}`,ObjectBlueprintSchema,credentials,signal,fetcher,images);
 let asset;
 try{asset=compileObjectBlueprint(raw,requested);}catch(error){error.generatedValue=raw;throw error;}
 const hash=createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 const dir=path.join(DATA,'object-blueprints');await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,hash+'.json'),JSON.stringify({designId:design.id,blueprint:raw,asset},null,2));
 return asset;
}
