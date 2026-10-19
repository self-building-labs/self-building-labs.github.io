import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const metadata=JSON.parse(fs.readFileSync('source/assets/workflow.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve('index.html')).href);
 await page.locator('#tab-combined').click();
 await page.locator('#viewer-shell').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>!!window.sclViewer,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>sclViewer.duration),989);
 assert.equal(await page.evaluate(()=>sclViewer.sourceRevision),metadata.scene_sha256);
 assert.deepEqual(await page.evaluate(()=>sclViewer.excludedIntervals),[]);
 assert.equal(await page.locator('.current-stock-steps button').count(),7);
 if(await page.evaluate(()=>sclViewer.playing))await page.locator('#play-toggle').click();
 await page.locator('#follow-workflow').uncheck();
 for(const chapter of metadata.chapters){
  await page.locator('#timeline').fill(String(chapter.time_s));
  assert.equal(await page.evaluate(()=>sclViewer.playing),false);
  await page.locator(`[data-stage="${chapter.id}"]`).click();
  await page.waitForFunction(t=>sclViewer.playing&&sclViewer.time>t+.1,chapter.time_s);
  const state=await page.evaluate(()=>({time:sclViewer.time,camera:sclViewer.cameraPosition,view:sclViewer.currentView}));
  assert.ok(state.time<chapter.time_s+5);
  assert.equal(state.view,chapter.camera);
  const v=metadata.views[chapter.camera].position;
  assert.ok(Math.hypot(...state.camera.map((x,i)=>x-[v[0],v[2],-v[1]][i]))<.001,'Chapter camera must jump immediately');
  assert.match(await page.locator(`[data-stage="${chapter.id}"]`).getAttribute('class'),/active/);
  await page.locator('#play-toggle').click();
  console.log('PASS chapter:',chapter.label,state.time.toFixed(2));
 }
 // The newly supplied handover must be reachable, including its actual grasp.
 for(const time of [22,407,624,655,912,950]){
  await page.locator('#timeline').fill(String(time));
  assert.equal(await page.evaluate(()=>sclViewer.time),time);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#follow-workflow').check();
 for(const [time,name] of [[22,'dispensing'],[407,'handover'],[950,'shaker']]){
  await page.locator('#timeline').fill(String(time));
  await page.locator('#viewer-shell').screenshot({path:`artifacts/vial-revision-${name}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: new 989-second replay, seven working chapter jumps and camera positions, handover enabled, mobile layout, no runtime errors');
}finally{await browser.close();}
