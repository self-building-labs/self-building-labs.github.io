import {pathToFileURL} from 'node:url';
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
 await page.goto(pathToFileURL(resolve('index.html')).href);
 const videos=page.locator('video');assert.equal(await videos.count(),2);
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>Number.isFinite(v.duration)),{},{timeout:60000});
 const durations=await videos.evaluateAll(vs=>vs.map(v=>v.duration));assert.ok(durations[0]>150&&durations[0]<152);assert.ok(durations[1]>530&&durations[1]<531);
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
 console.log(JSON.stringify({passed:true,film_duration_s:durations[0],real_duration_s:durations[1],seeking:true,playback:true}));
}finally{await browser.close();}
