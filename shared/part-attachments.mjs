import {findPartMatrix,multiply,transformMatrix,transformPoint} from './part-motion.mjs';

export function validatePartAttachments(scene,designs){
  const placements=new Map(scene.props.map(p=>[p.designId,p]));
  for(const p of scene.props){const a=p.partAttachment;if(!a)continue;
    if(a.end<=a.start||a.end>scene.duration)throw Error(`Invalid part attachment interval on ${p.designId}`);
    if(p.attachment||p.attachmentEvents?.length||scene.beats.some(b=>b.targetId===p.designId))throw Error(`Part-attached ${p.designId} cannot also have actor-owned actions or attachments`);
    if(scene.motions.some(m=>m.targetId===p.designId&&m.start<a.end))throw Error(`Motion on ${p.designId} must start after its part attachment releases`);
    const target=placements.get(a.targetId),design=designs.find(d=>d.id===a.targetId);
    if(!target||a.targetId===p.designId)throw Error(`Missing or self-referencing part attachment target ${a.targetId}`);
    // A rigid child cannot preserve shear/nonuniform scale: reject instead of sliding.
    const spec=design.visualSpec;
    if(!spec||spec.globalTransform||spec.localTransform||spec.normalizedDimensions.width!==100||spec.normalizedDimensions.height!==100)throw Error('Part attachments require local 100x100 visual coordinates without outer transforms');
    const inspect=(nodes)=>{for(const n of nodes){if(n.scale&&n.scale[0]!==n.scale[1])throw Error('Part attachment hierarchy requires uniform scale');for(const track of n.animation||[])for(const k of track.keys)if(k.scale&&k.scale[0]!==k.scale[1])throw Error('Part attachment animation requires uniform scale');if(n.children)inspect(n.children);}};
    inspect(spec.geometryRecipe);
    if(!findPartMatrix(spec.geometryRecipe,a.nodeId,0,scene.id))throw Error(`Unknown attachment part ${a.nodeId} on ${a.targetId}`);
    const visited=new Set([p.designId]);let cursor=target;while(cursor){if(visited.has(cursor.designId))throw Error('Cyclic part attachment');visited.add(cursor.designId);cursor=placements.get(cursor.partAttachment?.targetId);}
  }
}

export function resolvePartAttachments(scene,t,props,designs,evaluate){
  const done=new Set();
  const resolve=(placement)=>{
    if(done.has(placement.designId))return;done.add(placement.designId);
    const a=placement.partAttachment;if(!a||t<a.start)return;
    const child=props[placement.designId];
    if(t>=a.end){
      const released=evaluate(scene,Math.max(a.start,a.end-1e-7),designs).props[placement.designId];
      child.position=[...released.position];child.angle=released.angle;child.scale=released.scale;
      for(const m of [...scene.motions].filter(m=>m.targetId===placement.designId&&t>=m.start).sort((x,y)=>x.start-y.start)){
        let u=Math.min(1,(t-m.start)/m.duration);u=m.timing==='gravity'?u*u:m.timing==='linear'?u:u*u*(3-2*u);
        child.position=child.position.map((x,i)=>x+(m.to[i]-x)*u);child.position[1]-=Math.sin(Math.PI*u)*m.arc;
        child.angle+=(m.angle-child.angle)*u;if(m.scale!==undefined)child.scale+=(m.scale-child.scale)*u;
      }return;
    }
    const targetPlacement=scene.props.find(p=>p.designId===a.targetId);resolve(targetPlacement);
    const parent=props[a.targetId],design=designs.find(d=>d.id===a.targetId);
    const local=findPartMatrix(design.visualSpec.geometryRecipe,a.nodeId,t,scene.id);
    const matrix=multiply(transformMatrix(parent.position,parent.angle,[parent.scale,parent.scale]),local);
    child.position=transformPoint(matrix,a.offset);child.angle=Math.atan2(matrix[1],matrix[0])*180/Math.PI+a.angle;
    child.scale=placement.scale*Math.hypot(matrix[0],matrix[1]);child.owner=null;
  };
  for(const p of scene.props)resolve(p);
}
