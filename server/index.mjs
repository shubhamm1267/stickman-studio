import {studioStyleOptions} from "../shared/reference-style.mjs";
import{withExportFps}from"./export-settings.mjs";
import "dotenv/config";
import{validateVoiceCast}from"../shared/voice-cast.mjs";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import {randomUUID}from"node:crypto";
import { existsSync } from "node:fs";
import { readFile, mkdir, unlink } from "node:fs/promises";
import { z } from "zod";
import { ROOT, DATA, atomic, json, redact } from "./files.mjs";
import {
  validatePlan,
  PlanSchema,
  jsonSchema,
  ACTIONS,
  MOTION_CAPABILITIES,
  durationOf,
  verifyReplayPlan,
} from "../shared/schema.mjs";
import { svgFrameAtFrame } from "../renderer/engine.mjs";
import { canonicalizePlan } from "../shared/canonical-story-ir.mjs";
import { compileAssetFactoryPipeline } from "./asset-factory.mjs";
import { inspectPlan, assertRenderable, planHash } from "./inspect.mjs";
import { planStory, reviewAndRepair } from "./providers.mjs";
import { buildAudio, command } from "./media.mjs";
import { renderFilm } from "./render.mjs";
import { JobQueue } from "./queue.mjs";
import { creatorPack } from "./creator.mjs";
import {produceFilm} from './production.mjs';
import {reviewRenderedVideo} from './video-review.mjs';
import {inspectEncoded} from './encoded-quality.mjs';
import {assertAdultComedyRequest, humorProfileForCategory, normalizeComedySettings} from '../shared/comedy-category.mjs';
import {discoverCapabilities} from './capability-discovery.mjs';
export async function createApp({
  queue = new JobQueue(),
  planner = planStory,
  audioBuilder = buildAudio,
  renderer = renderFilm,
} = {}) {
  await queue.init();
  let app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "3mb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit:1200,
      skip:req=>req.method!=='GET',
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler:(req,res)=>res.status(429).json({error:'Too many requests. Please wait briefly and retry.'}),
    }),
  );
  // Polling reads must not consume the budget for Generate/Render requests.
  app.use('/api',rateLimit({windowMs:60000,limit:120,skip:req=>req.method==='GET',standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:'Too many requests. Please wait briefly and retry.'})}));
  app.use("/api", (req, res, next) => {
    let o = req.headers.origin;
    if (
  o &&
  !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) &&
  o !== process.env.FRONTEND_ORIGIN
)
      return res
        .status(403)
        .json({ error: "Only local studio origins are allowed." });
    if (process.env.STUDIO_TOKEN) {
      let header =
          req.headers.authorization === `Bearer ${process.env.STUDIO_TOKEN}`,
        cookie = req.headers.cookie
          ?.split(";")
          .some(
            (v) =>
              v.trim() ===
              "studio_session=" + encodeURIComponent(process.env.STUDIO_TOKEN),
          );
      if (!header && !cookie)
        return res.status(401).json({ error: "Studio access token required." });
      if (header)
        res.cookie("studio_session", process.env.STUDIO_TOKEN, {
          httpOnly: true,
          sameSite: "strict",
          secure: req.secure,
          path: "/api",
          maxAge: 8 * 3600 * 1000,
        });
    }
    next();
  });
  app.get("/api/health", async (req, res) => {
    let ffmpeg = true;
    try {
      await command(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]);
    } catch {
      ffmpeg = false;
    }
    res.json({ ok: ffmpeg, ffmpeg, version: "9.1.0", maxDuration: 1200, speechConfigured:!!process.env.CARTESIA_API_KEY });
  });
  app.get('/api/sfx/:name',async(req,res,next)=>{let tmp;
    try{const manifest=await json(path.join(ROOT,'assets/sfx/manifest.json')),item=manifest.find(x=>x.name===req.params.name);if(!item)return res.status(404).json({error:'Sound is not in the curated library.'});
      const start=z.coerce.number().min(0).max(600).parse(req.query.start??0),duration=z.coerce.number().min(.1).max(20).parse(req.query.duration??1),rate=z.coerce.number().min(.5).max(2).parse(req.query.rate??1),volume=z.coerce.number().min(.01).max(.7).parse(req.query.volume??.25);
      const dir=path.join(DATA,'auditions');await mkdir(dir,{recursive:true});tmp=path.join(dir,randomUUID()+'.wav');
      await command(process.env.FFMPEG_PATH||'ffmpeg',['-y','-v','error','-i',path.join(ROOT,'assets/sfx',item.file),'-af',`atrim=start=${start},${req.query.trim==='1'?'silenceremove=start_periods=1:start_threshold=-40dB,':''}asetpts=PTS-STARTPTS,aresample=48000,asetrate=${48000*rate},aresample=48000,apad,atrim=duration=${duration},afade=t=in:d=0.008,afade=t=out:st=${Math.max(0,duration-.04)}:d=0.04,volume=${volume}`,'-ac','2',tmp]);
      res.type('audio/wav').sendFile(tmp,()=>{void unlink(tmp).catch(()=>{});});
    }catch(e){if(tmp)await unlink(tmp).catch(()=>{});next(e);}
  });
  app.get("/api/schema", (req, res) =>
    res.json({ schema: jsonSchema(PlanSchema), actions: ACTIONS, motionCapabilities:MOTION_CAPABILITIES }),
  );
  app.get("/api/capabilities", async (req, res) =>
    res.json(await discoverCapabilities()),
  );
  app.get("/api/example", async (req, res) =>
    res.json(
      await json(
        path.join(
          ROOT,
          {
            dynamic: "examples/dynamic-excavator-fridge.json",
            hero: "examples/superhero-v9.json",
            silent: "examples/superhero-v9.json",
            dialogue: "examples/cool-cap-v9.json",
            'motion-ir': "examples/motion-ir-lantern.json",
            simple: "examples/simple-slap.json",
            headphone: "examples/headphone-mask.json",
            banana: "examples/banana-bin.json",
            animals: "examples/lion-balloon.json",
            dadi: "examples/dadi-jar.json",
            mosquito: "examples/mosquito.json",
            toilet: "examples/toilet-roll.json",
            interview: "examples/interview-chair.json",
          }[String(req.query.name)] || "examples/simple-slap.json",
        ),
      ),
    ),
  );
  app.get("/api/jobs", (req, res) => res.json(queue.list()));
  app.get("/api/jobs/:id", (req, res) => {
    let j = queue.public(req.params.id);
    res.status(j ? 200 : 404).json(j || { error: "Job not found" });
  });
  app.post("/api/jobs/:id/cancel", async (req, res) =>
    res
      .status((await queue.cancel(req.params.id)) ? 200 : 404)
      .json({ ok: true }),
  );
  app.post('/api/jobs/:id/review-video',async(req,res,next)=>{
    const credentials={...req.body.credentials,gemini:req.body.credentials?.gemini||process.env.GEMINI_API_KEY};
    try{
      const source=queue.public(req.params.id);if(!source||!existsSync(path.join(queue.root,source.id,'video.mp4')))throw Error('There is no saved rendered video to review.');
      const job=await queue.retryVideoReview(source.id,async(job,dir,signal,update)=>{
        const saved=await json(path.join(dir,'plan.json'));if(saved?.replay&&!verifyReplayPlan(saved))throw Error('Saved replay metadata does not match the plan contents.');
        const plan=validatePlan(saved);update('Checking saved MP4',20);
        await atomic(path.join(dir,'encoded-quality-report.json'),await inspectEncoded(path.join(dir,'video.mp4'),plan,{signal,scale:source.request.quality==='draft'?.5:1}));
        update('Reviewing fast motion and sound at higher sampling',60);const report=await reviewRenderedVideo(dir,plan,credentials,signal);
        if(!report.passed)throw Error('Video still needs corrections: '+(report.issues.map(i=>i.problem).join('; ')||report.summary));
        await queue.expireMedia(job.id);if(queue.public(job.id).mediaExpired)throw Error('Video expired during review. Generate a new video.');
        const credits=await json(path.join(dir,'sound-credits.json')),seo=creatorPack(plan,credits);await atomic(path.join(dir,'creator-pack.json'),seo);await atomic(path.join(dir,'description.txt'),seo.description);
        return{files:['video.mp4','thumbnail.png','plan.json','story-ir.json','asset-coverage.json','creator-pack.json','description.txt','sound-credits.json','render-report.json','encoded-quality-report.json','video-review.json','video-observations.json','quality-report.json'],seo};
      },credentials);res.status(202).json(job);
    }catch(e){next(Error(redact(e.message,credentials)));}
  });
  app.post("/api/plan", async (req, res, next) => {
    let credentials = {
      ...req.body.credentials,
      gemini: req.body.credentials?.gemini || process.env.GEMINI_API_KEY,
      freesound:
        req.body.credentials?.freesound || process.env.FREESOUND_API_KEY,
      cartesia: req.body.credentials?.cartesia || process.env.CARTESIA_API_KEY,
    };
    try {
      const opts = z
        .object({
          referenceStyle:z.enum(["silent-slapstick","coloured-cartoon","elastic-meme"]).optional(),
          productionMode:z.enum(["silent-sfx","dialogue-toon"]).optional(),
          category:z.enum(["auto","family-comedy","slapstick","romantic-comedy","adult-comedy"]).optional(),
          adultOptIn:z.boolean().default(false),
          comedySettings:z.object({innuendo:z.enum(["off","mild","cheeky"]),profanity:z.enum(["off","mild"]),physicalIntensity:z.enum(["low","medium","high"])}).strict().optional(),
          strictStoryAudit:z.boolean().default(true),
          directionMode:z.enum(['dynamic','semantic','legacy']).default('dynamic'),
          artStyle: z.enum(["pencil","classic","toon"]).default("pencil"),
          story: z.string().trim().max(15000).refine(s=>!s.length||s.length>=20, 'Story must be empty for an original comedy, or contain at least 20 characters.').default(''),
          // A unique creative run keeps fresh clicks separate from resumable checkpoints.
          generationId:z.string().uuid().optional(),
          format: z.enum(["shorts", "landscape", "square"]),
          duration: z.number().int().min(10).max(1200).default(20),
          durationMode:z.enum(["auto","manual"]).default("manual"),
          renderFps:z.union([z.literal(60),z.literal(120)]).optional(),
          language: z.enum(["hi", "en"]).default("hi"),
          voice: z.boolean().default(false),
          humorProfile: z
            .enum(["adult-relatable", "clean", "naughty"])
            .default("clean"),
        })
        .parse(req.body.options);
      opts.generationId ||= randomUUID();
      if(opts.referenceStyle)Object.assign(opts,studioStyleOptions(opts));
      if(!opts.category){
        if(opts.humorProfile!=="clean")throw Error("Choose an explicit comedy category. Legacy adult comedy profiles require the 18+ category and opt-in.");
        opts.category="family-comedy";
      }
      assertAdultComedyRequest(opts);
      opts.comedySettings=normalizeComedySettings(opts.category,opts.comedySettings);
      opts.humorProfile=humorProfileForCategory(opts.category);
      let j = await queue.add(
        "plan",
        async (job, dir, signal, update) => {
          const planned = await planner(opts, credentials, signal, update);
          const { ir, plan } = canonicalizePlan(planned);
          const { renderOverrides:_renderOverrides, ...assetCoverage } = compileAssetFactoryPipeline(ir);
          assetCoverage.assets = assetCoverage.assets.map(({ visualSpec:_visualSpec, ...asset }) => asset);
          await atomic(path.join(dir, "story-ir.json"), ir);
          await atomic(path.join(dir, "asset-coverage.json"), assetCoverage);
          await atomic(path.join(dir, "plan.json"), plan);
          return { plan, storyIRVersion: ir.schemaVersion };
        },
        credentials,
        { options: opts },
      );
      res.status(202).json(j);
    } catch (e) {
      next(Error(redact(e.message, credentials)));
    }
  });
  app.post("/api/export-settings",(req,res,next)=>{try{res.json(withExportFps(req.body.plan,req.body.renderFps));}catch(e){next(e);}});
  app.post("/api/inspect", (req, res, next) => {
    try {
      const { plan } = canonicalizePlan(req.body.plan);
      let report = inspectPlan(plan);
      report.storyReview = plan.review?.method || "not-reviewed";
      report.reviewCurrent =
        !!plan.review &&
        plan.review.planHash === report.planHash;
      res.json(report);
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/review", async (req, res, next) => {
    let credentials = {
      ...req.body.credentials,
      gemini: req.body.credentials?.gemini || process.env.GEMINI_API_KEY,
    };
    try {
      let p = canonicalizePlan(req.body.plan).plan;
      let j = await queue.add(
        "review",
        async (job, dir, signal, update) => {
          const reviewed = await reviewAndRepair(p, credentials, signal, update);
          const { ir, plan } = canonicalizePlan(reviewed);
          await atomic(path.join(dir, "story-ir.json"), ir);
          await atomic(path.join(dir, "plan.json"), plan);
          return { plan, storyIRVersion: ir.schemaVersion };
        },
        credentials,
        { plan: p },
      );
      res.status(202).json(j);
    } catch (e) {
      next(Error(redact(e.message, credentials)));
    }
  });
  app.post("/api/preview", (req, res, next) => {
    try {
      const { plan } = canonicalizePlan(req.body.plan);
      const fps = plan.renderFps || 30;
      const frame = Math.max(
        0,
        Math.min(Math.round(durationOf(plan) * fps) - 1, Math.round((Number(req.body.time) || 0) * fps)),
      );
      res.type("image/svg+xml").send(svgFrameAtFrame(plan, frame));
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/render", async (req, res, next) => {
    let credentials = {
      ...req.body.credentials,
      gemini: req.body.credentials?.gemini || process.env.GEMINI_API_KEY,
      freesound:
        req.body.credentials?.freesound || process.env.FREESOUND_API_KEY,
      cartesia: req.body.credentials?.cartesia || process.env.CARTESIA_API_KEY,
    };
    try {
      let plan = canonicalizePlan(req.body.plan).plan;
      const resumeId=req.body.resumeJobId===undefined?undefined:z.string().uuid().parse(req.body.resumeJobId);
      if(resumeId){
        const source=queue.public(resumeId);
        if(!source||source.kind!=='render'||!['failed','interrupted','cancelled'].includes(source.status))throw Error('Only an unsuccessful render can be resumed.');
        // Restore the last repaired plan only when the user has not edited
        // the original request. Changed input must invalidate saved stages.
        const original=canonicalizePlan(source.request.plan).plan;
        if(original.replay?.planHash===plan.replay?.planHash&&existsSync(path.join(queue.root,resumeId,'plan.json'))){
          const saved=await json(path.join(queue.root,resumeId,'plan.json'));
          if(saved.replay&&!verifyReplayPlan(saved))throw Error('Saved replay metadata does not match the plan contents.');
          plan=canonicalizePlan(saved).plan;
        }
      }
      if (plan.blockedReasons.length)
        throw Error(
          "Unresolved story requirements: " + plan.blockedReasons.join("; "),
        );
      let bundled = req.body.mode === "bundled";
      const curated=new Set((await json(path.join(ROOT,"assets/sfx/manifest.json"))).map(x=>x.name));
      if (
        !bundled &&
        plan.scenes.some(s=>s.sounds.length > 0) &&
        !credentials.freesound
      )
        throw Error("Enter your Freesound key, or use bundled demo mode.");
      if (plan.scenes.some((s) => s.dialogue.some(v=>!bundled||!v.fixture||req.body.useCartesia===true)) && !credentials.cartesia)
        throw Error(
          "Cartesia is required for the dialogue in this plan. Remove dialogue for SFX-only.",
        );
      if((!bundled||req.body.useCartesia===true) && plan.scenes.some(s=>s.dialogue.length))validateVoiceCast(plan,credentials);
      let quality = req.body.quality === "draft" ? "draft" : "full";
      const task=async (job, dir, signal, update) => {
          if(!bundled&&plan.planningMode!=='dynamic'&&plan.directionScore&&(plan.directionVersion||0)<3&&plan.review?.planHash===planHash(plan)){
            update('Updating saved choreography for the current engine',2);
            plan=await (await import('./semantic-director.mjs')).upgradeSemanticPlan(plan,credentials,signal,update);
          }
          if (
            !bundled &&
            (!plan.review || plan.review.planHash !== planHash(plan))
          ) {
            update("Reviewing changed story plan", 2);
            plan = await reviewAndRepair(plan, credentials, signal, update);
          }
          const retainedRenderer=async(...args)=>{
            // Preview media must not start or reset final-download retention.
            if(path.resolve(args[1])!==path.resolve(dir))return renderer(...args);
            await queue.beginMediaRender(job.id);try{return await renderer(...args);}finally{if(existsSync(path.join(dir,'video.mp4')))await queue.markMediaReady(job.id);}
          };
          const produced=await produceFilm(plan,dir,credentials,{signal,progress:update,quality,bundled,reuseExisting:!!resumeId,liveDialogue:req.body.useCartesia===true,audioBuilder,renderer:retainedRenderer});
          plan=produced.plan;
          const credits=produced.credits;
          let seo = creatorPack(plan, credits);
          await atomic(path.join(dir, "creator-pack.json"), seo);
          await atomic(path.join(dir, "description.txt"), seo.description);
          return {
            files: [
              "video.mp4",
              "thumbnail.png",
              "plan.json",
              "story-ir.json",
              "asset-coverage.json",
              "creator-pack.json",
              "description.txt",
              "sound-credits.json",
              "render-report.json",
              "encoded-quality-report.json",
              "video-review.json",
              "video-observations.json",
              "quality-report.json",
              "production-state.json",
              "sound-selection.json",
            ],
            seo,
          };
        };
      const request={plan,quality,useCartesia:req.body.useCartesia===true,mode:bundled?'bundled':'live'};
      const j=resumeId?await queue.retryRender(resumeId,task,credentials,request):await queue.add('render',task,credentials,request);
      res.status(202).json(j);
    } catch (e) {
      next(Error(redact(e.message, credentials)));
    }
  });
  const files = new Set([
    "video.mp4",
    "thumbnail.png",
    "plan.json",
    "story-ir.json",
    "asset-coverage.json",
    "creator-pack.json",
    "description.txt",
    "sound-credits.json",
    "render-report.json",
    "encoded-quality-report.json",
    "video-review.json",
    "video-observations.json",
    "quality-report.json",
    "production-state.json",
    "sound-selection.json",
  ]);
  app.get("/api/files/:id/:name", async (req, res,next) => {
    try{
    if (
      !/^[a-f0-9-]{36}$/.test(req.params.id) ||
      !files.has(req.params.name) ||
      !queue.public(req.params.id)
    )
      return res.status(404).end();
    await queue.expireMedia(req.params.id);
    if(queue.public(req.params.id)?.mediaExpired&&/\.(mp4|webm|wav|mp3|png|jpg)$/i.test(req.params.name))return res.status(410).json({error:'Video expired and was deleted 10 minutes after rendering. Download it before the expiry time.'});
    let file = path.join(queue.root, req.params.id, req.params.name);
    if (!existsSync(file))
      return res.status(404).json({ error: "File not ready" });
    if (req.query.download === "1") return res.download(file, req.params.name);
    res.sendFile(file);
    }catch(e){next(e);}
  });
  let web = path.join(ROOT, "web/dist/studio-web/browser");
  if (existsSync(web)) {
    app.use(express.static(web));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(web, "index.html")),
    );
  }
  app.use((err, req, res, next) =>
    res.status(400).json({
      error: redact(err.message),
      ...(Array.isArray(err.capabilityDiagnostics)
        ? { capabilityDiagnostics: err.capabilityDiagnostics.slice(0, 200) }
        : {}),
    }),
  );
  return { app, queue };
}
if (process.argv[1] === import.meta.filename) {
  let { app } = await createApp();
  app.listen(
    Number(process.env.PORT) || 3001,
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `StickLaugh Studio: http://127.0.0.1:${process.env.PORT || 3001}`,
      ),
  );
}