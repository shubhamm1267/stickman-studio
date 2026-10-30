import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobQueue } from "../server/queue.mjs";
import { createApp } from "../server/index.mjs";
delete process.env.STUDIO_TOKEN;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settled(q,id){const deadline=Date.now()+10000;while(Date.now()<deadline){if(!['queued','running'].includes(q.public(id)?.status)&&!q.busy){await q.writes.get(id);return;}await wait(25);}throw Error('Job did not settle before timeout');}

test('render retry retains the job workspace, uses current keys and rejects a completed job',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sl-resume-')),q=new JobQueue(root);await q.init();
 try{
  const original=await q.add('render',async()=>{throw Error('temporary sound failure');},{},{quality:'full'});await settled(q,original.id);
  const resumed=await q.retryRender(original.id,async(job,dir)=>{assert.equal(dir,path.join(root,original.id));assert.equal(job.keys.gemini,'current-private-key');return{resumed:true};},{gemini:'current-private-key'},{quality:'draft'});
  assert.equal(resumed.id,original.id);await settled(q,original.id);
  assert.equal(q.public(original.id).status,'completed');assert.equal(q.public(original.id).attempts,2);
  assert.equal(q.public(original.id).request.quality,'draft');assert.equal(q.public(original.id).result.resumed,true);
  assert.ok(!(await readFile(path.join(root,original.id,'job.json'),'utf8')).includes('current-private-key'));
  await assert.rejects(q.retryRender(original.id,async()=>({})),/unsuccessful render/);
 }finally{await q.close();await rm(root,{recursive:true,force:true});}
});
test("queue cancels work, redacts keys and persists jobs across restart", async () => {
  let root = await mkdtemp(path.join(os.tmpdir(), "sl-queue-")),
    q = new JobQueue(root);
  await q.init();
  let j = await q.add(
    "test",
    async (job, dir, signal, update) => {
      update("starting", 3);
      await wait(20);
      throw Error("bad private-secret-key");
    },
    { gemini: "private-secret-key" },
  );
  await settled(q,j.id);
  assert.equal(q.public(j.id).status, "failed");
  let raw = await readFile(path.join(root, j.id, "job.json"), "utf8");
  assert.ok(!raw.includes("private-secret-key"));
  let q2 = new JobQueue(root);
  await q2.init();
  assert.equal(q2.public(j.id).status, "failed");
  let k = await q2.add("test", async (job, dir, signal) => {
    await wait(30);
    signal.throwIfAborted();
    return {};
  });
  await q2.cancel(k.id);
  await settled(q2,k.id);
  assert.equal(q2.public(k.id).status, "cancelled");
  await rm(root, { recursive: true, force: true });
});
test("HTTP plan pipeline, validation, untrusted origins and file traversal checks", async () => {
  let root = await mkdtemp(path.join(os.tmpdir(), "sl-api-")),
    q = new JobQueue(root);
  let { app } = await createApp({
    queue: q,
    planner: async () => JSON.parse(await readFile(new URL("../examples/simple-slap.json", import.meta.url), "utf8")),
  });
  let server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  let url = "http://127.0.0.1:" + server.address().port;
  try {
    let r = await fetch(url + "/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        options: {
          story: "A funny complete story",
          duration: 26,
          format: "shorts",
          language: "hi",
          voice: false,
        },
        credentials: { gemini: "secret-test-key" },
      }),
    });
    assert.equal(r.status, 202);
    let j = await r.json();
    await settled(q,j.id);
    const completed=(await(await fetch(url + "/api/jobs/" + j.id)).json());
    assert.equal(completed.status,"completed");
    assert.match(completed.request.options.generationId,/^[0-9a-f-]{36}$/);
    assert.match(completed.result.plan.storyId,/^story_/);
    // Separate Generate clicks must not share an old creative checkpoint key.
    const fresh=await fetch(url + "/api/plan",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({options:{story:"",duration:20,durationMode:"auto",format:"shorts"},credentials:{gemini:"secret-test-key"}}),
    });
    assert.equal(fresh.status,202);
    const next=await fresh.json();
    assert.notEqual(next.request.options.generationId,completed.request.options.generationId);
    await settled(q,next.id);
    const savedIR=JSON.parse(await readFile(path.join(root,j.id,"story-ir.json"),"utf8"));
    assert.equal(savedIR.schemaVersion,2);
    let demo = await (await fetch(url + "/api/example")).json();
    r = await fetch(url + "/api/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: demo }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
    const motionExample=await(await fetch(url+"/api/example?name=motion-ir")).json();
    r = await fetch(url + "/api/preview", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({plan:motionExample,time:.7}),
    });
    assert.equal(r.status,200);
    assert.match(r.headers.get("content-type"),/image\/svg\+xml/);
    const preview=await r.text();
    assert.match(preview,/data-scene-group="true"/);
    assert.match(preview,/#27a9a2/);
    r = await fetch(url + "/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 400);
    r = await fetch(url + "/api/jobs", {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(r.status, 403);
    r = await fetch(url + "/api/files/not-a-job/.env");
    assert.equal(r.status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(root, { recursive: true, force: true });
  }
});