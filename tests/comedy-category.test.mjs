import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {validatePlan} from "../shared/schema.mjs";

const fixture=JSON.parse(fs.readFileSync(new URL("../examples/interview-chair.json",import.meta.url)));
function adultPlan(){
  const p=structuredClone(fixture);
  p.category="adult-comedy";
  p.adultModeAcknowledged=true;
  p.comedySettings={innuendo:"cheeky",profanity:"mild",physicalIntensity:"medium"};
  p.story="Two clearly adult coworkers go on an awkward consensual coffee date and laugh.";
  p.sourceIdea=p.story;
  p.characters=p.characters.map((c,i)=>({...c,kind:i?"woman":"man",ageYears:i?31:34}));
  return p;
}

test("adult category requires saved opt-in acknowledgement and explicit adult ages",()=>{
  const p=adultPlan();
  assert.equal(validatePlan(p).category,"adult-comedy");
  const noAck=structuredClone(p);delete noAck.adultModeAcknowledged;
  assert.throws(()=>validatePlan(noAck),/adultModeAcknowledged/);
  const unknownAge=structuredClone(p);delete unknownAge.characters[0].ageYears;
  assert.throws(()=>validatePlan(unknownAge),/ageYears 18 or older/);
  const under18=structuredClone(p);under18.characters[1].ageYears=17;
  assert.throws(()=>validatePlan(under18),/ageYears 18 or older/);
});

test("adult category rejects minor context, coercion, and graphic sexual detail",()=>{
  for(const [field,text,pattern] of [
    ["story","Two adults tease each other near a schoolboy.",/school-age|minor/],
    ["sourceIdea","Two adults are on a date with a non-consensual kiss.",/consensual/],
    ["dialogue","explicit sexual anatomy",/non-graphic/],
  ]){
    const p=adultPlan();
    if(field==="dialogue")p.scenes[0].dialogue=[{actorId:p.characters[0].id,start:1,text}];
    else p[field]=text;
    assert.throws(()=>validatePlan(p),pattern);
  }
});

test("family category forces adult settings off and keeps existing plan structure",()=>{
  const p=structuredClone(fixture);
  p.category="family-comedy";
  p.comedySettings={innuendo:"cheeky",profanity:"mild",physicalIntensity:"high"};
  const checked=validatePlan(p);
  assert.deepEqual(checked.comedySettings,{innuendo:"off",profanity:"off",physicalIntensity:"high"});
  assert.equal(checked.scenes.length,p.scenes.length);
});

test("romantic category requires adult ages even without adult-comedy opt-in",()=>{
  const p=adultPlan();p.category="romantic-comedy";delete p.adultModeAcknowledged;
  assert.equal(validatePlan(p).category,"romantic-comedy");
  delete p.characters[0].ageYears;
  assert.throws(()=>validatePlan(p),/ageYears 18 or older/);
  const unsafe=adultPlan();unsafe.category="romantic-comedy";delete unsafe.adultModeAcknowledged;
  unsafe.story="An adult attempts a non-consensual kiss.";
  assert.throws(()=>validatePlan(unsafe),/must be consensual/);
});