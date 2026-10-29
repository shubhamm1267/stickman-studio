import fs from 'node:fs/promises';
import {evaluate} from '../renderer/engine.mjs';
import {localToWorld,ik} from '../shared/math.mjs';
const p=JSON.parse(await fs.readFile('examples/supported-acting.json','utf8')),scene=p.scenes[0],baseline=evaluate(scene,2,p.propDesigns).states.man;
const anchors=Object.fromEntries(['leftFoot','rightFoot'].map(k=>[k,localToWorld(baseline,baseline[k])]));let maxDrift=0,maxIKError=0,maxFloorError=0;
for(let i=120;i<=252;i++){
 const s=evaluate(scene,i/60,p.propDesigns).states.man;
 for(const k of ['leftFoot','rightFoot']){const v=localToWorld(s,s[k]);maxDrift=Math.max(maxDrift,Math.hypot(v[0]-anchors[k][0],v[1]-anchors[k][1]));maxFloorError=Math.max(maxFloorError,Math.abs(v[1]-780));maxIKError=Math.max(maxIKError,ik(s.hip,s[k],86,86,k==='leftFoot'?1:-1).error*s.scale);}
}
const report={fixture:'examples/supported-acting.json',timeRangeSeconds:[2,4.2],sampleFps:60,coordinateSpace:'stage-y-down world units; portrait stage 540 x 960 mapped to 1080 x 1920 export',actorScale:.8,exportPixelsPerStageUnit:2,toleranceStageUnits:1e-6,maxAnchorDrift:maxDrift,maxFloorError,maxIKEndpointError:maxIKError,passed:Math.max(maxDrift,maxFloorError,maxIKError)<1e-6,limits:'Measures this designated bow only. Not evidence for all generated actions, contact loads or arbitrary balance.'};await fs.mkdir('deliverables/verification',{recursive:true});await fs.writeFile('deliverables/verification/contact-diagnostics.json',JSON.stringify(report,null,2));console.log(report);
