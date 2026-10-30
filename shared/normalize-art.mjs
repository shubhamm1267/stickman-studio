// Lossless lowering: a primitive with a transform is represented by a group.
// Unknown geometry and unsupported fields are intentionally left for validation.
export function normalizeGeneratedArt(input){
 const value=structuredClone(input),spec=value?.visualSpec;
 if(!spec)return value;
 const fields=['position','pivot','rotation','scale','opacity','animation','bone'];
 const walk=nodes=>nodes.map(node=>{
   if(!node||typeof node!=='object')return node;
   for(const field of ['fill','stroke'])if(typeof node[field]==='string' && /^#[0-9a-f]{3}$/i.test(node[field]))
     node[field]='#'+node[field].slice(1).split('').map(c=>c+c).join('');
   if(node.stroke==='none'){delete node.stroke;node.width=0;}
   if(node.children)node.children=walk(node.children);
   if(node.kind==='group'||!fields.some(k=>Object.hasOwn(node,k)))return node;
   const wrapper={kind:'group',...(node.id?{id:node.id}:{})};
   delete node.id;
   for(const key of fields)if(Object.hasOwn(node,key)){wrapper[key]=node[key];delete node[key];}
   wrapper.children=[node];return wrapper;
 });
 for(const field of ['geometryRecipe','facialComponents','apparel','accessories','decorativeMarks']){
   // A single explicit drawable node is a lossless one-item list.
   if(spec[field] && !Array.isArray(spec[field]) && typeof spec[field].kind==='string')spec[field]=[spec[field]];
   if(Array.isArray(spec[field]))spec[field]=walk(spec[field]);
 }
 return value;
}
