import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {findBrowser} from '../server/browser.mjs';
const base='http://127.0.0.1:'+(process.env.PORT||3001);
const browser=await chromium.launch({executablePath:await findBrowser(),headless:true});
try{
 const page=await browser.newPage();let planningRequests=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/plan'))planningRequests++;});
 await page.goto(base);await page.locator('input[value="dialogue-toon"]').check();
 await page.getByRole('button',{name:/Generate comedy video/}).click();
 await page.getByRole('alert').waitFor();
 const message=await page.getByRole('alert').innerText();
 if(!/Cartesia API key/.test(message)||planningRequests)throw Error('Missing speech credentials must be reported before spending Gemini credits.');
 const plan=await(await fetch(base+'/api/example?name=dialogue')).json();
 const response=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,mode:'live'})});
 const result=await response.json();
 if(response.status!==400||!/Cartesia/.test(result.error))throw Error('Live dialogue render did not reject the missing speech provider.');
 await writeFile('docs/dialogue-prerequisites.json',JSON.stringify({checkedAt:new Date().toISOString(),browserMissingKeyMessage:message,planningRequests,liveRenderStatus:response.status,liveRenderError:result.error,liveSpeechVerified:false},null,2));
 console.log('Missing Cartesia: browser preflight and render API verified; zero planning requests.');
}finally{await browser.close();}
