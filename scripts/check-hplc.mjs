import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.setDefaultTimeout(90000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL||'http://localhost:8877/');
 await page.locator('#tab-hplc').click();const frame=page.frameLocator('#hplc-workflow');
 await frame.locator('canvas').waitFor({timeout:180000});
 const f=page.frames().find(f=>f.url().includes('hplc-workflow.html'));
 await f.waitForFunction(()=>!!window.sclViewer,null,{timeout:180000});
 const info=await f.evaluate(()=>({duration:sclViewer.duration,hoodMeshes:sclViewer.hoodMeshes,meshes:sclViewer.meshes,clips:sclViewer.clips,tracks:sclViewer.animatedNodes.length,bounds:sclViewer.bounds}));
 assert.equal(info.duration,834.4);assert.ok(info.meshes>20);assert.ok(info.hoodMeshes>0);assert.ok(info.clips>0);assert.ok(info.tracks>10);
 await f.evaluate(()=>{sclViewer.setPlaying(false);sclViewer.seek(0);});
 await frame.locator('[data-camera=overview]').click();await page.waitForTimeout(1000);await frame.locator('#viewer-shell').screenshot({path:'artifacts/hplc-overview.png'});
 const poses=[];
 for(const t of [100,300,450,560,800]){
  await f.evaluate(t=>{sclViewer.setPlaying(false);sclViewer.seek(t);},t);await page.waitForTimeout(250);
  poses.push(await f.evaluate(()=>sclViewer.pose));
  if(t===560)await frame.locator('#viewer-shell').screenshot({path:`artifacts/hplc-${t}.png`});
 }
 assert.notDeepEqual(poses[0],poses[1]);assert.notDeepEqual(poses[2],poses[3]);
 await frame.locator('.hplc-stages button').nth(2).click();await f.waitForFunction(()=>sclViewer.time>496.5);await page.locator('#tab-latest').click();await f.waitForFunction(()=>!sclViewer.playing);
 await page.locator('#tab-hplc').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#tab-latest').getAttribute('aria-selected'),'true');
 await page.locator('[data-open-workflow=hplc]').click();assert.equal(await page.locator('#panel-hplc').isVisible(),true);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:390,height:844});await page.locator('#workflow').scrollIntoViewIfNeeded();await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/hplc-mobile.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,...info}));
}finally{await browser.close();}
