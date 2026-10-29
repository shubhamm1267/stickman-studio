import {writeFile} from 'node:fs/promises';
import {validatePlan} from '../shared/schema.mjs';

const ink='#23344b',yellow='#f7b731',blue='#3e8dc5',red='#df5863';
const rect=(id,x,y,w,h,fill)=>({id,kind:'roundedRect',rect:[x,y,w,h],cornerRadius:5,fill,stroke:ink,width:2});
const line=(id,a,b,width=3,stroke=ink)=>({id,kind:'line',from:a,to:b,width,stroke});
const ell=(id,x,y,rx,ry,fill)=>({id,kind:'ellipse',center:[x,y],radius:[rx,ry],fill,stroke:ink,width:2});
const group=(id,children,extra={})=>({id,kind:'group',children,...extra});
const track=(keys,playback='once')=>[{playback,keys}];
const wheel=(id,x,y,r=23)=>group(id,[ell(id+'Tire',0,0,r,r,ink),ell(id+'Rim',0,0,r*.62,r*.62,'#dce4e9'),line(id+'Spoke',[-r*.5,0],[r*.5,0]),line(id+'Spoke2',[0,-r*.5],[0,r*.5])],{position:[x,y],animation:track([{at:0,rotation:0,easing:'linear'},{at:2,rotation:360,easing:'linear'}],'loop')});
const spec=(geometryRecipe)=>({renderMode:'replace',geometryRecipe,normalizedDimensions:{width:100,height:100}});
export function makeVehicle(id,name,kind){
  let body=[];
  if(['cycle','bike'].includes(kind)){
    body=[wheel('rear',-65,0,30),wheel('front',65,0,30),line('frameA',[-65,0],[-15,-45],5,red),line('frameB',[-15,-45],[12,0],5,red),line('frameC',[12,0],[-65,0],5,red),line('frameD',[12,0],[47,-45],5,red),line('fork',[47,-45],[65,0],5),line('seat',[-30,-48],[-5,-48],5),line('handle',[43,-52],[68,-55],4),group('pedal',[line('crank',[-12,0],[12,0],4)],{position:[12,0],animation:track([{at:0,rotation:0,easing:'linear'},{at:1,rotation:360,easing:'linear'}],'loop')})];
    if(kind==='bike')body.push(rect('engine',-25,-29,45,24,ink),rect('tank',-30,-53,60,20,blue),line('exhaust',[-50,-10],[5,-10],7));
  }else if(kind==='tractor')body=[rect('hood',-2,-55,80,45,'#419a61'),rect('cab',-60,-95,60,75,'#419a61'),rect('glass',-51,-88,42,38,'#b9e4ef'),rect('chimney',38,-91,9,40,ink),wheel('rear',-50,0,37),wheel('front',63,7,23)];
  else if(kind==='truck')body=[rect('cargo',-100,-100,130,92,blue),rect('cab',35,-70,65,65,yellow),rect('glass',48,-61,40,30,'#b9e4ef'),wheel('rearA',-73,0),wheel('rearB',-22,0),wheel('front',73,0)];
  else if(kind==='jcb')body=[rect('base',-100,-30,132,35,yellow),rect('cab',-75,-100,66,75,yellow),rect('glass',-66,-90,46,48,'#b9e4ef'),wheel('rear',-75,8,30),wheel('front',11,8,25),group('boom',[rect('arm',0,-9,95,18,yellow),group('stick',[rect('stickMetal',0,-7,65,14,yellow),group('bucket',[{id:'bucketShape',kind:'path',d:'M-8 -8 L35 -8 L45 20 L-8 20 Z',fill:yellow,stroke:ink,width:3}],{position:[65,0],animation:track([{at:0,rotation:20},{at:3,rotation:-20},{at:6,rotation:30},{at:10,rotation:20}])})],{position:[95,0],rotation:45,animation:track([{at:0,rotation:45},{at:3,rotation:80},{at:6,rotation:35},{at:10,rotation:45}])})],{position:[15,-50],rotation:-30,animation:track([{at:0,rotation:-30},{at:3,rotation:-85},{at:6,rotation:-45},{at:10,rotation:-30}])})];
  else {
    const suv=['jeep','thar'].includes(kind);
    body=[rect('body',-100,-42,200,45,kind==='sedan'?blue:kind==='jeep'?'#638d54':'#dca347'),{id:'roof',kind:'path',d:suv?'M-65 -42 L-65 -90 L55 -90 L65 -42 Z':'M-65 -42 L-35 -78 L28 -78 L65 -42 Z',fill:suv?'#313b49':blue,stroke:ink,width:3},rect('window',-30,-72,48,25,'#b9e4ef'),rect('headlight',82,-32,15,12,'#ffe8a8'),wheel('rear',-65,5,25),wheel('front',65,5,25),group('door',[rect('panel',-30,-40,50,38,kind==='sedan'?blue:'#dca347'),line('handle',[2,-29],[12,-29])],{pivot:[-30,-40],animation:track([{at:0,scale:[1,1]},{at:3,scale:[.3,1]},{at:5,scale:[1,1]}])})];
    if(kind==='sedan')body.push(rect('grilleLeft',87,-12,4,14,ink),rect('grilleRight',94,-12,4,14,ink));
    if(suv)body.push(ell('spare',-103,-37,10,23,ink));
  }
  return{id,name,type:'drawing',visualSpec:spec(body)};
}
export function makeAppliance(id,name,kind){
  const nodes=kind==='fridge'?[rect('shell',-43,-100,86,150,'#dce4e9'),rect('inside',-35,-90,70,130,'#91b7c5'),line('shelf',[-34,-25],[34,-25]),rect('food',-25,-65,20,35,'#f29f55'),group('door',[rect('doorPanel',-42,-99,84,148,'#e9f1f5'),line('seam',[-40,-45],[40,-45]),line('grip',[25,-35],[25,-4],5)],{pivot:[-42,0],animation:track([{at:0,scale:[1,1]},{at:2,scale:[.08,1]},{at:5,scale:[.08,1]},{at:7,scale:[1,1]}])})]:kind==='tv'?[rect('case',-85,-55,170,105,ink),group('screen',[rect('screenGlass',-76,-46,152,87,'#467dd0'),ell('sun',25,-20,15,15,'#ffd369'),{id:'hill',kind:'polygon',points:[[-76,41],[-10,-15],[76,41]],fill:'#62b8a3'}],{animation:track([{at:0,opacity:.2},{at:1,opacity:1},{at:7,opacity:1},{at:8,opacity:.2}],'loop')}),line('stand',[0,50],[0,70],8),line('foot',[-35,70],[35,70],6)]:[rect('shell',-100,-40,200,80,'#edf4f7'),rect('vent',-88,4,176,22,ink),group('louver',[rect('slat',-85,9,170,8,'#91b7c5')],{pivot:[0,12],animation:track([{at:0,scale:[1,.2]},{at:2,scale:[1,1]},{at:4,scale:[1,.2]}],'loop')}),...[-50,0,50].map((x,i)=>group('wind'+i,[{id:'flow'+i,kind:'curve',curveType:'quadratic',from:[x,45],to:[x+8,100],control1:[x+30,65],stroke:'#8ac9dc',width:4}],{animation:track([{at:0,opacity:0,position:[0,0]},{at:1,opacity:1,position:[0,12]},{at:2,opacity:0,position:[0,25]}],'loop')}))];
  return{id,name,type:'drawing',visualSpec:spec(nodes)};
}
export function dynamicFixture(){
  const excavator=makeVehicle('excavator','Articulated excavator','jcb'),fridge=makeAppliance('fridge','Refrigerator','fridge');
  // Keep the carried object's door closed in this contact fixture.
  delete fridge.visualSpec.geometryRecipe.find(n=>n.id==='door').animation;
  return validatePlan({version:1,planningMode:'dynamic',renderFps:60,productionMode:'silent-sfx',category:'slapstick',title:'The floating fridge',story:'An adult superhero watches an excavator lift a refrigerator, lower it gently, and reacts in surprise.',sourceIdea:'HAND-AUTHORED engine fixture: articulated machine and carried refrigerator; not a Gemini-generated result.',format:'landscape',language:'en',characters:[{id:'hero',name:'Green powerhouse',kind:'man',ageYears:30,artStyle:'toon',skin:'#61ae68',outfit:'#775096',costume:'superhero',build:'broad',rigVersion:2}],propDesigns:[excavator,fridge],coverage:[{storyEvent:'The excavator lifts and lowers the refrigerator while the hero reacts',sceneId:'lift',beatIndices:[0]}],blockedReasons:[],seo:{titles:['The floating fridge'],description:'An authored technical fixture showing nested joints and carried object continuity.',tags:['animation'],hashtags:[],pinnedComment:'',thumbnailText:'Careful!'},scenes:[{id:'lift',summary:'The excavator lifts the fridge while a green superhero reacts.',duration:10,background:'street',cast:[{characterId:'hero',x:60,y:780,scale:.55,facing:1}],props:[{designId:'excavator',x:260,y:760,scale:1},{designId:'fridge',x:410,y:630,scale:.4,partAttachment:{targetId:'excavator',nodeId:'bucket',start:0,end:8,offset:[18,-28],angle:0}}],beats:[{actorId:'hero',kind:'perform',start:0,duration:10,intent:'Watch the articulated lift with changing eyes and mouth',keyframes:[{at:0,pose:{eyeOpen:1,mouthAperture:0}},{at:.3,pose:{mouthAperture:1,browHeight:[-10,-10],headAngle:12}},{at:.6,pose:{mouthAperture:.3,headAngle:-8}},{at:1,pose:{mouthAperture:0,headAngle:0}}]}],shots:[{start:0,end:10,focus:[270,585],zoom:1}],sounds:[],dialogue:[],motions:[],backgroundNodes:[]}]});
}
if(process.argv[1]?.endsWith('make-dynamic-fixtures.mjs')){
  const plan=dynamicFixture();await writeFile(new URL('../examples/dynamic-excavator-fridge.json',import.meta.url),JSON.stringify(plan,null,2));
  const catalog=[...['sedan','jeep','thar','tractor','truck','cycle','bike','jcb'].map(k=>makeVehicle(k,k,k)),...['fridge','ac','tv'].map(k=>makeAppliance(k,k,k))];
  await writeFile(new URL('../examples/dynamic-design-catalog.json',import.meta.url),JSON.stringify({note:'Authored examples; generic stylized designs, not verified exact brand replicas. Arbitrary new designs come from Gemini geometry.',designs:catalog},null,2));
  console.log('Wrote articulated motion fixture and 11-design catalog.');
}
