import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {DATA} from './files.mjs';

// Cache only successfully validated stages. Credentials are never an input.
export function checkpointRunner({root=path.join(DATA,'dynamic-checkpoints'),enabled=true,progress=()=>{},signal}={}){
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return async function stage(label,input,generate){
    signal?.throwIfAborted();
    if(!enabled)return generate();
    const key=hash({version:2,label,input});
    const file=path.join(root,key+'.json');
    try{const saved=JSON.parse(await readFile(file,'utf8'));if(saved.key===key&&Object.hasOwn(saved,'value')&&saved.valueHash===hash(saved.value)){progress('Resuming completed stage: '+label,20);return structuredClone(saved.value);}}catch{}
    const value=await generate();
    signal?.throwIfAborted();
    await mkdir(root,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
    try{await writeFile(temporary,JSON.stringify({key,value,valueHash:hash(value)}));await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
    return value;
  };
}
