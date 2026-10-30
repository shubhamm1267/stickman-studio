import { randomUUID } from "node:crypto";
import { readdir, mkdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { DATA, ROOT, atomic, json, redact } from "./files.mjs";
export class JobQueue {
  constructor(root = path.join(DATA, "jobs"), {now=Date.now,retentionMs=10*60*1000}={}) {
    this.root = root;
    this.jobs = new Map();
    this.pending = [];
    this.busy = false;
    this.writes = new Map();
    this.now=now;this.retentionMs=retentionMs;this.expiryTimers=new Map();
    this.cleanupTasks=new Map();this.closed=false;
  }
  async init() {
    await mkdir(this.root, { recursive: true });
    for (let id of await readdir(this.root)) {
      try {
        let j = await json(path.join(this.root, id, "job.json"));
        if (["queued", "running"].includes(j.status)) {
          j.status = "interrupted";
          j.error = "Server restarted. Retry this job with your keys.";
          await atomic(path.join(this.root, id, "job.json"), j);
        }
        this.jobs.set(id, j);
        if(j.kind==='render'&&!j.videoExpiresAt){try{const file=await stat(path.join(this.root,id,'video.mp4'));j.videoCreatedAt=new Date(file.mtimeMs).toISOString();j.videoExpiresAt=new Date(file.mtimeMs+this.retentionMs).toISOString();await this.save(j);}catch{}}
        if(j.videoExpiresAt){await this.expireMedia(id);this.scheduleExpiry(j);}
      } catch {}
    }
  }
  scheduleExpiry(j){
    clearTimeout(this.expiryTimers.get(j.id));
    if(this.closed||!j.videoExpiresAt||(j.mediaExpired&&!j.cleanupPending))return;
    const delay=j.mediaExpired?15000:Math.max(0,Date.parse(j.videoExpiresAt)-this.now());
    const timer=setTimeout(()=>{void this.expireMedia(j.id).catch(()=>{}).finally(()=>this.scheduleExpiry(j));},Math.min(delay,2147483647));timer.unref();this.expiryTimers.set(j.id,timer);
  }
  async markMediaReady(id){
    const j=this.jobs.get(id);if(!j)return;
    j.videoCreatedAt=new Date(this.now()).toISOString();j.videoExpiresAt=new Date(this.now()+this.retentionMs).toISOString();j.mediaExpired=false;j.mediaRendering=false;delete j.mediaExpiredAt;delete j.cleanupPending;
    await this.save(j);this.scheduleExpiry(j);
  }
  async beginMediaRender(id){
    await this.cleanupTasks.get(id);const j=this.jobs.get(id);if(!j)return;
    clearTimeout(this.expiryTimers.get(id));this.expiryTimers.delete(id);delete j.videoExpiresAt;j.mediaRendering=true;await this.save(j);
  }
  async expireMedia(id){
    if(this.cleanupTasks.has(id))return this.cleanupTasks.get(id);
    const task=this.expireMediaNow(id);this.cleanupTasks.set(id,task);
    try{return await task;}finally{this.cleanupTasks.delete(id);}
  }
  async expireMediaNow(id){
    const j=this.jobs.get(id);if(!j?.videoExpiresAt||this.now()<Date.parse(j.videoExpiresAt))return false;
    if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid cleanup job ID.');
    const root=path.resolve(this.root),dir=path.resolve(root,id);
    if(path.dirname(dir)!==root)throw Error('Cleanup directory must remain inside the job workspace.');
    j.mediaExpired=true;j.mediaExpiredAt ||=new Date(this.now()).toISOString();
    await this.save(j);
    let pending=false;
    const remove=async file=>{try{await unlink(file);}catch(e){if(e.code!=='ENOENT')pending=true;}};
    let entries=[];try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const entry of entries)if(entry.isFile()&&/\.(mp4|webm|wav|mp3|png|jpg)$/i.test(entry.name))await remove(path.join(dir,entry.name));
    await remove(path.join(ROOT,'public',id+'-audio.wav'));
    j.cleanupPending=pending;await this.save(j);return true;
  }
  async close(){this.closed=true;for(const timer of this.expiryTimers.values())clearTimeout(timer);this.expiryTimers.clear();await Promise.allSettled([...this.cleanupTasks.values(),...this.writes.values()]);}
  public(id) {
    let j = this.jobs.get(id);
    if (!j) return null;
    let { controller, task, keys, ...safe } = j;
    return safe;
  }
  list() {
    return [...this.jobs.keys()]
      .map((id) => this.public(id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async save(j) {
    let snapshot = JSON.stringify(this.public(j.id), null, 2);
    let next = (this.writes.get(j.id) || Promise.resolve())
      .catch(() => {})
      .then(() => atomic(path.join(this.root, j.id, "job.json"), snapshot));
    this.writes.set(j.id, next);
    await next;
  }
  async add(kind, task, keys = {}, request = {}) {
    if (this.pending.length >= 8)
      throw Error("Queue is full. Wait for a job to finish.");
    let j = {
      id: randomUUID(),
      kind,
      status: "queued",
      progress: 0,
      message: "Queued",
      request,
      createdAt: new Date().toISOString(),
      controller: new AbortController(),
      task,
      keys,
    };
    this.jobs.set(j.id, j);
    await this.save(j);
    this.pending.push(j);
    void this.run();
    return this.public(j.id);
  }
  async retryVideoReview(id,task,keys={}){
    const j=this.jobs.get(id);if(!j||j.kind!=='render'||!['failed','completed','interrupted'].includes(j.status))throw Error('Only a finished render can be reviewed again.');
    if(this.pending.length>=8)throw Error('Queue is full.');
    await this.expireMedia(id);if(j.mediaExpired)throw Error('Video expired. Generate a new video.');
    j.status='queued';j.message='Queued for detailed video review';j.progress=0;j.controller=new AbortController();j.task=task;j.keys=keys;j.reviewAttempts=(j.reviewAttempts||0)+1;delete j.error;delete j.result;delete j.finishedAt;
    await this.save(j);this.pending.push(j);void this.run();return this.public(id);
  }
  async retryRender(id,task,keys={},request={}){
    const j=this.jobs.get(id);
    if(!j||j.kind!=='render'||!['failed','interrupted','cancelled'].includes(j.status))throw Error('Only an unsuccessful render can be resumed.');
    if(this.pending.length>=8)throw Error('Queue is full.');
    await this.cleanupTasks.get(id);
    clearTimeout(this.expiryTimers.get(id));this.expiryTimers.delete(id);
    delete j.videoExpiresAt;
    Object.assign(j,{status:'queued',message:'Resuming saved render stages',progress:0,request,controller:new AbortController(),task,keys,attempts:(j.attempts||1)+1});
    delete j.error;delete j.result;delete j.finishedAt;
    await this.save(j);this.pending.push(j);void this.run();return this.public(id);
  }
  async run() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.pending.length) {
        let j = this.pending.shift();
        if (j.status === "cancelled") continue;
        j.status = "running";
        await this.save(j);
        let update = (message, progress) => {
          j.history ||= [];
          if(j.history.at(-1)?.message!==message)j.history.push({at:new Date().toISOString(),message:redact(message,j.keys),progress});
          if(j.history.length>120)j.history.shift();
          j.message = message;
          if (progress !== undefined) j.progress = progress;
          void this.save(j).catch(() => {});
        };
        try {
          j.result = await j.task(
            j,
            path.join(this.root, j.id),
            j.controller.signal,
            update,
          );
          j.status = j.controller.signal.aborted ? "cancelled" : "completed";
          j.progress = j.status === "completed" ? 100 : j.progress;
          j.message = j.status === "completed" ? "Ready" : "Cancelled";
        } catch (e) {
          if(e.generatedValue)await atomic(path.join(this.root,j.id,'generation-failure.json'),{message:redact(e.message,j.keys),issues:e.validationIssues||e.issues||[],generatedValue:e.generatedValue});
          if(e.generatedScore)await atomic(path.join(this.root,j.id,'direction-failure.json'),e.generatedScore);
          j.status = j.controller.signal.aborted ? "cancelled" : "failed";
          j.error = redact(e.message, j.keys);
          if(Array.isArray(e.capabilityDiagnostics))
            j.capabilityDiagnostics=structuredClone(e.capabilityDiagnostics).slice(0,200);
          j.message = j.status === "failed" ? "Job failed" : "Cancelled";
        }
        delete j.keys;
        delete j.task;
        delete j.controller;
        j.finishedAt = new Date().toISOString();
        if(j.kind==='render'&&!j.videoExpiresAt){try{await stat(path.join(this.root,j.id,'video.mp4'));await this.markMediaReady(j.id);}catch{}}
        await this.save(j);
      }
    } finally {
      this.busy = false;
    }
  }
  async cancel(id) {
    let j = this.jobs.get(id);
    if (!j) return false;
    if (["queued", "running"].includes(j.status)) {
      let queued = j.status === "queued";
      j.controller?.abort();
      if (queued) {
        this.pending = this.pending.filter((q) => q.id !== id);
        delete j.keys;
        delete j.task;
        delete j.controller;
      }
      j.status = "cancelled";
      j.message = "Cancellation requested";
      await this.save(j);
    }
    return true;
  }
}
