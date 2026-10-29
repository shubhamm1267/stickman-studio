import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
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
