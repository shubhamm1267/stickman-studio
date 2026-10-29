import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {DATA} from './files.mjs';

// Cache only successfully validated stages. Credentials are never an input.
export function checkpointRunner({root=path.join(DATA,'dynamic-checkpoints'),enabled=true,progress=()=>{}}={}){
  return async function stage(label,input,generate){
    if(!enabled)return generate();
    const key=createHash('sha256').update(JSON.stringify({version:1,label,input})).digest('hex');
    const file=path.join(root,key+'.json');
    try{const saved=JSON.parse(await readFile(file,'utf8'));if(saved.key===key&&saved.value){progress('Resuming completed stage: '+label,20);return structuredClone(saved.value);}}catch{}
    const value=await generate();
    await mkdir(root,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
    try{await writeFile(temporary,JSON.stringify({key,value}));await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
    return value;
  };
}
