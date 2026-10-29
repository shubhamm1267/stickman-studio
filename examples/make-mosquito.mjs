import fs from 'node:fs';import {validatePlan} from '../shared/schema.mjs';import {planHash,assertRenderable} from '../server/inspect.mjs';
const b=(kind,start,duration,intent,extra={})=>({actorId:'nandu',kind,start,duration,intent,...extra});
const shot=(start,end,focus,zoom,extra={})=>({start,end,focus,zoom,detail:'full',...extra});
const sound=(fixture,start,duration,volume=.2,sourceStart=0,pan=0)=>({fixture,start,duration,volume,sourceStart,pan,required:true,query:{buzz:'single mosquito buzz',slap:'cartoon slap',sneeze:'male sneeze',boing:'cartoon boing',deflate:'balloon deflate',pop:'cartoon pop',steps:'running footsteps',grunt:'male effort grunt',gulp:'surprised gulp'}[fixture]});
const m=(start,duration,to,arc=0,extra={})=>({targetId:'mosquito',start,duration,to,arc,angle:0,...extra});
let beats=[
 b('react',0,.35,'A buzz interrupts Nandu; he spots the tiny mosquito.',{emotion:'curious'}),
 b('custom',.5,.3,'His eyes track the mosquito.',{pose:{gaze:[10,-1],headAngle:-4}}),
 b('flex',2.1,.7,'He shows off huge muscles to intimidate one tiny bug.',{amount:1.15,emotion:'smug'}),
 b('custom',3.45,.3,'He kisses his own enormous bicep.',{pose:{headAngle:-17},emotion:'kiss'}),
 b('react',4.25,.3,'The mosquito ignores his muscles and lands on his cheek.',{emotion:'annoyed'}),
 b('custom',4.6,.25,'He watches his cheek and prepares to swat.',{pose:{headAngle:0,gaze:[8,5]}}),
 b('swat',5.25,1.1,'He slaps his own right cheek; the mosquito dodges.',{targetId:'cheekR',hand:'right',emotion:'strain'}),
 b('custom',5.96,.16,'His head recoils from his own slap.',{pose:{headAngle:-15,head:[-10,-402]},emotion:'shock'}),
 b('stand',6.6,.25,'Recover after the slap.',{emotion:'defeat'}),
 b('custom',7.05,.3,'Stunned blinking pause after hitting himself.',{pose:{gaze:[-9,-2]},emotion:'jawdrop'}),
 b('react',8.6,.3,'The mosquito lands on his other cheek.',{emotion:'annoyed'}),
 b('swat',9.35,1.05,'He tries the other hand and slaps the other cheek.',{targetId:'cheekL',hand:'left',emotion:'extreme'}),
 b('custom',10.03,.16,'The second self-slap snaps his head the other way.',{pose:{headAngle:15,head:[10,-401]},emotion:'shock'}),
 b('stand',10.75,.3,'Recover again, trying to hide embarrassment.',{emotion:'defeat'}),
 b('custom',11.3,.35,'His eyes follow the insect sitting on his nose.',{pose:{gaze:[2,11]},emotion:'curious'}),
 b('custom',12.2,.45,'He slowly brings both palms close to his nose.',{pose:{leftHand:[-70,-395],rightHand:[83,-395]},emotion:'strain'}),
 b('custom',13.05,.15,'Both palms clap around his nose, but the insect escapes upwards.',{pose:{leftHand:[5,-395],rightHand:[28,-395]},emotion:'shock'}),
 b('custom',13.65,.35,'He opens his hands to discover they are empty.',{pose:{leftHand:[-85,-350],rightHand:[100,-350]},emotion:'jawdrop'}),
 b('react',14.8,.35,'The insect circles back, tickling his nose again.',{emotion:'annoyed'}),
 b('sneeze',16.1,2.1,'He inhales enormously, then sneezes at the insect.',{emotion:'strain'}),
 b('react',18.35,.3,'He thinks the sneeze finally worked.',{emotion:'smug'}),
 b('react',19.4,.25,'The mosquito lands again, completely unharmed.',{emotion:'shock'}),
 b('deflate',20.25,1.25,'His muscles deflate as he realizes he has lost.',{emotion:'defeat'}),
 b('custom',21.7,.2,'One last fearful glance at the tiny opponent.',{pose:{gaze:[9,-5]},emotion:'jawdrop'}),
 b('run',22.3,1.85,'He runs away from one tiny mosquito.',{to:[-260,780],emotion:'shock'}),
];
const mosquitoNodes=[
 {kind:'ellipse',center:[-7,-8],radius:[14,6],fill:'#e3e9d1',width:1.4,motion:'flutter'},
 {kind:'ellipse',center:[8,-10],radius:[14,7],fill:'#e3e9d1',width:1.4,motion:'flutter'},
 {kind:'ellipse',center:[0,8],radius:[6,13],fill:'#a5b293',width:1.8},
 {kind:'line',from:[-4,12],to:[-13,22],width:1.2},{kind:'line',from:[3,12],to:[11,23],width:1.2},
 {kind:'path',d:'M-5 4 L-15 -1 L-13 -8 M5 4 L15 -1 L13 -8',width:1.5},
 {kind:'ellipse',center:[0,-3],radius:[10,10],fill:'#f6f1da',width:1.5},
 {kind:'ellipse',center:[-4,-6],radius:[4,5],fill:'#ffffff',width:1},
 {kind:'ellipse',center:[4,-6],radius:[4,5],fill:'#ffffff',width:1},
 {kind:'ellipse',center:[-3,-6],radius:[1.3,2],fill:'#293329',width:0},
 {kind:'ellipse',center:[5,-6],radius:[1.3,2],fill:'#293329',width:0},
 {kind:'line',from:[6,1],to:[21,5],width:1.5},
 {kind:'path',d:'M-4 4 Q0 8 5 4 M-6 -12 L-10 -18 M5 -12 L9 -18',width:1.2},
];
let p={version:1,format:'shorts',language:'hi',title:'Bodybuilder vs Machhar — Size Does Not Matter',story:'A tiny mosquito interrupts a proud bodybuilder in the park. He flexes to scare it. It lands on his right cheek: he slaps himself, missing the bug. It lands on the left: another self-slap. He tries trapping it with both hands near his nose, but it escapes. A giant sneeze also fails. The mosquito returns untouched; his muscles deflate in defeat and he runs away. The tiny mosquito takes over the close-up, then buzzes back toward the opening position.',comedy:{hook:'A tiny mosquito challenges an enormous bodybuilder.',goal:'Nandu wants the buzzing insect to go away.',escalation:['Showing his muscles has no effect.','Two attempted swats produce two self-slaps.','A careful two-handed trap and a huge sneeze still fail.'],payoff:'The bodybuilder loses his muscles and runs from the smallest opponent.',callback:'The mosquito flies back toward its original position, ready to repeat the prank.'},characters:[{id:'nandu',name:'Nandu',kind:'man',skin:'#f6f1da',outfit:'#a2b6a6',hair:'#655f4d',headWidth:1,headHeight:1}],propDesigns:[{id:'mosquito',name:'A very smug mosquito',type:'drawing',color:'#a5b293',nodes:mosquitoNodes},{id:'cheekR',name:'Right cheek contact marker (invisible)',type:'drawing',color:'#ffffff',nodes:[]},{id:'cheekL',name:'Left cheek contact marker (invisible)',type:'drawing',color:'#ffffff',nodes:[]}],blockedReasons:[],coverage:[{storyEvent:'A mosquito interrupts the bodybuilder; flexing fails to scare it.',sceneId:'park',beatIndices:[0,1,2,3,4]},{storyEvent:'Two swats miss the bug and slap his own cheeks.',sceneId:'park',beatIndices:[6,7,11,12]},{storyEvent:'The two-handed trap and sneeze fail.',sceneId:'park',beatIndices:[15,16,17,19,20,21]},{storyEvent:'His muscles deflate and he runs away; the mosquito wins.',sceneId:'park',beatIndices:[22,23,24]}],seo:{titles:['Bodybuilder vs 1 Machhar 😂 Kaun Jeetega?','इतनी Muscles… एक मच्छर से हार गया!','One Tiny Mosquito. One Very Scared Bodybuilder.'],description:'A bodybuilder brings huge muscles to a tiny mosquito problem. Two self-slaps, one desperate trap and one enormous sneeze later… the smallest opponent is still winning. Original silent visual cartoon comedy: no captions or dialogue needed.',tags:['bodybuilder vs mosquito','machhar comedy','funny cartoon','stickman comedy','silent comedy','animated comedy','Hindi cartoon shorts','visual comedy'],hashtags:['#CartoonComedy','#Funny','#Shorts'],pinnedComment:'Machhar 1 — Muscles 0 😂 Tumhara solution kya hota?',thumbnailText:'1 MACHHAR > MUSCLES'},scenes:[{id:'park',summary:'A proud bodybuilder cannot defeat a tiny mosquito; every attempt backfires until he runs away.',duration:28,background:'park',backgroundNodes:[],cast:[{characterId:'nandu',x:235,y:780,scale:1,facing:1}],props:[{designId:'mosquito',x:390,y:400,scale:.7},{designId:'cheekR',x:263,y:389,scale:1},{designId:'cheekL',x:207,y:389,scale:1}],motions:[m(0,1.1,[300,365],35),m(1.1,1,[350,480],-25),m(3.8,.8,[263,389],35),m(5.83,.25,[345,340],30),m(7.8,.8,[207,389],50),m(9.9,.22,[155,337],30),m(10.65,.8,[263,390],20),m(13.03,.18,[270,300],20),m(14.3,1.2,[265,390],40),m(17.48,.35,[410,320],70),m(18.5,.8,[265,389],40),m(21.6,.7,[315,400],35),m(24.1,.9,[270,440],25,{scale:1.4}),m(26.8,1.2,[390,400],30,{scale:.7})],beats,shots:[shot(0,2.1,[280,405],1.65,{endZoom:1.8}),shot(2.1,4.25,[245,505],1.13,{endZoom:1.18}),shot(4.25,6.5,[257,394],1.95),shot(6.5,8.6,[253,397],1.95,{endZoom:2.08}),shot(8.6,10.65,[225,394],1.95),shot(10.65,14.8,[248,400],1.86,{endZoom:2.05}),shot(14.8,18.3,[275,450],1.45),shot(18.3,20.25,[258,400],1.85),shot(20.25,22.3,[250,510],1.12),shot(22.3,24.2,[175,520],1.02,{endFocus:[110,520]}),shot(24.2,28,[275,440],1.85,{endZoom:2.2})],sounds:[sound('buzz',0,1.9,.12,2,.3),sound('pop',2.1,.2,.12),sound('boing',2.5,.7,.18),sound('buzz',3.85,1.3,.12,5),sound('slap',5.954,.55,.35),sound('boing',6.7,.6,.13),sound('buzz',7.8,1.25,.12,9,-.35),sound('slap',10.022,.55,.35),sound('gulp',11.45,.45,.13),sound('buzz',11.7,1.05,.1,13),sound('slap',13.16,.45,.25),sound('buzz',13.3,.85,.1,17),sound('grunt',16.3,.65,.14),sound('sneeze',16.6,1.7,.32),sound('buzz',18.55,1.2,.12,3),sound('boing',19.46,.55,.12),sound('deflate',20.25,1.6,.27),...Array.from({length:7},(_,i)=>sound('steps',22.45+i*.2,.16,.13)),sound('buzz',24.2,3.8,.13,8)],dialogue:[]}]};
// Use reusable action anchors rather than hand-entered impact timestamps.
p.scenes[0].sounds=p.scenes[0].sounds.filter(c=>c.fixture!=='steps');
for(const cue of p.scenes[0].sounds){cue.trimSilence=false;if(cue.fixture==='slap'){cue.sourceStart=.17;cue.duration=.35;cue.beatIndex=cue.start<8?6:cue.start<12?11:16;if(cue.beatIndex!==16)cue.syncTo='contact';}if(cue.fixture==='sneeze'){cue.beatIndex=19;cue.syncTo='contact';cue.sourceStart=.35;cue.duration=.65;}if(cue.fixture==='deflate'){cue.sourceStart=.8;cue.duration=1.6;}}
p.scenes[0].sounds.push({...sound('steps',22.3,.18,.18,2.15),beatIndex:24,syncTo:'footfalls',trimSilence:false});
p=validatePlan(p);p.review={method:'authored-example',planHash:planHash(p),summary:'Authored offline example. Story events are mapped to actual beats. Geometry preflight passed; review contact sheets and final video. This sample does not call Gemini.'};assertRenderable(p);fs.writeFileSync(new URL('./mosquito.json',import.meta.url),JSON.stringify(p,null,2));console.log('Written 28s mosquito comedy.');
