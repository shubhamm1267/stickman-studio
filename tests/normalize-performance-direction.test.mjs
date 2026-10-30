import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePerformanceDirection} from '../shared/normalize-performance-direction.mjs';

test('short ending hold and small sound overrun fit without changing action clocks or input',()=>{
 const input={events:[{eventIndex:0,start:2,contact:3.8,end:4}],shots:[{start:0,end:2},{start:2,end:3.7}],sounds:[{eventIndex:0,phase:'contact',duration:.3}]};
 const before=structuredClone(input),result=normalizePerformanceDirection(input,4);
 assert.equal(result.shots[1].end,4);assert.ok(Math.abs(result.sounds[0].duration-.2)<1e-9);
 assert.deepEqual(result.events,input.events);assert.deepEqual(input,before);
});

test('large gaps, internal missing shots, missing clocks and destructive sound crops remain validation errors',()=>{
 for(const shots of [[{start:0,end:2}],[{start:0,end:1},{start:2,end:3.8}],[{start:.2,end:3.8}]]){
  const result=normalizePerformanceDirection({shots},4);assert.deepEqual(result.shots,shots);
 }
 const sounds=[{eventIndex:0,phase:'contact',duration:1},{eventIndex:0,phase:'release',duration:.2}];
 assert.deepEqual(normalizePerformanceDirection({events:[{eventIndex:0,contact:3.9}],sounds},4).sounds,sounds);
});
