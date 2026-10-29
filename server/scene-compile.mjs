// Compiler implementations are selected by stable IDs, not by executing
// generated code. This is the initial extension boundary for scene compilers.
function compileCameraCuts(scene) {
 const s=structuredClone(scene);
 const cuts=[...s.shots].sort((a,b)=>a.start-b.start);
 if(!cuts.length)return s;
 if(cuts.some(q=>q.start<0||q.start>=s.duration))return s;
 // Two conflicting cameras at the same cut need explicit director repair.
 if(cuts.some((q,i)=>i&&q.start===cuts[i-1].start))return s;
 s.shots=cuts.map((q,i)=>({...q,start:i===0?0:q.start,end:cuts[i+1]?.start??s.duration}));
 return s;
}

const compilers = new Map([
 ["camera-cuts/v1", {
  id:"camera-cuts/v1",
  version:1,
  capabilities:["camera.continuous-timeline"],
  compile:compileCameraCuts,
 }],
]);

export function listSceneCompilers() {
 return [...compilers.values()].map(({id,version,capabilities})=>({
  id,version,capabilities:[...capabilities],
 }));
}

// Keep the one-argument call compatible with every existing caller.
export function compileScene(scene, compilerId="camera-cuts/v1") {
 const compiler=compilers.get(compilerId);
 if(!compiler)throw Error(`Unknown scene compiler: ${compilerId}`);
 return compiler.compile(scene);
}
