import test from 'node:test';
import assert from 'node:assert/strict';
import {originalStoryBrief} from '../shared/story-variation.mjs';
import {normalizeDirectedScene} from '../shared/normalize-directed-scene.mjs';

test('new original generations choose varied, reproducible creative directions',()=>{
  const options={story:'',generationId:'fresh-example-01'};
  assert.equal(originalStoryBrief(options),originalStoryBrief(options));
  const briefs=Array.from({length:24},(_,i)=>originalStoryBrief({story:'',generationId:`run-${i}`}));
  assert.ok(new Set(briefs).size===briefs.length);
  assert.ok(new Set(briefs.map(s=>s.match(/Creative starting point: ([^;]+)/)?.[1])).size>=8);
  assert.equal(originalStoryBrief({story:'A detailed user-authored visual story for a hero.'}),'');
});

test('scene normalization preserves native actions and strips ignored generated performance fields',()=>{
  const input={
    scene:{cast:[],sounds:[],beats:[
      {kind:'walk',actorId:'hero',keyframes:[{at:0,pose:{headAngle:0}},{at:1,pose:{headAngle:10}}],constraints:[{kind:'ground',points:['leftFoot'],floorY:780}],contactAt:.5},
      {kind:'react',actorId:'hero',keyframes:[{at:1,pose:{headAngle:20}},{at:0,pose:{headAngle:0}}]},
      {kind:'idle',actorId:'hero',constraints:[{kind:'ground',points:['leftFoot'],floorY:780}]},
    ]},
    partTracks:[{animation:{keys:[{at:0,rotation:0,easing:'easeInOut'},{at:1,rotation:30,easing:'hold'}]}}],
  };
  const result=normalizeDirectedScene(input);
  assert.equal(result.scene.beats[0].kind,'walk');
  assert.equal(result.scene.beats[0].keyframes,undefined);
  assert.equal(result.scene.beats[0].constraints,undefined);
  assert.equal(result.scene.beats[0].contactAt,undefined);
  assert.equal(result.scene.beats[1].kind,'perform');
  assert.deepEqual(result.scene.beats[1].keyframes.map(k=>k.at),[0,1]);
  assert.equal(result.scene.beats[2].kind,'idle');
  assert.equal(result.scene.beats[2].constraints,undefined);
  assert.deepEqual(result.partTracks[0].animation.keys.map(k=>k.easing),['smooth','hold']);
  assert.equal(input.scene.beats[0].keyframes.length,2,'normalizer does not mutate the original');
});