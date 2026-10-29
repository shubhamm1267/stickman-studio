import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  planStory,
  reviewAndRepair,
  searchSound,
  cartesiaBytes,
  request,
} from "../server/providers.mjs";
const p = JSON.parse(
  fs.readFileSync(new URL("../examples/dadi-jar.json", import.meta.url)),
);
const creds = {
  gemini: "private-gemini-key",
  freesound: "private-sound-key",
  cartesia: "private-cartesia-key",
};
test("Gemini outline + per-scene JSON compiles through real validation", async () => {
  let outline = {
    ...p,
    comedy: JSON.parse(
      fs.readFileSync(new URL("../examples/mosquito.json", import.meta.url)),
    ).comedy,
    scenes: p.scenes.map((s) => ({
      id: s.id,
      summary: s.summary,
      duration: s.duration,
    })),
  };
  delete outline.version;
  delete outline.format;
  delete outline.language;
  let calls = [];
  const fake = async (url, opt) => {
    calls.push(JSON.parse(opt.body));
    return new Response(
      JSON.stringify({
        outputs: [
          {
            type: "text",
            text: JSON.stringify(
              calls.length === 1
                ? outline
                : calls.length === 2
                  ? p.scenes[0]
                  : {
                      coverage: p.coverage.map((c) => ({
                        ...c,
                        beatIndices: [0, 1, 17, 18, 19, 20],
                      })),
                      issues: [],
                      summary:
                        "All supplied story events have actual animation actions.",
                    },
            ),
          },
        ],
      }),
    );
  };
  let out = await planStory(
    {
      story: p.story,
      duration: 26,
      format: "shorts",
      language: "hi",
      voice: false,
    },
    creds,
    undefined,
    () => {},
    fake,
  );
  assert.equal(out.scenes.length, 1);
  assert.equal(calls.length, 3);
  assert.equal(out.review.method, "gemini");
  assert.equal(out.story, p.story);
  assert.equal(calls[0].generationConfig.responseMimeType, "application/json");
});
test("Freesound token search keeps only CC0 HQ previews", async () => {
  let seen;
  let sound = await searchSound(
    "jar open",
    creds.freesound,
    undefined,
    async (url, opt) => {
      seen = { url: String(url), opt };
      return Response.json({
        results: [
          {
            id: 1,
            license: "https://creativecommons.org/licenses/by-nc/4.0/",
            previews: { "preview-hq-mp3": "bad" },
          },
          {
            id: 2,
            license: "https://creativecommons.org/publicdomain/zero/1.0/",
            previews: {
              "preview-hq-mp3": "https://cdn.freesound.org/previews/1.mp3",
            },
          },
        ],
      });
    },
  );
  assert.equal(sound.id, 2);
  assert.equal(seen.opt.headers.Authorization, "Token " + creds.freesound);
  assert.match(seen.url, /Creative/);
});
test('Freesound shortens a pickup query while retaining its material',async()=>{
 const queries=[];
 const sound=await searchSound('plastic object pickup table','fake',undefined,async url=>{
  const query=new URL(url).searchParams.get('query');queries.push(query);
  return Response.json({results:query==='plastic tap'?[{id:42,license:'https://creativecommons.org/publicdomain/zero/1.0/',previews:{'preview-hq-mp3':'https://example.test/plastic.mp3'}}]:[]});
 });
 assert.equal(sound.id,42);assert.deepEqual(queries,['plastic object pickup table','plastic handling','plastic tap']);
});
test('Freesound recognizes spaced pick up wording for metal and wood',async()=>{
 for(const [query,fallback] of [['metal dumbbell pick up','metal clink'],['wood object pick up','wood tap']]){
  const sound=await searchSound(query,'fake',undefined,async url=>Response.json({results:new URL(url).searchParams.get('query')===fallback?[{id:7,license:'https://creativecommons.org/publicdomain/zero/1.0/',previews:{'preview-hq-mp3':'https://example.test/material.mp3'}}]:[]}));
  assert.equal(sound.id,7);
 }
});
test("Cartesia uses documented bearer/version, per-character voice, WAV", async () => {
  let body, headers;
  await cartesiaBytes(
    "नमस्ते",
    "voice-1",
    creds,
    "hi",
    undefined,
    async (url, opt) => {
      body = JSON.parse(opt.body);
      headers = opt.headers;
      return new Response(new Uint8Array([82, 73, 70, 70]));
    },
  );
  assert.equal(body.voice, "voice-1");
  assert.equal(body.language, "hi");
  assert.equal(body.output_format.container, "wav");
  assert.equal(headers.Authorization, "Bearer " + creds.cartesia);
  assert.equal(headers["Cartesia-Version"], "2026-08-14");
});
test("provider 401 fails clearly without a fake fallback story", async () => {
  await assert.rejects(
    () =>
      searchSound(
        "jar",
        "bad",
        undefined,
        async () => new Response("Invalid key", { status: 401 }),
      ),
    /401/,
  );
});

const review = (issues = []) => ({
  coverage: p.coverage.map((c) => ({
    ...c,
    beatIndices: [0, 1, 17, 18, 19, 20],
  })),
  issues,
  summary: "Verified actions and objects implement the original story.",
});
test("semantic review repairs a flagged scene and reviews it again", async () => {
  let calls = [];
  let out = await reviewAndRepair(
    p,
    creds,
    undefined,
    () => {},
    async (url, opt) => {
      let input = JSON.parse(opt.body).contents[0].parts[0].text;
      calls.push(input);
      let value =
        calls.length === 1
          ? review([
              {
                sceneId: p.scenes[0].id,
                problem: "The setup lacks a readable hold.",
                repair: "Preserve the jar hold action before the struggle.",
              },
            ])
          : calls.length === 2
            ? p.scenes[0]
            : review();
      return Response.json({ output_text: JSON.stringify(value) });
    },
  );
  assert.equal(calls.length, 3);
  assert.match(calls[1], /Repair this scene/);
  assert.equal(out.review.method, "gemini");
});
test("semantic review refuses a dropped story event", async () => {
  await assert.rejects(
    () =>
      reviewAndRepair(
        p,
        creds,
        undefined,
        () => {},
        async () =>
          Response.json({
            output_text: JSON.stringify({
              ...review(),
              coverage: [
                {
                  storyEvent: "Different invented event",
                  sceneId: "kitchen",
                  beatIndices: [0],
                },
              ],
            }),
          }),
      ),
    /dropped story event/,
  );
});
test("unresolved semantic issues stop after the repair budget", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      reviewAndRepair(
        p,
        creds,
        undefined,
        () => {},
        async (url, opt) => {
          calls++;
          let isRepair = JSON.parse(opt.body).contents[0].parts[0].text.startsWith(
            "Repair this scene",
          );
          return Response.json({
            output_text: JSON.stringify(
              isRepair
                ? p.scenes[0]
                : review([
                    {
                      sceneId: "kitchen",
                      problem: "Ending still does not match the story.",
                      repair: "Restore the intended ending.",
                    },
                  ]),
            ),
          });
        },
      ),
    /unresolved problems/,
  );
  assert.equal(calls, 5);
});
test("invalid outline duration is repaired before scene direction", async () => {
  let outline = {
    ...p,
    comedy: JSON.parse(
      fs.readFileSync(new URL("../examples/mosquito.json", import.meta.url)),
    ).comedy,
    scenes: p.scenes.map((s) => ({
      id: s.id,
      summary: s.summary,
      duration: s.duration,
    })),
  };
  delete outline.version;
  delete outline.format;
  delete outline.language;
  let calls = [];
  let bad = structuredClone(outline);
  bad.scenes[0].duration = 60;
  let out = await planStory(
    {
      story: p.story,
      duration: 26,
      format: "shorts",
      language: "hi",
      voice: false,
    },
    creds,
    undefined,
    () => {},
    async (url, opt) => {
      calls.push(JSON.parse(opt.body).contents[0].parts[0].text);
      return Response.json({
        output_text: JSON.stringify(
          calls.length === 1
            ? bad
            : calls.length === 2
              ? outline
              : calls.length === 3
                ? p.scenes[0]
                : review(),
        ),
      });
    },
  );
  assert.equal(calls.length, 4);
  assert.match(calls[1], /previous outline errors/);
  assert.equal(out.review.method, "gemini");
});
test("an event with no beat enters repair rather than receiving a fabricated link", async () => {
  let calls = 0;
  let out = await reviewAndRepair(
    p,
    creds,
    undefined,
    () => {},
    async () => {
      calls++;
      return Response.json({
        output_text: JSON.stringify(
          calls === 1
            ? {
                ...review(),
                coverage: p.coverage.map((c) => ({ ...c, beatIndices: [] })),
                issues: [
                  {
                    sceneId: "kitchen",
                    problem: "The ending needs an actual action.",
                    repair: "Restore Dadi sipping tea.",
                  },
                ],
              }
            : calls === 2
              ? p.scenes[0]
              : review(),
        ),
      });
    },
  );
  assert.equal(calls, 3);
  assert.ok(out.coverage.every((c) => c.beatIndices.length));
});
test('Gemini generated complete story is retained separately from the original short idea',async()=>{
 const {review,...base}=p;const outline={...base,scenes:p.scenes.map(s=>({id:s.id,summary:s.summary,duration:s.duration}))};delete outline.version;delete outline.format;delete outline.language;
 outline.comedy=JSON.parse(fs.readFileSync(new URL("../examples/mosquito.json",import.meta.url))).comedy;
 outline.story='The generated complete comic story has a visible setup, a stubborn pickle jar and the final grandma reversal.';
 const sourceIdea='A strong man cannot open a jar; grandma helps him.';let n=0;
 const fake=async()=>Response.json({outputs:[{type:'text',text:JSON.stringify(++n===1?outline:n===2?p.scenes[0]:{coverage:p.coverage.map(c=>({...c,beatIndices:[0,1,17,18,19,20]})),issues:[],summary:'All stated actions and the ending are represented by concrete beats.'})}]});
 const out=await planStory({story:sourceIdea,duration:26,format:'shorts',language:'hi',voice:false},creds,undefined,()=>{},fake);
 assert.equal(out.sourceIdea,sourceIdea);assert.equal(out.story,outline.story);assert.notEqual(out.story,sourceIdea);
});
test('literal fan queries recover from over-specific generated whirr descriptions',async()=>{
 const queries=[];
 const sound=await searchSound('electric fan whirr','fake',undefined,async url=>{const q=new URL(url).searchParams.get('query');queries.push(q);return Response.json({results:q==='electric fan'?[{id:91,license:'https://creativecommons.org/publicdomain/zero/1.0/',previews:{'preview-hq-mp3':'https://cdn.freesound.org/preview.mp3'}}]:[]});});
 assert.equal(sound.id,91);assert.deepEqual(queries,['electric fan whirr','electric fan']);
});
