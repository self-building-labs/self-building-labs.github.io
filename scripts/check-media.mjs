import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/xarm-workflow.html',r=>r.abort());
 await page.addInitScript(()=>{window.IntersectionObserver=class{observe(){}disconnect(){}}});
 await page.goto((process.env.BASE_URL||'http://localhost:8877/'));
 const videos=page.locator('video');assert.equal(await videos.count(),4);
 await videos.evaluateAll(vs=>vs.forEach(v=>{v.preload='metadata';v.load();}));
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>Number.isFinite(v.duration)),{},{timeout:60000});
 const durations=await videos.evaluateAll(vs=>Object.fromEntries(vs.map(v=>[v.id,v.duration])));assert.ok(durations['paper-video']>150&&durations['paper-video']<152);assert.ok(durations['real-video']>530&&durations['real-video']<531);assert.ok(Math.abs(durations['hplc-video']-170.5)<.2);assert.ok(Math.abs(durations['robochem-video']-150.3)<.2);
 assert.match(await page.locator('#real-video-figure figcaption').innerText(),/4× speed/);
 const real=page.locator('#real-video');
 assert.deepEqual(await real.evaluate(v=>[v.videoWidth,v.videoHeight]),[1920,1080]);
 await real.scrollIntoViewIfNeeded();
 await real.evaluate(v=>{v.currentTime=120;});
 await page.waitForFunction(()=>{const v=document.querySelector('#real-video');return !v.seeking&&v.readyState>=2;});
 await real.evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('#real-video').currentTime>120.2);await real.evaluate(v=>v.pause());
 await page.locator('#sim2real').screenshot({path:'artifacts/videos.png'});
 for(const time of [0,120,300,480,528]){await real.evaluate((v,t)=>{v.currentTime=t;},time);await page.waitForFunction(()=>{const v=document.querySelector('#real-video');return !v.seeking&&v.readyState>=2;});assert.equal(await real.evaluate(v=>v.error),null);}
 assert.equal(await real.evaluate(v=>v.error),null);
 console.log(JSON.stringify({passed:true,durations,seeking:true,playback:true}));
}finally{await browser.close();}
