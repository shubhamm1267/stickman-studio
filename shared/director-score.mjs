import {z} from 'zod';
import {CharacterSchema,PropSchema,BeatSchema,ComedySchema,SeoSchema,SceneSchema,EXPRESSIONS} from './schema.mjs';

export const DIRECTOR_ACTIONS=['approach','walk','run','press','strain','liftAttempt','grab','place','throw','fly','punch','slip','fall','jump','sit','stand','headHold','point','duck','cower','roar','pawPress','react','laugh','cry','scold','wave','dance','sneeze','fart','nosePinch','flex','deflate','open','perform'];
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/);
const slot=z.enum(['left','center','right']);
export const DirectorEventSchema=z.object({
  id,actorId:id.optional(),verb:z.enum(DIRECTOR_ACTIONS),description:z.string().min(8).max(500),duration:z.number().min(.35).max(8),
  targetId:id.optional(),targetActorId:id.optional(),targetPropId:id.optional(),toSlot:slot.optional(),
  propId:id.optional(),characterId:id.optional(),
  destination:z.enum(['face','crown','leftHand','rightHand','floor','table','sky']).optional(),
  land:z.boolean().optional(),arc:z.number().min(0).max(200).optional(),
  holdHead:z.boolean().optional(),
  effort:z.boolean().optional(),
  recover:z.enum(['sit','stand']).optional(),
  gestures:z.array(z.enum(['stand','headHold','nosePinch','point','wave'])).max(5).optional(),
  emotion:z.enum(EXPRESSIONS).optional(),silent:z.boolean().default(false),
  camera:z.enum(['wide','medium','reaction','contact']).default('wide'),
  keyframes:BeatSchema.shape.keyframes.optional(),
}).strict();
export const DirectorScoreSchema=z.object({
  title:z.string().min(3).max(100),story:z.string().min(20).max(15000),comedy:ComedySchema,seo:SeoSchema,
  characters:z.array(CharacterSchema.extend({slot,scale:z.number().min(.55).max(1).default(.85)})).min(1).max(6),
  props:z.array(PropSchema.extend({slot,height:z.enum(['floor','table','chest','sky']).default('table'),scale:z.number().min(.2).max(1.5).default(.8),onId:id.optional()})).max(30),
  scenes:z.array(z.object({id,summary:z.string().min(10).max(1000),background:SceneSchema.shape.background,resetStage:z.boolean().default(false),events:z.array(DirectorEventSchema).min(2).max(60)}).strict()).min(1).max(40),
  blockedReasons:z.array(z.string().min(5).max(400)).max(20),
}).strict();
export const SoundScoreSchema=z.object({cues:z.array(z.object({eventId:id,query:z.string().min(2).max(100),when:z.enum(['start','contact','end']),role:z.enum(['effect','nonverbal']),duration:z.number().min(.1).max(3),volume:z.number().min(.05).max(.5)}).strict()).max(150)}).strict();
