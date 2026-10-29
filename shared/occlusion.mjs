// A reach needs foreground limbs before attachment ownership changes.
export function foregroundLimbs(scene,time,states,props,actorId){
 const reaches=scene.beats.filter(b=>b.actorId===actorId&&['pick','place','drink','hold'].includes(b.kind)&&time>=b.start&&time<=b.start+b.duration).map(b=>b.hand==='left'?'leftHand':'rightHand');
 const held=Object.values(props).filter(p=>p.owner?.actorId===actorId&&p.owner.hand!=='head').map(p=>p.owner.hand);
 const s=states[actorId],crossing=held.filter(h=>s[h][1]<s.head[1]+100);
 // A raised bare hand needs its connected arm above the face as well.
 // Otherwise the large cartoon head masks the entire upper arm and forearm.
 const raised=['leftHand','rightHand'].filter(h=>s[h][1]<s.head[1]+85);
 return {hands:[...new Set([...held,...reaches,...raised])],forearms:[...new Set([...reaches,...crossing,...raised])]};
}
