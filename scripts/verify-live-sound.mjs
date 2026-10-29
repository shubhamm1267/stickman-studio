import 'dotenv/config';
import fs from 'node:fs/promises';
import {validatePlan} from '../shared/schema.mjs';
import {buildAudio} from '../server/media.mjs';
import {redact} from '../server/files.mjs';
const dir='deliverables/live-sound';await fs.mkdir(dir,{recursive:true});
try{const input=JSON.parse(await fs.readFile('examples/supported-acting.json','utf8'));delete input.replay;delete input.review;input.scenes[0].sounds=[{query:'short whoosh',start:.5,duration:.3,volume:.25,role:'effect',required:true}];const plan=validatePlan(input);await fs.writeFile(dir+'/plan.json',JSON.stringify(plan,null,2));const result=await buildAudio(plan,dir,{freesound:process.env.FREESOUND_API_KEY},AbortSignal.timeout(90000),{bundled:false});await fs.writeFile(dir+'/live-sound-report.json',JSON.stringify({passed:true,method:'live CC0 Freesound search, preview download, decode, trim and mix',credits:result.credits},null,2));}
catch(e){await fs.writeFile(dir+'/live-sound-report.json',JSON.stringify({passed:false,error:redact(e.message,{freesound:process.env.FREESOUND_API_KEY})},null,2));process.exitCode=1;}
