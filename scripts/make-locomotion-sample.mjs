import {writeFile} from 'node:fs/promises';
import {dynamicFixture} from './make-dynamic-fixtures.mjs';
import {validatePlan} from '../shared/schema.mjs';
import {SEGMENT_BONES} from '../shared/rig.mjs';
const p=dynamicFixture();
p.story=p.sourceIdea='A woman walks toward her friend, waves, then jogs back. Her friend waves back.';
p.seo.thumbnailText='';
p.seo.titles=['Human movement and joint skinning'];p.seo.description='Authored engine regression preview, not an AI-generated story.';
p.characters=[{...p.characters[0],id:'woman',name:'Maya',kind:'woman',costume:'everyday',build:'average',skin:'#dca37e',outfit:'#386fa4',hair:'#302825',hairStyle:'ponytail',wardrobe:'shirt',artStyle:'toon',headWidth:.8,headHeight:.85},{...p.characters[0],id:'man',name:'Aman',kind:'man',costume:'everyday',skin:'#bd805e',outfit:'#d87b41',hair:'#302825',hairStyle:'curly',wardrobe:'shirt',artStyle:'toon',headWidth:.85,headHeight:.9}];
for(const c of p.characters){c.shoulderWidth=28;c.visualSpec={renderMode:'overlay',geometryRecipe:SEGMENT_BONES.map(bone=>({id:bone,kind:'group',bone,children:[{kind:'line',from:[0,0],to:[0,100],width:bone.includes('Arm')?16:bone.includes('Forearm')?11:14,stroke:/Arm/.test(bone)?c.outfit:/Forearm/.test(bone)?c.skin:'#394153'}]}))};}
p.propDesigns=[];
p.coverage=[{sceneId:'movement',storyEvent:p.story,beatIndices:[0,1,2,3]}];
p.scenes=[{...p.scenes[0],id:'movement',summary:p.story,props:[],cast:[{characterId:'woman',x:100,y:780,scale:.6,facing:1},{characterId:'man',x:410,y:780,scale:.6,facing:-1}],beats:[{actorId:'woman',kind:'walk',start:0,duration:3,to:[275,780]},{actorId:'woman',kind:'perform',start:3,duration:2,keyframes:[{at:0,pose:{rightHand:[60,-130]}},{at:.25,pose:{rightHand:[95,-390],wristAngle:15}},{at:.5,pose:{rightHand:[135,-370],wristAngle:-15}},{at:.75,pose:{rightHand:[95,-390],wristAngle:15}},{at:1,pose:{rightHand:[60,-130]}}],emotion:'confident',rightHandShape:'open'},{actorId:'woman',kind:'run',start:5,duration:3,to:[100,780]},{actorId:'man',kind:'perform',start:3.5,duration:2.5,keyframes:[{at:0,pose:{leftHand:[-60,-130]}},{at:.25,pose:{leftHand:[-95,-390]}},{at:.5,pose:{leftHand:[-135,-370]}},{at:.75,pose:{leftHand:[-95,-390]}},{at:1,pose:{leftHand:[-60,-130]}}],emotion:'confident',leftHandShape:'open'}],sounds:[],dialogue:[]}];
for(const beat of p.scenes[0].beats)beat.intent=beat.kind==='walk'?'Walk toward her friend':beat.kind==='run'?'Jog back to starting position':'Wave hello with an open hand';
await writeFile(new URL('../examples/human-movement-preview.json',import.meta.url),JSON.stringify(validatePlan(p),null,2));
