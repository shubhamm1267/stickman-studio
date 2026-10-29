// Prevent accidentally cloning unrelated cast members. Intentional twins may share identityGroup.
export function assertDistinctCast(characters){
 const seen=new Map();
 for(const c of characters){
  if(['dog','cat','lion'].includes(c.kind))continue;
  const signature=JSON.stringify([c.kind,c.hairStyle||'tuft',c.faceShape||'round',c.build||'average',c.skin,c.outfit,c.hair,c.headWidth??1,c.headHeight??1,c.accessory||'none',c.wardrobe||'default',c.costume||'everyday',c.visualSpec?.renderMode==='replace'?c.visualSpec:null]);
  const previous=seen.get(signature);
  if(previous && !(c.identityGroup && c.identityGroup===previous.identityGroup))throw Error(`Unrelated characters ${previous.id} and ${c.id} repeat the same appearance. Vary the face, hair, body build or outfit; preserve explicitly requested traits.`);
  seen.set(signature,c);
 }
}
