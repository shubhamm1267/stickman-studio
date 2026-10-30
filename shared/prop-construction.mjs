// Original construction examples for native food states. These are drawing
// starting points, not a claim that arbitrary generated artwork is verified.
export const constructionCatalog=Object.freeze([
 {id:'peel',description:'Discarded empty banana skin with attached curling flaps; no fruit inside.'},
 {id:'banana',description:'Whole unpeeled curved banana fruit with closed skin.'},
 {id:'table',description:'Ordinary rectangular wooden table with a solid top and four legs; no special mechanism.'},
]);
export function propConstruction(type){
 const ink='#493d21',yellow='#edc53e',inside='#fff0b0';
 const path=(id,d,fill,width=1.6)=>({id,kind:'path',d,fill,stroke:ink,width});
 const base={renderMode:'replace',silhouetteFamily:'organic',material:'organic',zIndex:0};
 if(type==='table')return {...base,silhouetteFamily:'rectangular',material:'custom',geometryRecipe:[
  path('rearLeftLeg','M-66 -137 L-55 -137 L-55 -16 L-66 -16Z','#9b7950'),
  path('rearRightLeg','M64 -137 L75 -137 L75 -16 L64 -16Z','#9b7950'),
  path('leftLeg','M-89 -125 L-75 -125 L-75 0 L-89 0Z','#b49060'),
  path('rightLeg','M72 -125 L86 -125 L86 0 L72 0Z','#b49060'),
  path('tabletop','M-106 -140 L91 -140 L108 -124 L-90 -124Z','#d1ae78'),
  path('apron','M-90 -124 L108 -124 L108 -115 L-90 -115Z','#a98351'),
  path('woodgrain','M-83 -135 Q-26 -131 56 -135 M-43 -128 Q1 -132 75 -128','none',.8),
 ],normalizedDimensions:{width:100,height:100},motionAnchors:[{id:'grip',position:[0,-124]},{id:'base',position:[0,0]},{id:'support',position:[0,-132]}]};
 if(type==='peel')return {...base,geometryRecipe:[
  path('rear_flap','M -3 -24 C -16 -47 -25 -65 -18 -86 C -13 -94 -5 -91 -5 -82 C -9 -61 7 -45 9 -25 Z',yellow),
  path('rear_inside','M -3 -27 C -10 -50 -20 -66 -17 -83 C -11 -64 1 -46 4 -28 Z',inside,1),
  path('left_flap','M 0 -26 C -16 -16 -24 -1 -43 -5 C -57 -8 -65 -18 -67 -25 C -48 -15 -40 -22 -29 -33 C -17 -45 -8 -44 0 -26 Z',yellow),
  path('left_inside','M -3 -29 C -20 -23 -28 -7 -44 -10 C -53 -12 -61 -20 -64 -23 C -43 -14 -35 -27 -25 -34 C -16 -40 -8 -36 -3 -29 Z',inside,1),
  path('right_flap','M 3 -27 C 20 -35 31 -24 43 -16 C 52 -10 60 -10 69 -17 C 66 -1 53 5 40 -1 C 24 -7 21 -19 5 -20 Z',yellow),
  path('right_inside','M 5 -27 C 22 -30 33 -17 44 -11 C 54 -7 62 -11 66 -14 C 55 -1 43 -6 33 -13 C 23 -20 17 -25 5 -24 Z',inside,1),
  path('front_flap','M -4 -28 C -8 -13 -8 0 3 2 C 18 4 24 -10 27 -18 C 17 -12 12 -14 9 -27 Z',yellow),
  path('front_inside','M -1 -26 C -4 -12 -3 -3 4 -3 C 12 -3 18 -10 21 -13 C 12 -11 8 -17 6 -26 Z',inside,1),
  path('stem','M -4 -33 L -6 -45 Q -1 -49 4 -45 L 6 -33 Z','#8d6b36'),
 ],normalizedDimensions:{width:100,height:100},motionAnchors:[{id:'grip',position:[0,-34]},{id:'base',position:[0,2]}]};
 if(type==='banana')return {...base,geometryRecipe:[
  path('fruit','M -62 -60 C -38 -21 7 -5 59 -39 C 45 -4 14 13 -16 4 C -44 -4 -61 -27 -66 -49 Z',yellow),
  path('ridge','M -60 -49 C -35 -14 11 0 52 -31','none',1),
  path('stem','M -66 -49 L -70 -67 L -62 -70 L -56 -57 Z','#8d6b36'),
  path('tip','M 55 -39 L 62 -44 L 64 -38 L 58 -33 Z','#76582f'),
 ],normalizedDimensions:{width:100,height:100}};
 return null;
}
