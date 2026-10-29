import {
  Component,
  signal,
  computed,
  provideZonelessChangeDetection,
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
@Component({
  selector: "studio-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.html",
})
class App {
  report = signal<any>(null);
  tab = signal("create");
  busy = signal(false);
  error = signal("");
  notice = signal("");
  plan = signal<any>(null);
  jobs = signal<any[]>([]);
  active = signal<any>(null);
  preview = signal("");
  previewTime = 0;
  raw = "";
  sceneIndex = 0;
  format = "shorts";
  duration = 20;
  durationMode="auto";
  renderFps=60;
  artStyle = "pencil";
  productionMode="silent-sfx";
  directionMode="dynamic";
  referenceStyle='silent-slapstick';
  setMode(mode:string){this.referenceStyle=mode==='dialogue-toon'?'coloured-cartoon':mode==='silent-sfx'?'silent-slapstick':mode;this.productionMode='silent-sfx';this.voice=false;this.artStyle=this.referenceStyle==='coloured-cartoon'?'toon':this.referenceStyle==='elastic-meme'?'classic':'pencil';}
  readyDownloadUrl=signal('');
  downloadStatus=signal('');
  private preparedVideoId='';
  private downloadController?:AbortController;
  language = "hi";
  story = "";

  now = signal(Date.now());
  downloaded = new Set<string>();
  humorProfile = "clean";
  category = "family-comedy";
  adultOptIn = false;
  comedySettings: any = {innuendo:"off",profanity:"off",physicalIntensity:"medium"};
  exampleName = "silent";
  voice = false;
  quality = "full";
  mode = "live";
  remember = false;
  health = signal<any>(null);
  keys: any = {
    gemini: "",
    geminiModel: "gemini-3.5-flash-lite",
    freesound: "",
  };
  token = "";
  resultId = "";
  timer: any;
  blob = "";
  total = computed(
    () =>
      this.plan()?.scenes.reduce((n: number, s: any) => n + s.duration, 0) || 0,
  );
  constructor(private sanitizer: DomSanitizer) {
    setInterval(()=>this.now.set(Date.now()),1000);
    try {
      let s = localStorage.getItem("sticklaugh-keys");
      if (s) {
        this.keys = JSON.parse(s);
        // Older browser settings may contain Cartesia overrides. Keep the
        // provider's tested server defaults authoritative after this migration.
        delete this.keys.cartesiaModel;
        delete this.keys.cartesiaVersion;
        delete this.keys.cartesia;delete this.keys.voices;
        this.remember = true;
      }
    } catch {}
    void this.refresh();
  }
  async api(route: string, body?: any) {
    let r = await fetch("/api" + route, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let j = await r.json();
    if (!r.ok) throw Object.assign(Error(j.error || "Request failed"),{status:r.status});
    return j;
  }
  async refresh() {
    try {
      this.health.set(await this.api("/health"));
      this.jobs.set(await this.api("/jobs"));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
  saveKeys() {
    try {
      if (this.remember)
        localStorage.setItem("sticklaugh-keys", JSON.stringify(this.keys));
      else localStorage.removeItem("sticklaugh-keys");
      this.notice.set("Settings saved.");
    } catch {
      this.error.set("Could not save settings.");
    }
  }
  clearKeys() {
    localStorage.removeItem("sticklaugh-keys");
    this.keys = {
      ...this.keys,
      gemini: "",
      freesound: "",
    };
    this.remember = false;
    this.notice.set("Keys cleared.");
  }
  soundCues(){let offset=0;for(const s of this.plan()?.scenes||[]){if(this.previewTime<offset+s.duration)return s.sounds.filter((c:any)=>c.fixture);offset+=s.duration;}return [];}
  soundUrl(c:any){return '/api/sfx/'+encodeURIComponent(c.fixture)+'?start='+(c.sourceStart||0)+'&duration='+c.duration+'&rate='+(c.playbackRate||1)+'&volume='+c.volume+'&trim='+(c.trimSilence===false?'0':'1');}
  setCategory(category:string){
    this.category=category;
    if(category==="family-comedy"){
      this.comedySettings={...this.comedySettings,innuendo:"off",profanity:"off"};
    }
  }
  syncCategoryFromPlan(plan:any){
    this.setCategory(plan?.category||"family-comedy");
    this.adultOptIn=plan?.adultModeAcknowledged===true;
    this.comedySettings={...this.comedySettings,...(plan?.comedySettings||{})};
    if(plan?.referenceStyle)this.setMode(plan.referenceStyle);
    if(this.category==="family-comedy"){
      this.comedySettings.innuendo="off";
      this.comedySettings.profanity="off";
    }
  }
  async demo() {
    try {
      this.plan.set(await this.api("/example?name=" + this.exampleName));
      this.syncCategoryFromPlan(this.plan());
      this.renderFps=this.plan().renderFps===120?120:60;
      this.mode = "bundled";
      this.raw = JSON.stringify(this.plan(), null, 2);
      this.format = this.plan().format;
      if(this.plan().referenceStyle)this.setMode(this.plan().referenceStyle);
      this.tab.set("director");
      this.previewTime = 0;
      await this.updatePreview();
      this.notice.set(
        "Bundled demo: works without API keys. New stories use Gemini.",
      );
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
  async generate() {
    this.error.set("");
    this.busy.set(true);
    try {
      this.saveKeys();
      let j = await this.api("/plan", {
        options: {
          story: this.story,
          directionMode:'dynamic',
          referenceStyle:this.referenceStyle,
          productionMode:this.productionMode,
          artStyle: this.artStyle,
          format: this.format,
          duration: +this.duration,
          durationMode:this.durationMode,
          renderFps:+this.renderFps,
          voice: false,
          category:'auto',
        },
        credentials: this.keys,
      });
      this.watch(j);
    } catch (e: any) {
      this.error.set(e.message);
      this.busy.set(false);
    }
  }
  watch(j: any) {
    this.active.set(j);
    clearTimeout(this.timer);
    let networkFailures=0;
    const poll = async () => {
      try {
        let x = await this.api("/jobs/" + j.id);
        networkFailures=0;
        this.active.set(x);
        if (
          ["completed", "failed", "cancelled", "interrupted"].includes(x.status)
        ) {
          this.busy.set(false);
          await this.refresh();
          if (x.status === "completed") {
            if (["plan", "review"].includes(x.kind)) {
              this.plan.set(x.result.plan);
              this.syncCategoryFromPlan(this.plan());
              this.renderFps=this.plan().renderFps===120?120:60;
              this.raw = JSON.stringify(this.plan(), null, 2);
              this.mode = "live";
              this.tab.set("director");
              await this.updatePreview();
              if (x.kind === "plan") await this.render();
            } else {
              this.resultId = x.id;
              this.tab.set("publish");
              await this.prepareVideoDownload(x.id);
              if(this.readyDownloadUrl()&&!this.downloaded.has(x.id)){this.downloaded.add(x.id);this.downloadVideo();}
            }
          } else this.error.set(x.error || x.message);
        } else this.timer = setTimeout(poll, 1100);
      } catch (e: any) {
        if(e.status===429||((e instanceof TypeError||/fetch|network/i.test(e.message))&&networkFailures++<15)){this.timer=setTimeout(poll,2500);return;}
        this.busy.set(false);
        this.error.set(e.message);
      }
    };
    void poll();
  }
  async cancel() {
    if (this.active())
      await this.api("/jobs/" + this.active().id + "/cancel", {});
  }
  videoExpired(){if(this.readyDownloadUrl()&&this.preparedVideoId===this.resultId)return false;return !!this.active()?.mediaExpired||!!this.active()?.videoExpiresAt&&Date.parse(this.active().videoExpiresAt)<=this.now();}
  expiryText(){if(this.readyDownloadUrl()&&this.preparedVideoId===this.resultId)return 'Video is ready in this browser. Download it to save a copy.';const until=this.active()?.videoExpiresAt;if(!until)return '';const remaining=Math.max(0,Math.ceil((Date.parse(until)-this.now())/1000));return remaining?`Video deletes automatically in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}. Save your download now.`:'Video expired and has been deleted from the studio.';}
  async prepareVideoDownload(id:string){
    if(this.preparedVideoId===id&&this.readyDownloadUrl())return;
    this.downloadController?.abort();
    const controller=new AbortController();this.downloadController=controller;
    const previous=this.readyDownloadUrl();this.readyDownloadUrl.set('');if(previous)URL.revokeObjectURL(previous);
    this.preparedVideoId='';this.downloadStatus.set('Preparing your download…');
    try{
      const response=await fetch('/api/files/'+encodeURIComponent(id)+'/video.mp4?download=1',{headers:this.token?{Authorization:'Bearer '+this.token}:{},signal:controller.signal});
      if(!response.ok)throw Error('Video download is unavailable. Open the completed video again to retry.');
      const bytes=await response.blob();if(!bytes.size)throw Error('The video file is empty.');
      if(controller.signal.aborted||id!==this.resultId)return;
      this.readyDownloadUrl.set(URL.createObjectURL(bytes));this.preparedVideoId=id;this.downloadStatus.set('Video ready to download');
    }catch(error:any){if(!controller.signal.aborted)this.downloadStatus.set(error.message);}
  }
  downloadVideo(){
    const url=this.readyDownloadUrl();if(!url||this.videoExpired())return;
    const a=document.createElement('a');a.href=url;a.download='comedy-video.mp4';document.body.appendChild(a);a.click();a.remove();
  }
  async updatePreview() {
    try {
      let p = structuredClone(this.plan());
      if (!p) return;
      p.format = this.format;
      p=await this.api("/export-settings",{plan:p,renderFps:+this.renderFps});
      let r = await fetch("/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
        },
        body: JSON.stringify({ plan: p, time: +this.previewTime }),
      });
      if (!r.ok) throw Error((await r.json()).error);
      let svg = await r.text();
      if (this.blob) URL.revokeObjectURL(this.blob);
      this.blob = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      this.preview.set(this.blob);
      this.report.set(await this.api("/inspect", { plan: p }));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
  async applyJson() {
    this.error.set("");
    try {
      this.plan.set(JSON.parse(this.raw));
      this.syncCategoryFromPlan(this.plan());
      this.renderFps=this.plan().renderFps===120?120:60;
      await this.updatePreview();
      if (!this.error()) this.notice.set("Scene plan updated.");
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
  async review() {
    this.error.set("");
    this.busy.set(true);
    try {
      this.saveKeys();
      let p = structuredClone(this.plan());
      p.format = this.format;
      p=await this.api("/export-settings",{plan:p,renderFps:+this.renderFps});
      this.watch(
        await this.api("/review", { plan: p, credentials: this.keys }),
      );
    } catch (e: any) {
      this.error.set(e.message);
      this.busy.set(false);
    }
  }
  async render() {
    this.error.set("");
    this.busy.set(true);
    try {
      let p = structuredClone(this.plan());
      if(p?.scenes?.some((scene:any)=>scene.dialogue?.length)){
        this.story=p.sourceIdea||p.story;this.setMode(p.referenceStyle||'coloured-cartoon');
        this.notice.set('Updating this saved story for visual action and Freesound effects.');
        await this.generate();return;
      }

      p.format = this.format;
      p=await this.api("/export-settings",{plan:p,renderFps:+this.renderFps});
      this.plan.set(p);
      this.syncCategoryFromPlan(p);
      this.saveKeys();
      let j = await this.api("/render", {
        plan: p,
        credentials: this.keys,
        quality: this.quality,
        mode: this.mode,
      });
      this.watch(j);
    } catch (e: any) {
      this.error.set(e.message);
      this.busy.set(false);
    }
  }
  async openJob(j: any) {
    this.active.set(j);
    if(['queued','running'].includes(j.status)){this.busy.set(true);this.watch(j);return;}
    if (["failed", "interrupted", "cancelled"].includes(j.status)) {
      if (j.request?.plan) {
        this.plan.set(j.request.plan);
        this.syncCategoryFromPlan(this.plan());
        this.renderFps=this.plan().renderFps===120?120:60;
        this.raw = JSON.stringify(this.plan(), null, 2);
        this.format = this.plan().format;
        this.mode = j.request.mode;
        this.tab.set("director");
        await this.updatePreview();
        this.notice.set(
          "Plan restored. Click Render to retry with current keys.",
        );
      } else if (j.request?.options) {
        let o = j.request.options;
        this.story = o.story;
        this.setMode(o.referenceStyle||'silent-slapstick');
        this.category=o.category||"family-comedy";
        this.adultOptIn=o.adultOptIn===true;
        this.comedySettings={...this.comedySettings,...(o.comedySettings||{})};
        this.duration = o.duration;
        this.durationMode=o.durationMode||"manual";
        this.renderFps=o.renderFps===120?120:60;
        this.format = o.format;
        this.tab.set("create");
      }
      return;
    }
    if (j.status === "completed" && j.kind === "render") {
      this.resultId = j.id;
      this.active.set(j);
      this.tab.set("publish");
      await this.prepareVideoDownload(j.id);
    } else if (j.result?.plan) {
      this.plan.set(j.result.plan);
      this.syncCategoryFromPlan(this.plan());
      this.renderFps=this.plan().renderFps===120?120:60;
      this.raw = JSON.stringify(this.plan(), null, 2);
      this.tab.set("director");
      await this.updatePreview();
    }
  }
  async reviewExistingVideo(){this.error.set('');this.busy.set(true);try{const j=await this.api('/jobs/'+this.active().id+'/review-video',{credentials:this.keys});this.watch(j);}catch(e:any){this.busy.set(false);this.error.set(e.message);}}
  downloadFile(name: string) {
    return this.file(name) + "?download=1";
  }
  file(name: string) {
    return "/api/files/" + this.resultId + "/" + name;
  }
  asset(name: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.file(name));
  }
  async copy(s: string) {
    await navigator.clipboard.writeText(s);
    this.notice.set("Copied.");
  }
  downloadJson() {
    let u = URL.createObjectURL(
      new Blob([JSON.stringify(this.plan(), null, 2)], {
        type: "application/json",
      }),
    );
    let a = document.createElement("a");
    a.href = u;
    a.download = "story-plan.json";
    a.click();
    URL.revokeObjectURL(u);
  }
  chapter(i: number) {
    let t = this.plan()
      .scenes.slice(0, i)
      .reduce((a: number, s: any) => a + s.duration, 0);
    this.previewTime = t + 0.1;
    void this.updatePreview();
  }
}
bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch(console.error);
