// Pure scene-local animation. No generated code, DOM state, or wall clock.
export const PART_MOTION_CAPABILITIES = Object.freeze({version:1,
  channels:['position','rotation','scale','opacity'], interpolation:['linear','smooth','hold'],
  playback:['once','loop','pingpong'], nestedJoints:true, sceneScoped:true,
  limits:{keys:48,tracksPerNode:16,depth:4,nodesPerVisual:100},
  unsupported:['3D rotation','rigid-body physics','automatic cloth/liquid simulation']});
const mix=(a,b,u)=>Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*u):a+(b-a)*u;
export function samplePart(node,t,sceneId){
  const base={position:node.position||[0,0],rotation:node.rotation||0,scale:node.scale||[1,1],opacity:node.opacity??1};
  const tracks=(node.animation||[]).filter(x=>!x.sceneId||x.sceneId===sceneId);
  const track=tracks.find(x=>x.sceneId===sceneId)||tracks.find(x=>!x.sceneId);
  if(!track)return base;
  const keys=track.keys,first=keys[0].at,last=keys.at(-1).at,span=last-first;
  if(t<first)return base;
  if(track.playback==='loop')t=first+(t-first)%span;
  if(track.playback==='pingpong'){const phase=(t-first)%(2*span);t=first+(phase<=span?phase:2*span-phase);}
  const channels=['position','rotation','scale','opacity'];
  const frames=[];let pose={...base};
  for(const key of keys){for(const channel of channels)if(key[channel]!==undefined)pose[channel]=key[channel];frames.push({...pose,at:key.at,easing:key.easing});}
  if(t>=last)return frames.at(-1);
  const i=frames.findIndex(x=>x.at>t),a=frames[Math.max(0,i-1)],b=frames[i];
  let u=(t-a.at)/(b.at-a.at);if(a.easing==='hold')u=0;else if(a.easing==='smooth')u=u*u*(3-2*u);
  return Object.fromEntries(channels.map(c=>[c,mix(a[c],b[c],u)]));
}
export const identity=()=>[1,0,0,1,0,0];
export function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export const transformPoint=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
export function transformMatrix(position=[0,0],angle=0,scale=[1,1],pivot=[0,0]){
  const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),m=[c*scale[0],s*scale[0],-s*scale[1],c*scale[1],0,0];
  m[4]=position[0]+pivot[0]-m[0]*pivot[0]-m[2]*pivot[1];m[5]=position[1]+pivot[1]-m[1]*pivot[0]-m[3]*pivot[1];return m;
}
export function findPartMatrix(nodes,id,t,sceneId,parent=identity()){
  for(const node of nodes||[]){
    const state=samplePart(node,t,sceneId),matrix=node.kind==='group'?multiply(parent,transformMatrix(state.position,state.rotation,state.scale,node.pivot)):parent;
    if(node.id===id)return matrix;
    const found=findPartMatrix(node.children,id,t,sceneId,matrix);if(found)return found;
  }
  return null;
}
export function validatePartNodes(nodes,{sceneIds,owner='visual',allowBones=false}={}){
  const ids=new Set();
  const walk=(items,bound=false)=>{for(const node of items||[]){
    if(node.id){if(ids.has(node.id))throw Error(`Duplicate part id ${node.id} on ${owner}`);ids.add(node.id);}
    if(node.bone&&node.bone!=='root'&&!allowBones)throw Error(`Bone attachment on non-character ${owner}`);
    if(bound&&node.bone&&node.bone!=="root")throw Error(`Nested absolute bone binding on ${owner}; place skinned groups as siblings`);
    const scopes=new Set();for(const track of node.animation||[]){const scope=track.sceneId||'*';if(scopes.has(scope))throw Error(`Duplicate animation scope ${scope} on ${owner}`);scopes.add(scope);if(track.sceneId&&sceneIds&&!sceneIds.has(track.sceneId))throw Error(`Unknown animation scene ${track.sceneId}`);}
    walk(node.children,bound||Boolean(node.bone&&node.bone!=="root"));
  }};walk(nodes);return ids;
}
