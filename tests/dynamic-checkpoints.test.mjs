import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkpointRunner} from '../server/dynamic-checkpoints.mjs';
test('resume reuses only successful matching stages and invalidates changed inputs',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dynamic-resume-'));
 try{const run=checkpointRunner({root});let calls=0;
 const generate=async()=>({asset:++calls});
 assert.deepEqual(await run('design',{story:'fan'},generate),{asset:1});
 assert.deepEqual(await run('design',{story:'fan'},generate),{asset:1});
 assert.deepEqual(await run('design',{story:'car'},generate),{asset:2});
 await assert.rejects(run('scene',{},async()=>{throw Error('invalid geometry');}));
 assert.deepEqual(await run('scene',{},generate),{asset:3});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a cancelled generation is never saved as a successful stage',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dynamic-cancel-')),controller=new AbortController();
 try{
  const run=checkpointRunner({root,signal:controller.signal});
  await assert.rejects(run('scene',{},async()=>{controller.abort();return{valid:true};}),/abort/i);
  assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a parseable but corrupted checkpoint is regenerated instead of resumed',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'dynamic-corrupt-'));let calls=0;
 try{
  const run=checkpointRunner({root}),generate=async()=>({geometry:++calls});
  await run('design',{model:'lite'},generate);
  const file=path.join(root,(await readdir(root))[0]),saved=JSON.parse(await readFile(file,'utf8'));saved.value.geometry=999;
  await writeFile(file,JSON.stringify(saved));
  assert.deepEqual(await run('design',{model:'lite'},generate),{geometry:2});
 }finally{await rm(root,{recursive:true,force:true});}
});
