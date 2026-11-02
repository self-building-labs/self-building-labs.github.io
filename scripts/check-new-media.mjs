import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.route('**/*workflow.html',r=>r.abort());
 await page.goto(process.env.BASE_URL||'http://localhost:8877/');
 assert.equal(await page.locator('video').count(),4);
 const evidence=[];
 for(const [id,duration] of [['hplc-video',170.5],['robochem-video',150.3]]){
  const video=page.locator('#'+id);await video.evaluate(v=>{v.preload='auto';v.load();});
  await page.waitForFunction(id=>document.getElementById(id).readyState>=2,id);
  const meta=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));assert.ok(Math.abs(meta.duration-duration)<.2);assert.equal(meta.width,1920);assert.equal(meta.height,1080);
  for(const t of [1,50,duration-2]){await video.evaluate((v,t)=>v.currentTime=t,t);await page.waitForFunction(id=>{const v=document.getElementById(id);return !v.seeking&&v.readyState>=2;},id);assert.equal(await video.evaluate(v=>v.error),null);}
  await video.evaluate(v=>{v.currentTime=0;return v.play();});await page.waitForFunction(id=>document.getElementById(id).currentTime>.2,id);await video.evaluate(v=>v.pause());evidence.push({id,...meta});
 }
 console.log(JSON.stringify({passed:true,media:evidence}));
}finally{await browser.close();}
