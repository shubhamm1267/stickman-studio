import fs from 'node:fs/promises';
import {validatePlan} from '../shared/schema.mjs';
import {studioStyleOptions} from '../shared/reference-style.mjs';
const read=async n=>JSON.parse(await fs.readFile(new URL('../examples/'+n+'.json',import.meta.url),'utf8'));
const save=async(n,p)=>{delete p.replay;delete p.review;const out=validatePlan(p);await fs.writeFile(new URL('../examples/'+n+'.json',import.meta.url),JSON.stringify(out,null,2));};
const banana=await read('banana-karma-25s');
for(const style of ['silent-slapstick','coloured-cartoon','elastic-meme']){
 const p=structuredClone(banana);p.referenceStyle=style;p.productionMode='silent-sfx';p.renderFps=60;
 const opts=studioStyleOptions({referenceStyle:style});for(const c of p.characters)c.artStyle=opts.artStyle;
 await save('comparison-'+style,p);
}
const p=await read('motion-ir-lantern');p.referenceStyle='elastic-meme';p.productionMode='silent-sfx';p.renderFps=60;p.title='The polite lantern — supported acting';
p.story='An adult waves to a lantern, bows with both feet planted, and looks surprised when it gives no answer.';p.sourceIdea=p.story;
const s=p.scenes[0];s.props[0].x=450;s.props[0].y=590;
const cage=p.propDesigns[0].nodes[0].children;
cage.unshift({kind:'ellipse',center:[0,-64],radius:[15,14],fill:'none',stroke:'#293329',width:4});
cage.push({kind:'path',d:'M-25 -35 L-25 26 M25 -35 L25 26 M-32 28 L32 28 M-25 38 L25 38',fill:'none',stroke:'#293329',width:3});
cage.push({kind:'path',d:'M-8 3 L8 3 L8 27 L-8 27 Z',fill:'#fff4c1',stroke:'#293329',width:2});
s.duration=6;s.summary=p.story;s.shots=[{start:0,end:4.2,focus:[310,560],zoom:1.1,detail:'full'},{start:4.2,end:6,focus:[230,485],zoom:2,detail:'full'}];
s.motionIR.tracks=[{id:'greeting',actorId:'man',start:0,duration:2,keyframes:[{at:0,pose:{rightHand:[60,-130]},emotion:'curious',rightHandShape:'open'},{at:.3,pose:{rightHand:[115,-330]},emotion:'confident'},{at:.45,pose:{rightHand:[145,-325]}},{at:.6,pose:{rightHand:[110,-340]}},{at:.75,pose:{rightHand:[145,-325]}},{at:1,pose:{rightHand:[60,-130]}}],constraints:[{kind:'plant',points:['leftFoot','rightFoot'],floorY:780}]},{id:'bow',actorId:'man',start:2,duration:2.2,keyframes:[{at:0,pose:{spineAngle:0,hip:[0,-160]}},{at:.2,pose:{spineAngle:-5,hip:[-2,-157]}},{at:.48,pose:{spineAngle:50,hip:[-24,-145],headAngle:20,eyeOpen:.3,rightHand:[105,-130],leftHand:[35,-140]},timing:'snappy'},{at:.7,pose:{spineAngle:50,hip:[-24,-145],headAngle:20,eyeOpen:.3}},{at:1,pose:{spineAngle:0,hip:[0,-160],headAngle:0,eyeOpen:1,rightHand:[60,-130],leftHand:[-60,-130]}}],constraints:[{kind:'plant',points:['leftFoot','rightFoot'],floorY:780}]},{id:'reaction',actorId:'man',start:4.2,duration:1.8,keyframes:[{at:0,pose:{headAngle:0,mouthAperture:0}},{at:.22,pose:{headAngle:-12,mouthAperture:1,headScale:[.85,1.18]},emotion:'jawdrop',rightHandShape:'open'},{at:.5,pose:{headAngle:8,mouthAperture:.8,headScale:[1.08,.94]}},{at:1,pose:{headAngle:12,mouthAperture:0,headScale:[1,1]},emotion:'defeat'}],constraints:[]}];
s.beats=s.motionIR.tracks.map(t=>({actorId:'man',kind:'perform',start:t.start,duration:t.duration,motionTrackId:t.id,intent:t.id==='bow'?'Supported hip and spine bow, planted feet.':t.id}));
p.coverage=s.beats.map((b,i)=>({storyEvent:b.intent,sceneId:s.id,beatIndices:[i]}));p.requirements=[];delete p.hook;await save('supported-acting',p);
