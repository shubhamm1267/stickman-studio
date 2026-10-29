import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {svgFrame} from '../renderer/engine.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const publicRoot=path.join(root,'web/dist/studio-web/browser');
const server=createServer(async(req,res)=>{try{let file=path.join(publicRoot,decodeURIComponent(req.url.split('?')[0]));if(req.url==='/'||!path.extname(file))file=path.join(publicRoot,'index.html');const bytes=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const fixture=JSON.parse(await readFile(path.join(root,'examples/human-movement-preview.json'),'utf8'));
const video=await readFile(path.join(root,'deliverables/human-movement-preview/video.mp4'));
let style='silent-slapstick',generation=0,videoRequests=0;const requests=[];
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;let result;
 if(p==='/api/health')result={ok:true,ffmpeg:true};
 else if(p==='/api/jobs')result=[];
 else if(p==='/api/plan'){const body=req.postDataJSON();requests.push(body);style=body.options.referenceStyle;generation++;result={id:'plan'+generation,kind:'plan',status:'queued'};}
 else if(p.startsWith('/api/jobs/plan'))result={id:'plan'+generation,kind:'plan',status:'completed',result:{plan:{...fixture,referenceStyle:style}}};
 else if(p==='/api/export-settings')result=req.postDataJSON().plan;
 else if(p==='/api/preview')return route.fulfill({contentType:'image/svg+xml',body:svgFrame(fixture,0)});
 else if(p==='/api/inspect')result={ok:true,samples:1,checks:[],issues:[]};
 else if(p==='/api/render')result={id:'render'+generation,kind:'render',status:'queued'};
 else if(p.startsWith('/api/jobs/render'))result={id:'render'+generation,kind:'render',status:'completed',result:{seo:fixture.seo}};
 else if(p.endsWith('/video.mp4')){videoRequests++;return route.fulfill({contentType:'video/mp4',body:video});}
 else if(p.endsWith('/thumbnail.png'))return route.fulfill({status:204});
 else return route.fulfill({status:404,body:'{}'});
 return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
});
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 const text=await page.locator('body').innerText();assert.doesNotMatch(text,/Language|Animation planner|Comedy category|Physical comedy intensity|Cartesia|Preview dynamic joints|Load bundled sample|Render automatically|Download MP4 automatically/);
 assert.equal(await page.locator('input[name=referenceStyle]').count(),3);
 for(const requested of ['silent-slapstick','coloured-cartoon','elastic-meme']){
  await page.getByRole('button',{name:'Create a story'}).click();
  await page.locator(`input[value="${requested}"]`).check();
  await page.locator('#story').fill('A woman walks toward a parked blue car and waves.');
  const automatic=page.waitForEvent('download');await page.getByRole('button',{name:'Generate comedy video'}).click();
  const first=await automatic;assert.equal(first.suggestedFilename(),'comedy-video.mp4');
  const preparedRequests=videoRequests;
  const manual=page.waitForEvent('download');await page.getByRole('button',{name:'Download video'}).click();await manual;
  assert.equal(videoRequests,preparedRequests,'click must use already prepared bytes');
  const body=requests.at(-1);assert.equal(body.options.referenceStyle,requested);assert.equal(body.options.productionMode,'silent-sfx');assert.equal(body.options.category,'auto');assert.equal(body.options.directionMode,'dynamic');assert.equal(body.options.voice,false);assert.equal(body.options.language,undefined);assert.equal(body.credentials.cartesia,undefined);
 }
 assert.deepEqual(errors,[]);
 await writeFile(path.join(root,'deliverables/studio-ui-checks.json'),JSON.stringify({passed:true,styles:requests.map(r=>r.options.referenceStyle),automaticPlanRender:true,automaticDownload:true,manualDownloadUsesPreparedBlob:true,pageErrors:errors,limits:'Provider and renderer responses are mocked in this browser workflow check; rendering and live provider verification are separate.'},null,2));
 console.log('PASS: three SFX styles, automatic render, prepared direct download, removed controls, no page errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
