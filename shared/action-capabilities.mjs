// A native verb is an executable implementation, not its English meaning.
// Keep the performance planner and generated scene schema on one vocabulary.
export const ACTION_PROP_TYPES=Object.freeze({
 hold:['jar'],struggle:['jar'],tap:['jar'],open:['jar'],
 pullPaper:['paperRoll'],wrap:['paperRoll'],tearFree:['paperRoll'],
 openDoor:['door'],drink:['cup','can','bottle'],
});
export function availableActions(actions,props){
 const types=new Set(props.map(p=>p.type));
 return actions.filter(action=>!ACTION_PROP_TYPES[action]||ACTION_PROP_TYPES[action].some(type=>types.has(type)));
}
export function assertActionTarget(action,propId,props){
 const types=ACTION_PROP_TYPES[action];if(!types)return;
 const target=props.find(p=>p.id===propId);
 if(!target||!types.includes(target.type))throw Error(`Native ${action} requires an actual ${types.join('/')} propId; ${propId||'no target'} is ${target?.type||'unavailable'}. For other anatomy or objects use perform poses, explicit attachments and real part tracks instead of renaming a native action.`);
}
