import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {findBrowser} from '../server/browser.mjs';
import {validatePlan} from '../shared/schema.mjs';
import {canonicalizePlan} from '../shared/canonical-story-ir.mjs';
import {inspectPlan,planHash} from '../server/inspect.mjs';
import {svgFrame,evaluate} from '../renderer/engine.mjs';
import {localToWorld} from '../shared/math.mjs';

const ink='#28332d',green='#72ad55',darkGreen='#4c813d',purple='#73549b';
const path=(id,d,fill='none',stroke=ink,width=2)=>({id,kind:'path',d,fill,stroke,width});
const ellipse=(id,center,radius,fill,stroke=ink,width=2)=>({id,kind:'ellipse',center,radius,fill,stroke,width});
const group=(id,bone,children,extra={})=>({id,kind:'group',bone,children,...extra});
const hand=(x,y,actorX,scale)=>[(x-actorX)/scale,(y-780)/scale];
const bottle={x:300,y:665,scale:.75,grip:[18,-95]},cap={x:300,y:526.25};
const hulkX=205,kidX=390,kidScale=.65;
const bodyGrip=[313.5,593.75],offer=[300,540];
const hLeft=hand(...bodyGrip,hulkX,1),hCap=hand(cap.x,cap.y,hulkX,1),hOffer=hand(...offer,hulkX,1);
const kBody=hand(...bodyGrip,kidX,kidScale),kCap=hand(cap.x,cap.y,kidX,kidScale),kOffer=hand(...offer,kidX,kidScale);
const leg=(id,bone)=>group(id,bone,[
 path(id+'Skin','M-21 0 Q-27 39 -16 100 L16 100 Q28 40 21 0Z',green),
 path(id+'Shorts','M-29 -6 L29 -6 L27 61 L17 53 L8 64 L-3 56 L-17 64 L-27 55Z',purple),
 path(id+'Seam','M0 5 L0 44','none','#49355f',1.3),
]);
const hulkArt={renderMode:'overlay',geometryRecipe:[],apparel:[leg('hulkLeftShorts','leftThigh'),leg('hulkRightShorts','rightThigh'),
 ...['leftShin','rightShin'].map((bone,i)=>group('hulkCalf'+i,bone,[path('calf'+i,'M-14 0 Q-23 45 -11 100 L11 100 Q22 45 14 0Z',green),path('calfDetail'+i,'M-7 18 Q-15 43 -5 65','none',darkGreen,1.3)])),
 ...['leftFoot','rightFoot'].map((bone,i)=>group('hulkFoot'+i,bone,[ellipse('footShape'+i,[3,-2],[23,10],green),path('toes'+i,'M8 -7 L8 -1 M15 -6 L15 0','none',darkGreen,1.3)])),
],decorativeMarks:[group('hulkPecs','torso',[path('pecs','M-45 -45 Q-25 -25 -3 -33 M3 -33 Q25 -25 45 -45 M0 -34 L0 29 M-23 1 L-4 4 M4 4 L23 1 M-20 22 L-3 25 M3 25 L20 22','none',darkGreen,2)],{rotation:0})]};
const oldArt={renderMode:'overlay',geometryRecipe:[],decorativeMarks:[group('elderDetails','head',[
 path('oldMoustache','M-18 22 Q-4 11 3 21 Q17 12 30 22 Q17 35 3 26 Q-8 36 -18 22Z','#a2a69f'),
 path('ageLines','M-45 12 L-35 17 M-46 20 L-37 24 M35 13 L45 8 M37 23 L47 19 M-25 -76 Q0 -84 24 -77','none','#777b6d',1.2),
]) ]};
const characters=[
 {id:'hulk',name:'Hulk',kind:'man',ageYears:35,rigVersion:2,artStyle:'pencil',faceShape:'square',hairStyle:'sidepart',wardrobe:'shirt',build:'broad',skin:green,outfit:green,hair:'#202b23',headWidth:1.05,headHeight:.98,visualSpec:hulkArt},
 {id:'elder',name:'Watching elderly man',kind:'man',ageYears:73,rigVersion:2,artStyle:'pencil',faceShape:'long',hairStyle:'bald',wardrobe:'shirt',build:'slim',accessory:'glasses',skin:'#e1c6a4',outfit:'#c6b282',hair:'#aeb3a9',headWidth:.9,headHeight:1.04,visualSpec:oldArt},
 {id:'kid',name:'Little boy',kind:'child',ageYears:8,rigVersion:2,artStyle:'toon',faceShape:'round',hairStyle:'tuft',wardrobe:'shirt',build:'slim',skin:'#edc29c',outfit:'#e16c45',hair:'#352a27',headWidth:1.15,headHeight:1.04},
];
const bottleNodes=[
 path('orangeBottle','M-11 -179 L11 -179 L12 -161 Q25 -151 25 -137 L25 -73 Q0 -59 -25 -73 L-25 -137 Q-25 -153 -12 -161Z','#fa8c24'),
 path('bottleHighlight','M-15 -152 Q-20 -143 -19 -131 L-19 -83','none','#ffd897',3),
 path('bottleBaseRibs','M-22 -77 Q0 -69 22 -77 M-22 -84 Q0 -77 22 -84','none','#bd681e',1.2),
 path('fantaWhiteLabel','M-24 -131 Q0 -137 24 -131 L24 -96 Q0 -89 -24 -96Z','#fff8df','#22579b',2),
 ellipse('orangeFruit',[0,-86],[10,8],'#f6a01f','#e57217',1.2),
 path('orangeLeaf','M4 -134 Q19 -149 23 -136 Q15 -130 4 -134Z','#61974b','#3d743c',1.2),
 ellipse('openNeck',[0,-178],[10,3],'#553d20',ink,1),
 path('neckRings','M-11 -173 L11 -173 M-11 -168 L11 -168','none','#d77324',1.4),
];
const propDesigns=[
 {id:'fanta',name:'Fanta orange soda bottle',type:'drawing',color:'#fa8c24',label:'FANTA',nodes:bottleNodes,gripOffset:bottle.grip,interactionAnchors:[{id:'bodyGrip',position:bottle.grip}]},
 {id:'cap',name:'Orange screw cap',type:'drawing',color:'#ee7b23',nodes:[path('capOutline','M-16 -6 Q0 -10 16 -6 L16 5 Q0 10 -16 5Z','#ee7b23'),path('capRibs','M-12 -4 L-12 5 M-6 -5 L-6 6 M0 -5 L0 7 M6 -5 L6 6 M12 -4 L12 5','none','#a9521e',1.3)]},
 {id:'counter',name:'Wooden bottle stand',type:'table',color:'#d3b58c',nodes:[]},
];
const K=(seconds,pose={},emotion,extra={})=>({seconds,pose,...(emotion?{emotion}:{}),...extra});
const beats=[];
function perform(actor,start,end,keys,intent,options={}){
 const keyframes=keys.map(({seconds,...key})=>({at:(seconds-start)/(end-start),...key}));
 beats.push({actorId:actor,kind:'perform',start,duration:end-start,keyframes,intent,...options});return beats.length-1;
}
const hulkRest={leftHand:[-65,-150],rightHand:[65,-150],headAngle:0};
const hold={leftHand:hLeft,rightHand:hCap,muscle:1.1,headAngle:0,wristAngle:0};
const attempt=perform('hulk',0,3,[K(0,hold,'confident'),K(.8,hold,'confident'),K(1.1,{...hold,headAngle:-5},'strain'),K(1.4,{...hold,wristAngle:13,headAngle:4},'strain'),K(1.7,{...hold,wristAngle:-13,headAngle:-4},'strain'),K(2,{...hold,wristAngle:13,headAngle:3},'strain'),K(2.3,{...hold,wristAngle:-12,headAngle:-5},'extreme'),K(2.6,{...hold,wristAngle:8},'extreme'),K(3,hold,'annoyed')],'Hulk grips the closed Fanta bottle and strains; its cap never lifts.',{leftHandShape:'grip',rightHandShape:'grip'});
perform('hulk',3,4.5,[K(3,hold,'annoyed'),K(3.3,{leftHand:[-125,-330],rightHand:[125,-330],muscle:1.3,headAngle:-6},'smug',{leftHandShape:'fist',rightHandShape:'fist'}),K(3.9,{leftHand:[-125,-330],rightHand:[125,-330],muscle:1.3},'smug'),K(4.5,hold,'strain',{leftHandShape:'grip',rightHandShape:'grip'})],'He puts the closed bottle down, flexes his huge arms, and grips it again.');
perform('hulk',4.5,7,[K(4.5,hold,'strain'),K(4.8,{...hold,headAngle:8,wristAngle:15},'extreme'),K(5.1,{...hold,headAngle:-8,wristAngle:-15},'extreme'),K(5.4,{...hold,headAngle:7,wristAngle:15},'extreme'),K(5.7,{...hold,headAngle:-7,wristAngle:-14},'extreme'),K(6,{...hold,headAngle:6,wristAngle:12},'extreme'),K(6.3,{...hold,headAngle:-6,wristAngle:-12},'extreme'),K(7,hold,'defeat')],'A second stronger twisting attempt fails; the screw cap stays seated.',{leftHandShape:'grip',rightHandShape:'grip'});
perform('hulk',7,13.4,[K(7,hold,'defeat'),K(7.5,hulkRest,'defeat',{leftHandShape:'open',rightHandShape:'open'}),K(9,{...hulkRest,headAngle:-8,gaze:[12,5]},'curious'),K(11.2,{...hulkRest,headAngle:-8},'jawdrop'),K(12.4,{...hulkRest,rightHand:hOffer},'shock',{rightHandShape:'grip'}),K(13.4,{...hulkRest,rightHand:hOffer},'shock')],'He makes room for the child, watches the cap lift, and accepts the opened bottle.');
const crouch={hip:[-97.5,-40],spineAngle:30,headAngle:-30,rightHand:[-70,-130],leftHand:[-90,-105],muscle:1.1};
perform('hulk',13.4,14.7,[K(13.4,{hip:[0,-160],spineAngle:0,headAngle:0,rightHand:hOffer,leftHand:[-65,-150]},'curious'),K(14.35,crouch,'curious'),K(14.7,crouch,'curious')],'Hulk squats down to inspect the tiny boy, bringing his cheek into reach.',{constraints:[{kind:'plant',points:['leftFoot','rightFoot'],floorY:780}],rightHandShape:'grip'});
perform('hulk',15.5,20,[K(15.5,crouch,'jawdrop'),K(16.3,{...crouch,headAngle:-27},'shock'),K(17.3,{...crouch,headAngle:-30,eyeOpen:.7},'defeat'),K(20,{...crouch,headAngle:-30,eyeOpen:.7},'defeat')],'He holds the opened Fanta and ends with a stunned, embarrassed stare.');
perform('elder',0,20,[K(0,{gaze:[-10,0],headAngle:-3},'neutral'),K(3.6,{headAngle:6,rightHand:[45,-210]},'smug'),K(7.4,{headAngle:5,rightHand:[90,-235]},'curious',{rightHandShape:'open'}),K(10.8,{headAngle:-4},'shock'),K(13,{headAngle:2,rightHand:[50,-150]},'smug'),K(15.1,{headAngle:-8},'shock'),K(16.2,{headAngle:6,rightHand:[-70,-260]},'laugh',{rightHandShape:'point'}),K(18.7,{headAngle:0,rightHand:[45,-150]},'smug'),K(20,{headAngle:0},'smug')],'The elderly observer watches Hulk fail and chuckles at the little boy succeeding.');
beats.push({actorId:'kid',kind:'walk',start:8,duration:1.5,to:[kidX,780],emotion:'confident',intent:'A clearly small child enters from the right and approaches the bottle.'});
perform('kid',9.5,11.5,[K(9.5,{leftHand:[-50,-150],rightHand:[50,-150],headAngle:0},'confident'),K(10.1,{leftHand:kBody,rightHand:kCap},'calm',{leftHandShape:'grip',rightHandShape:'grip'}),K(10.55,{leftHand:kBody,rightHand:kCap,wristAngle:12},'calm'),K(10.8,{leftHand:kBody,rightHand:hand(300,498,kidX,kidScale),wristAngle:0},'smug'),K(11.2,{leftHand:kBody,rightHand:hand(320,508,kidX,kidScale)},'smug'),K(11.5,{leftHand:kBody,rightHand:hand(330,540,kidX,kidScale)},'smug')],'The child steadies the Fanta, gently twists its cap, and lifts the cap clear of the neck.');
perform('kid',11.5,13.5,[K(11.5,{leftHand:kBody,rightHand:hand(330,540,kidX,kidScale)},'smug'),K(11.9,{leftHand:kBody,rightHand:[50,-150]},'confident',{rightHandShape:'open'}),K(12.6,{leftHand:kOffer,rightHand:[50,-150]},'confident'),K(13.4,{leftHand:kOffer,rightHand:[50,-150]},'smug'),K(13.5,{leftHand:kOffer,rightHand:[50,-150]},'smug')],'The cap drops onto the stand and the child lifts and hands the visibly open bottle to Hulk.',{leftHandShape:'grip'});
perform('kid',13.5,14.7,[K(13.5,{leftHand:kOffer,rightHand:[50,-150]},'smug'),K(14.1,{leftHand:[-50,-150],rightHand:[50,-150],headAngle:-6},'smug',{leftHandShape:'fist'}),K(14.7,{leftHand:[-50,-150],rightHand:[50,-150]},'smug')],'With both hands free, the boy prepares a mischievous cartoon punch.');
beats.push({actorId:'kid',kind:'punch',targetActorId:'hulk',hand:'left',start:14.7,duration:.8,to:[285,543],amount:.6,emotion:'smug',intent:'One harmless cartoon fist contacts Hulk\'s lowered cheek, with a small recoil and no injury.'});
beats.push({actorId:'kid',kind:'laugh',start:15.7,duration:3.3,emotion:'laugh',intent:'The child laughs after opening the bottle and surprising Hulk.'});
perform('kid',19,20,[K(19,{headAngle:0,leftHand:[-50,-150]},'smug'),K(20,{headAngle:0},'smug')],'He holds a pleased grin while Hulk gives the final embarrassed look.');
const bodyOwner=actor=>({actorId:actor,bone:actor==='hulk'?'rightHand':'leftHand',offset:[0,0],propAnchorId:'bodyGrip'});
const scene={id:'fantaGag',duration:20,summary:'Hulk fails twice at a Fanta bottle; a little boy opens it, hands it back, punches the stooping Hulk and laughs while an elderly man watches.',background:'park',backgroundNodes:[],
 cast:[{characterId:'hulk',x:hulkX,y:780,scale:1,facing:1,initialPose:{...hold,shoulderWidth:38},emotion:'confident'},{characterId:'elder',x:470,y:780,scale:.72,facing:-1,initialPose:{headAngle:3},emotion:'neutral'},{characterId:'kid',x:650,y:780,scale:kidScale,facing:-1,initialPose:{handScale:1.5,leftHand:[-50,-150],rightHand:[50,-150]},emotion:'confident'}],
 props:[{designId:'counter',x:300,y:620,scale:.85,layer:'back'},{designId:'fanta',x:bottle.x,y:bottle.y,scale:bottle.scale,layer:'front',attachment:{actorId:'hulk',bone:'leftHand',offset:[0,0],propAnchorId:'bodyGrip'},attachmentEvents:[{at:3,attachment:null,position:[300,665]},{at:4.5,attachment:{actorId:'hulk',bone:'leftHand',offset:[0,0],propAnchorId:'bodyGrip'}},{at:7,attachment:null,position:[300,665]},{at:11.9,attachment:bodyOwner('kid')},{at:13.4,attachment:bodyOwner('hulk')}]},
 {designId:'cap',x:cap.x,y:cap.y,scale:.75,layer:'front',attachment:{actorId:'hulk',bone:'rightHand',offset:[0,0]},attachmentEvents:[{at:3,attachment:null,position:[cap.x,cap.y]},{at:4.5,attachment:{actorId:'hulk',bone:'rightHand',offset:[0,0]}},{at:7,attachment:null,position:[cap.x,cap.y]},{at:10.55,attachment:{actorId:'kid',bone:'rightHand',offset:[0,0]}},{at:11.5,attachment:null,position:[330,540]}]}],
 motions:[{targetId:'cap',start:11.5,duration:.5,to:[265,609],arc:0,angle:20,timing:'gravity',impactOnEnd:false}],beats,dialogue:[],
 shots:[[0,1,[285,540],.92,'full'],[1,3,[300,558],2.5,'hands'],[3,4.5,[205,490],1.1,'full'],[4.5,6.4,[300,558],2.5,'hands'],[6.4,8,[205,390],1.8,'full'],[8,9.8,[300,540],.92,'full'],[9.8,11.7,[330,630],1.45,'full'],[11.7,13.7,[290,590],1.35,'full'],[13.7,14.7,[300,585],1.05,'full'],[14.7,15.6,[290,538],1.75,'full'],[15.6,16.4,[230,530],2,'full'],[16.4,18.7,[310,550],1.1,'full'],[18.7,20,[230,530],1.8,'full']].map(([start,end,focus,zoom,detail])=>({start,end,focus,zoom,detail})),
 sounds:[
 {query:'plastic bottle creak',start:1.25,duration:.65,volume:.17,role:'effect',required:false},
 {query:'plastic bottle creak',start:5,duration:.85,volume:.18,role:'effect',required:false},
 {query:'footsteps',start:8.1,duration:1.25,volume:.12,role:'effect',required:false},
 {query:'bottle cap pop',start:10.7,duration:.3,volume:.24,role:'effect',required:true},
 {query:'soda fizz',start:10.76,duration:.8,volume:.17,role:'effect',required:false},
 {query:'plastic tap',start:11.99,duration:.16,volume:.12,role:'effect',required:false},
 {query:'short whoosh',start:14.91,duration:.16,volume:.16,role:'effect',required:false},
 {query:'cartoon punch impact',start:15.036,duration:.28,volume:.26,role:'effect',required:true},
 {query:'child giggle',start:15.9,duration:2.4,volume:.28,role:'nonverbal',actorId:'kid',required:true},
 ]};
// Shoulder width belongs to cast placement, not the animated Pose schema.
delete scene.cast[0].initialPose.shoulderWidth;scene.cast[0].shoulderWidth=38;
// Show the child's face and arms together with the cap. The resting native
// character's decorative body artwork can obscure the bottle from the side.
for(const shot of scene.shots)if(shot.start===9.8)shot.actorIds=['kid'];
const raw={version:1,seed:1948,provenance:{origin:'authored',sourceSchemaVersion:1,generator:'manual'},title:'Hulk vs Fanta: Tiny Hands, Big Surprise',story:scene.summary,sourceIdea:'Hulk and an elderly man are present. Hulk struggles to open a Fanta bottle. A small boy arrives, opens it effortlessly, hands the open bottle to Hulk, punches Hulk in a harmless cartoon gag, and laughs.',format:'shorts',language:'hi',productionMode:'silent-sfx',category:'family-comedy',renderFps:60,characters,propDesigns,scenes:[scene],coverage:[{sceneId:scene.id,storyEvent:scene.summary,beatIndices:beats.map((_,i)=>i)}],blockedReasons:[],seo:{titles:['Hulk vs Fanta: Tiny Hands, Big Surprise'],description:'An authored nonverbal cartoon sample using the project renderer. A tiny boy succeeds where Hulk fails.',tags:['hulk','fanta','cartoon','comedy'],hashtags:['#Shorts','#Cartoon'],pinnedComment:'Who really has the strongest hands?',thumbnailText:'HULK VS FANTA'}};
let plan=canonicalizePlan(validatePlan(raw)).plan;
plan.review={method:'authored-example',planHash:planHash(plan),summary:'Specifically choreographed sample; detailed native rigs and original bottle/cap artwork. This is not proof of arbitrary-story generation.'};
const dir='deliverables/hulk-fanta-child';await mkdir(dir,{recursive:true});
await writeFile(dir+'/plan.json',JSON.stringify(plan,null,2));
const report=inspectPlan(plan,{requireCoverage:false});await writeFile(dir+'/preflight.json',JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,executablePath:await findBrowser()});
try{const page=await browser.newPage({viewport:{width:540,height:960}});for(const time of [.5,2,3.7,6.8,9.4,10.95,12.7,14.5,15.05,16.8,19.3]){await page.setContent('<body style="margin:0">'+svgFrame(plan,time)+'</body>');await page.screenshot({path:dir+'/frame-'+time+'.png'});}}finally{await browser.close();}
const receipt=[];for(const t of [0,3,4.5,7,10.55,11.9,13.4]){const f=evaluate(plan.scenes[0],t,plan.propDesigns);receipt.push({t,bottle:f.props.fanta.position,cap:f.props.cap.position,owner:f.props.fanta.owner?.actorId});}await writeFile(dir+'/ownership-check.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify({plan:dir+'/plan.json',preflight:report.ok,errors:report.issues.filter(i=>i.severity==='error').slice(0,8)}));
