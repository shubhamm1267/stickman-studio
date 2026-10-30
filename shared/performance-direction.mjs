import {z} from 'zod';
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);
const time=z.number().finite().min(0).max(60);
const emotion=z.enum(['neutral','confident','smug','strain','extreme','annoyed','idea','kiss','shock','jawdrop','defeat','calm','curious','laugh','cry','talk']);
export const PerformanceDirectionSchema=z.object({
 sceneId:id,
 transition:z.object({kind:z.enum(['continuous','time-jump','new-location']),reason:z.string().min(5)}).strict(),
 rigs:z.array(z.object({actorId:id,mode:z.enum(['native-humanoid','native-animal','custom-parts']),partIds:z.array(id).max(30),controls:z.array(z.string().min(2)).max(30)}).strict()).max(6),
 events:z.array(z.object({
  eventIndex:z.number().int().min(0).max(99),actorId:id,propId:id.optional(),
  action:z.string().min(2).max(40),start:time,end:time,
  anticipation:time,contact:time.optional(),release:time.optional(),settle:time,
  footSupport:z.enum(['left','right','both','airborne','none']),
  result:z.enum(['pose','grip','release','head-support','impact','part-motion']),
 }).strict()).min(1).max(80),
 acting:z.array(z.object({
  actorId:id,start:time,end:time,lookAtId:id.optional(),
  gazeDirection:z.tuple([z.number().min(-1).max(1),z.number().min(-1).max(1)]).optional(),
  gazeAt:time.optional(),
  anticipationEmotion:emotion,reactionEmotion:emotion,
  reactionAt:time,intensity:z.number().min(0).max(1),
  settleAt:time.optional(),settleEmotion:emotion.optional(),
 }).strict()).max(40),
 shots:z.array(z.object({start:time,end:time,intent:z.enum(['establishing','contact','reaction','payoff']),framing:z.enum(['full-body','medium','close-up']).optional(),actorIds:z.array(id).min(1).max(6)}).strict()).min(1).max(30),
 sounds:z.array(z.object({eventIndex:z.number().int().min(0).max(99),phase:z.enum(['anticipation','contact','release','settle']),query:z.string().min(2).max(100),duration:z.number().min(.1).max(4),volume:z.number().min(.01).max(.7)}).strict()).max(30),
}).strict();

export const ObjectBehaviorSchema=z.object({
 partId:id,operation:z.enum(['rotate','open','slide','press','grip','support']),
 rotationLimits:z.tuple([z.number().min(-36000).max(36000),z.number().min(-36000).max(36000)]).optional(),
 anchorId:z.enum(['grip','base','support']).optional(),
}).strict();
