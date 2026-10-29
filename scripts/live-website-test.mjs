import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {findBrowser} from '../server/browser.mjs';

const base='http://127.0.0.1:'+(process.env.PORT||3001),name=process.env.SAMPLE_DIR||'semantic-original';
const out=path.resolve('deliverables',name);await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:await findBrowser(),headless:true});
const page=await browser.newPage({acceptDownloads:true});let planId,renderId;
let downloadEventAt=null,automaticDownloadLatencyMs=null;
page.on('response',async r=>{if(r.request().method()!=='POST'||!r.url().startsWith(base+'/api/'))return;try{const j=await r.json();if(r.url().endsWith('/plan'))planId=j.id;if(r.url().endsWith('/render'))renderId=j.id;}catch{}});
const download=page.waitForEvent('download',{timeout:1200000}).then(d=>{downloadEventAt=Date.now();return{download:d};},e=>({downloadError:e.message}));
let result, manualDownload=false;
try{
  await page.goto(base);
  if(process.env.SAMPLE_PLAN){
    const plan=JSON.parse(await readFile(process.env.SAMPLE_PLAN,'utf8'));
    const response=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,quality:'full',mode:'live'})});
    const job=await response.json();if(!response.ok)throw Error(job.error||JSON.stringify(job));renderId=job.id;
    await page.getByRole('button',{name:'Render history'}).click();
    await page.locator('[data-job-id="'+renderId+'"]').click();
  }else if(process.env.SAMPLE_BUNDLED_EXAMPLE){
    await page.locator('input[value="dialogue-toon"]').check();
    await page.getByLabel('Tested example').selectOption(process.env.SAMPLE_BUNDLED_EXAMPLE);
    await page.getByRole('button',{name:/Try the tested demo/}).click();
    await page.getByRole('button',{name:/Render video \+ creator pack/}).click();
  }else if(process.env.SAMPLE_REVIEW_JOB_ID){
    renderId=process.env.SAMPLE_REVIEW_JOB_ID;
    await page.getByRole('button',{name:'Render history'}).click();
    await page.locator('[data-job-id="'+renderId+'"]').click();
    await page.getByRole('button',{name:'Review saved video again'}).click();
  }else if(process.env.SAMPLE_WATCH_JOB_ID){
    renderId=process.env.SAMPLE_WATCH_JOB_ID;
    await page.getByRole('button',{name:'Render history'}).click();
    await page.locator('[data-job-id="'+renderId+'"]').click();
    const initial=await(await fetch(base+'/api/jobs/'+renderId)).json();
    if(initial.status==='completed'){manualDownload=true;await page.getByRole('link',{name:'Download MP4'}).click();}
  }else if(process.env.SAMPLE_RETRY_JOB_ID){
    await page.getByRole('button',{name:'Render history'}).click();
    await page.locator('[data-job-id="'+process.env.SAMPLE_RETRY_JOB_ID+'"]').click();
    await page.getByRole('button',{name:/Render video \+ creator pack/}).click();
  }else{
  if(process.env.SAMPLE_MODE)await page.locator('input[value="'+process.env.SAMPLE_MODE+'"]').check();
  if(process.env.SAMPLE_STORY)await page.locator('#story').fill(process.env.SAMPLE_STORY);
  await page.getByLabel('Video length').selectOption('manual');
  await page.locator('#target-seconds').fill(process.env.SAMPLE_SECONDS||'10');
  await page.locator('#create-fps').selectOption({label:(process.env.SAMPLE_FPS||'60')+' fps'});
  if(process.env.SAMPLE_PROFILE)await page.getByLabel('Comedy direction').selectOption(process.env.SAMPLE_PROFILE);
  await page.getByRole('button',{name:/Generate comedy video/}).click();
  }
  const deadline=Date.now()+1200000;let last='';
  while(Date.now()<deadline){
    const id=renderId||planId;
    if(id){let response;try{response=await fetch(base+'/api/jobs/'+id);}catch{await new Promise(r=>setTimeout(r,2500));continue;}if(response.status===429){await new Promise(r=>setTimeout(r,3000));continue;}const job=await response.json();const status=job.status+': '+job.message+' '+job.progress;
      if(status!==last){console.log(status);last=status;}
      if(['failed','cancelled','interrupted'].includes(job.status)){result={ok:false,jobId:id,error:job.error};throw Error(job.error||job.message);}
      if(renderId&&job.status==='completed'){
        const d=await download;if(!d.download)throw Error('Automatic download failed: '+d.downloadError);
        const file=path.join(out,'downloaded-video.mp4');await d.download.saveAs(file);automaticDownloadLatencyMs=downloadEventAt===null?null:Date.now()-downloadEventAt;
        if(await d.download.failure())throw Error('Browser download was not completed.');
        const media=await fetch(base+`/api/files/${renderId}/video.mp4?download=1`);if(media.status!==200||!media.headers.get('content-disposition')?.includes('attachment'))throw Error('Download endpoint failed.');await media.arrayBuffer();
        for(const f of ['plan.json','render-report.json','encoded-quality-report.json','video-review.json','video-observations.json','sound-credits.json']){const r=await fetch(base+`/api/files/${renderId}/`+f);if(r.ok)await writeFile(path.join(out,f),await r.text());}
        result={ok:true,planId,renderId,automaticBrowserDownload:!manualDownload,automaticDownloadLatencyMs,downloadLatencyMetric:"browser download event to Playwright saveAs completion",bundledPreview:!!process.env.SAMPLE_BUNDLED_EXAMPLE,suppliedPlan:!!process.env.SAMPLE_PLAN,resumedExistingJob:!!(process.env.SAMPLE_WATCH_JOB_ID||process.env.SAMPLE_REVIEW_JOB_ID),reviewOnly:!!process.env.SAMPLE_REVIEW_JOB_ID,videoCreatedAt:job.videoCreatedAt,videoExpiresAt:job.videoExpiresAt,downloadedCopy:file};console.log('LIVE WEBSITE AND DOWNLOAD PASSED');break;
      }
    }
    const alert=await page.locator('[role=alert]').allTextContents();if(!id&&alert.length)throw Error(alert.join(' '));
    await new Promise(r=>setTimeout(r,2000));
  }
  if(!result?.ok)throw Error('Live website test timed out.');
}catch(e){console.error(e.message);process.exitCode=1;result||={ok:false,planId,renderId,error:e.message};await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await writeFile(path.join(out,'website-test.json'),JSON.stringify(result,null,2));await browser.close();}
