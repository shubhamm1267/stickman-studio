import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validatePlan, OutlineSchema } from "../shared/schema.mjs";
import { evaluate, svgFrame } from "../renderer/engine.mjs";
import { inspectPlan } from "../server/inspect.mjs";
import { actionEvents, expandCues } from "../server/timing.mjs";
import { planStory, reviewAndRepair } from "../server/providers.mjs";
const load = (n) =>
    JSON.parse(
      fs.readFileSync(new URL("../examples/" + n + ".json", import.meta.url)),
    ),
  interview = load("interview-chair"),
  bath = load("toilet-roll");
test("both new stories have linked, visible opening hooks before second3", () => {
  for (const p of [interview, bath]) {
    let r = inspectPlan(p, { requireCoverage: true });
    assert.equal(r.ok, true);
    assert.equal(r.hook.timingPassed, true);
    assert.equal(r.hook.visiblePassed, true);
    assert.equal(r.issues.length, 0);
  }
});
test("adult profile cannot quietly cast a child", () => {
  let p = structuredClone(interview);
  p.characters[0].kind = "child";
  assert.throws(() => validatePlan(p), /adult characters/);
});
test("a missing, late or idle hook does not pass as an opening incident", () => {
  let p = structuredClone(interview);
  delete p.hook;
  assert.equal(inspectPlan(p).ok, false);
  p = structuredClone(interview);
  p.hook.beatIndices = [33];
  assert.equal(inspectPlan(p).hook.timingPassed, false);
  p.scenes[0].beats[33].start = 0.1;
  assert.equal(inspectPlan(p).hook.timingPassed, false);
});
test("an offscreen hook actor fails framing checks", () => {
  let p = structuredClone(interview);
  p.scenes[0].shots[0].focus = [-900, -700];
  assert.equal(inspectPlan(p).hook.visiblePassed, false);
});
test("a hands-only insert cannot replace the readable opening situation", () => {
  let p = structuredClone(interview);
  p.scenes[0].shots[0].detail = "hands";
  assert.equal(inspectPlan(p).hook.visiblePassed, false);
});
test("fart puff exists only after the defined emission and dissipates", () => {
  let p = validatePlan(interview),
    s = p.scenes[0];
  assert.equal(evaluate(s, 0.35, p.propDesigns).effects.length, 0);
  let e = evaluate(s, 0.8, p.propDesigns).effects.find(
    (e) => e.actorId === "hero",
  );
  assert.ok(e && e.phase > 0 && e.phase < 1);
  assert.equal(evaluate(s, 2.9, p.propDesigns).effects.length, 0);
  assert.ok(
    Math.abs(actionEvents(s, s.beats[0], p.propDesigns)[0] - 0.46) < 1e-8,
  );
});
test("pinched hand follows the actual seated nose", () => {
  let p = validatePlan(interview),
    a = evaluate(p.scenes[0], 1.38, p.propDesigns).states.boss;
  assert.ok(
    Math.hypot(
      a.leftHand[0] - (a.head[0] + a.facing * 26),
      a.leftHand[1] - (a.head[1] + 9),
    ) < 1e-6,
  );
});
test("scoot returns the actor to the chair instead of accumulating slide drift", () => {
  let p = validatePlan(interview),
    s = p.scenes[0];
  assert.notEqual(
    evaluate(s, 3.25, p.propDesigns).states.hero.position[0],
    140,
  );
  assert.equal(evaluate(s, 4.3, p.propDesigns).states.hero.position[0], 140);
});
test("paper ribbon ends at the clamped actual gripping wrist", () => {
  let p = validatePlan(bath),
    v = evaluate(p.scenes[0], 7.95, p.propDesigns),
    a = v.states.hero,
    q = v.props.roll,
    h = a[q.tether.hand];
  assert.ok(Math.abs(q.paperEnd[0] - (a.position[0] + h[0] * a.scale)) < 1e-6);
  assert.ok(Math.abs(q.paperEnd[1] - (a.position[1] + h[1] * a.scale)) < 1e-6);
});
test("wrapping is progressive and tear-free releases both wrap and ribbon", () => {
  let p = validatePlan(bath),
    s = p.scenes[0];
  assert.ok(
    evaluate(s, 9, p.propDesigns).states.hero.wrap <
      evaluate(s, 11.5, p.propDesigns).states.hero.wrap,
  );
  let v = evaluate(s, 24.85, p.propDesigns);
  assert.equal(v.states.hero.wrap, 0);
  assert.equal(v.props.roll.tether, null);
  assert.equal(v.props.roll.paper, 0);
  assert.ok(v.effects.some((e) => e.kind === "paperBurst"));
});
test("openDoor uses the correct prop and hand follows the moving handle", () => {
  let p = validatePlan(bath),
    s = p.scenes[0],
    v = evaluate(s, 16.49, p.propDesigns),
    a = v.states.boss,
    q = v.props.door;
  assert.ok(q.open > 0.98);
  let world = a.position[0] + a.leftHand[0] * a.scale,
    handle = q.position[0] + (-65 + 93 * (1 - 0.9 * q.open)) * q.scale;
  assert.ok(Math.abs(world - handle) < 1);
  let bad = structuredClone(p);
  bad.scenes[0].beats[13].targetId = "roll";
  assert.throws(() => validatePlan(bad), /Door action/);
});
test("new contact sounds derive from actions instead of independent timestamps", () => {
  let p = validatePlan(interview),
    s = p.scenes[0],
    c = expandCues(s, p.propDesigns);
  assert.ok(c.find((c) => c.beatIndex === 18).start > 14.5);
  assert.ok(
    Math.abs(c.find((c) => c.beatIndex === 5).start - (3.05 + 1.15 * 0.35)) <
      1e-8,
  );
});
test("all 1800 new frames render finite geometry with no captions or assets", () => {
  for (const source of [interview, bath]) {
    let p = validatePlan(source),
      seconds = p.scenes[0].duration;
    for (let i = 0; i < seconds * 30; i++)
      assert.ok(
        !/NaN|Infinity|undefined|<text|<image|<script/.test(
          svgFrame(p, i / 30),
        ),
      );
  }
});
test("adult Gemini planning includes reusable action guidance and hook review", async () => {
  let p = validatePlan(interview),
    { review, version, format, language, ...outlineInput } = p,
    outline = OutlineSchema.parse({
      ...outlineInput,
      scenes: p.scenes.map((s) => ({
        id: s.id,
        summary: s.summary,
        duration: s.duration,
      })),
    });
  delete outline.hook.beatIndices;
  let calls = [];
  const fake = async (url, opt) => {
    let body = JSON.parse(opt.body);
    calls.push(body.contents[0].parts[0].text);
    let result =
      calls.length === 1
        ? outline
        : calls.length === 2
          ? p.scenes[0]
          : {
              hook: p.hook,
              coverage: p.coverage,
              issues: [],
              summary:
                "Opening incident is visible and every story event maps to actual actions.",
            };
    return Response.json({ output_text: JSON.stringify(result) });
  };
  let out = await planStory(
    {
      story: p.story,
      duration: 28,
      format: "shorts",
      language: "hi",
      voice: false,
      humorProfile: "adult-relatable",
    },
    { gemini: "mock-secret" },
    undefined,
    () => {},
    fake,
  );
  assert.equal(calls.length, 3);
  assert.match(calls[0], /ADULT RELATABLE COMEDY MODE/);
  assert.match(calls[1], /pullPaper/);
  assert.equal(out.review.method, "gemini");
  assert.ok(out.hook.beatIndices.length);
});
test("semantic reviewer cannot silently omit the requested hook", async () => {
  await assert.rejects(
    () =>
      reviewAndRepair(
        interview,
        { gemini: "mock" },
        undefined,
        () => {},
        async () =>
          Response.json({
            output_text: JSON.stringify({
              coverage: interview.coverage,
              issues: [],
              summary: "Everything else matches the story.",
            }),
          }),
      ),
    /link the opening hook/,
  );
});

test('review hashes stay stable after JSON key reordering and repeated schema parsing',async()=>{const {planHash}=await import('../server/inspect.mjs');const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reorder(v[k])])):v;let p=structuredClone(interview),h=planHash(p);assert.equal(planHash(reorder(p)),h);for(let i=0;i<5;i++){p=validatePlan(p);assert.equal(planHash(p),h);}p.scenes[0].beats[0].duration+=.1;assert.notEqual(planHash(p),h);});

test('repeated frames never mutate the input pose or accumulate animation drift',()=>{for(const source of [interview,bath]){let p=validatePlan(source),before=JSON.stringify(p),s=p.scenes[0],a=JSON.stringify(evaluate(s,21.3,p.propDesigns));for(let t=0;t<26;t+=.2)svgFrame(p,t);assert.equal(JSON.stringify(p),before);assert.equal(JSON.stringify(evaluate(s,21.3,p.propDesigns)),a);}});
test('preflight fingerprint matches the untouched input even with seated poses',async()=>{let {planHash}=await import('../server/inspect.mjs');for(const p of [interview,bath])assert.equal(inspectPlan(p).planHash,planHash(p));});
