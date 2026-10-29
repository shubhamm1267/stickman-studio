import {readFile,writeFile} from 'node:fs/promises';
import {validatePlan} from '../shared/schema.mjs';
import {migrateMotionIR} from '../shared/motion-ir.mjs';
const p=JSON.parse(await readFile(new URL('../examples/simple-slap.json',import.meta.url),'utf8'));
delete p.review;delete p.hook;delete p.humorProfile;
p.title='A very polite lantern';p.story='An adult politely bows to a turquoise hexagonal lantern, waits for an answer, then tilts his head in bewilderment.';
p.sourceIdea='HAND-AUTHORED RUNTIME FIXTURE: '+p.story;
p.renderFps=60;p.productionMode='silent-sfx';
p.characters=p.characters.filter(c=>c.id==='man');
p.propDesigns=[{id:'lantern',name:'Turquoise hexagonal lantern',type:'drawing',color:'#27a9a2',nodes:[{kind:'group',position:[0,0],pivot:[0,0],rotation:6,scale:[1.05,.95],opacity:.9,children:[{kind:'path',d:'M-38 -30 L0 -52 L38 -30 L38 25 L0 47 L-38 25 Z',fill:'#27a9a2',stroke:'#293329',width:3},{kind:'group',position:[0,-3],pivot:[0,0],children:[{kind:'ellipse',center:[0,0],radius:[17,24],fill:'#ffe587',stroke:'#293329',width:2}]}]}]}];
const scene={id:'lanternScene',summary:p.story,duration:4,background:'room',backgroundNodes:[],cast:[{characterId:'man',rigVersion:2,x:220,y:780,scale:.8,facing:1,emotion:'curious'}],props:[{designId:'lantern',x:365,y:560,scale:.8,angle:0,open:0}],motions:[],shots:[{start:0,end:4,focus:[270,550],zoom:1.3,detail:'full'}],sounds:[],dialogue:[],beats:[
 {actorId:'man',kind:'perform',start:0,duration:2,intent:'Politely bow toward the unusual lantern, then wait.',keyframes:[{at:0,pose:{bodyAngle:0,headAngle:0,gaze:[7,0],rightHand:[60,-130]}},{at:.35,pose:{bodyAngle:10,headAngle:18,gaze:[10,4],rightHand:[90,-255]}},{at:.65,pose:{bodyAngle:10,headAngle:18,rightHand:[90,-255]}},{at:1,pose:{bodyAngle:0,headAngle:0,rightHand:[60,-130]}}],constraints:[{kind:'ground',points:['leftFoot','rightFoot'],floorY:780}]},
 {actorId:'man',kind:'perform',start:2,duration:2,intent:'Look at the silent lantern, squint, and tilt the head.',keyframes:[{at:0,pose:{headAngle:0,eyeOpen:1,gaze:[10,0]}},{at:.4,pose:{headAngle:-15,eyeOpen:.35,gaze:[11,-2]}},{at:.7,pose:{headAngle:-15,eyeOpen:.35}},{at:1,pose:{headAngle:5,eyeOpen:1,gaze:[10,0]}}]},
]};
p.scenes=[scene];p.coverage=scene.beats.map((b,i)=>({storyEvent:b.intent,sceneId:scene.id,beatIndices:[i]}));
p.comedy={hook:'A man treats an ordinary lantern as a guest.',goal:'Get a greeting from the lantern.',escalation:['He bows and waits.','The lantern remains silent.'],payoff:'He squints at his silent guest.',callback:'The lantern never changes.'};
const plan=validatePlan(migrateMotionIR(p,{seed:18473}));
await writeFile(new URL('../examples/motion-ir-lantern.json',import.meta.url),JSON.stringify(plan,null,2));
console.log('Hand-authored novel geometry + motion data fixture written; no new renderer action or prop branch.');
