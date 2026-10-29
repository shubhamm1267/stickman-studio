import fs from 'node:fs/promises';
import {validatePlan} from '../shared/schema.mjs';
const p=JSON.parse(await fs.readFile('examples/supported-acting.json','utf8'));delete p.replay;delete p.review;p.title='Eight-arm greeting';p.story='An original eight-armed creature waves two front tentacles and blinks.';p.sourceIdea='Hand-authored different-anatomy fixture: '+p.story;p.coverage=[{storyEvent:p.story,sceneId:'creatureScene',beatIndices:[0]}];p.propDesigns=[];
const ink='#20251f',skin='#b7c5ae';
const nodes=[];
for(let i=0;i<8;i++){
 const x=(i-3.5)*14,side=i<4?-1:1;
 nodes.push({id:'tentacle'+i,kind:'group',position:[x,-75],pivot:[0,0],children:[{id:'curve'+i,kind:'path',d:`M0 0 Q${side*(30+i*3)} 28 ${side*(40+i*6)} 51 Q${side*(65+i*4)} 78 ${side*(70+i*4)} 48`,fill:'none',stroke:ink,width:15},{id:'inner'+i,kind:'path',d:`M0 0 Q${side*(30+i*3)} 28 ${side*(40+i*6)} 51 Q${side*(65+i*4)} 78 ${side*(70+i*4)} 48`,fill:'none',stroke:skin,width:10}],animation:[{playback:'once',keys:[{at:0,rotation:0},{at:1,rotation:i<2?-30:0},{at:2,rotation:i<2?20:0},{at:3,rotation:i<2?-20:0},{at:4,rotation:0}]}]});
}
nodes.push({id:'mantle',kind:'ellipse',center:[0,-130],radius:[65,70],fill:skin,stroke:ink,width:3});
for(const side of [-1,1])nodes.push({id:side===-1?'eyeL':'eyeR',kind:'group',position:[side*23,-143],children:[{kind:'ellipse',center:[0,0],radius:[22,28],fill:'#ffffff',stroke:ink,width:2},{kind:'ellipse',center:[4,0],radius:[5,10],fill:ink}],animation:[{playback:'once',keys:[{at:0,scale:[1,1]},{at:2.4,scale:[1,1]},{at:2.5,scale:[1,.06]},{at:2.65,scale:[1,1]},{at:5,scale:[1,1]}]}]});
nodes.push({id:'smile',kind:'path',d:'M-24 -106 Q0 -80 24 -106',fill:'none',stroke:ink,width:3});
p.characters=[{id:'creature',name:'Ocho',kind:'man',skin,hair:ink,outfit:skin,artStyle:'classic',visualSpec:{renderMode:'replace',normalizedDimensions:{width:100,height:100},geometryRecipe:nodes}}];
p.scenes=[{id:'creatureScene',summary:p.story,duration:5,background:'custom',backgroundNodes:[],cast:[{characterId:'creature',x:270,y:720,scale:1.2,facing:1,shadow:false}],props:[],motions:[],shots:[{start:0,end:5,focus:[270,560],zoom:1.1,detail:'full'}],beats:[{actorId:'creature',kind:'idle',start:0,duration:5,intent:p.story}],sounds:[],dialogue:[]}];
await fs.writeFile('examples/eight-arm-creature.json',JSON.stringify(validatePlan(p),null,2));
