import{validatePlan}from'../shared/schema.mjs';import{planHash}from'./inspect.mjs';
export function withExportFps(input,fps){
 if(![60,120].includes(fps))throw Error('Choose 60 or 120 fps.');
 const p=validatePlan(input),current=p.review?.planHash===planHash(p);p.renderFps=fps;
 // Rebind only an already current review and only after changing the frame rate.
 // Edited story/action data cannot acquire a review through this endpoint.
 if(current)p.review.planHash=planHash(p);
 return validatePlan(p);
}
