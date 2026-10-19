import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
async function checkRendered(page,canvas,label){
 const png=await canvas.screenshot();
 const stats=await page.evaluate(async base64=>{
  const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
  const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
  const {data}=ctx.getImageData(0,Math.min(100,c.height-1),c.width,Math.max(1,c.height-100));
  let sum=0,squares=0,clipped=0,count=0;
  for(let i=0;i<data.length;i+=16){const v=(data[i]+data[i+1]+data[i+2])/3;sum+=v;squares+=v*v;count++;if(Math.min(data[i],data[i+1],data[i+2])>=250)clipped++;}
  return {standardDeviation:Math.sqrt(squares/count-(sum/count)**2),clippedFraction:clipped/count};
 },png.toString('base64'));
 assert.ok(stats.standardDeviation>15,label+': scene must contain visible shaded geometry');
 assert.ok(stats.clippedFraction<.015,label+': highlights must retain detail');
 console.log(label,stats);
}
try{
 const page=await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(resolve('index.html')).href);
 assert.equal(await page.locator('a.resource').first().getAttribute('href'),'self-building-labs-arxiv.pdf');
 await page.locator('#tab-latest').click();
 await page.locator('#latest-workflow').scrollIntoViewIfNeeded();
 const frame=page.frameLocator('#latest-workflow');
 await frame.locator('canvas').waitFor({timeout:120000});
 await page.waitForTimeout(1500);
 const f=page.frames().find(f=>f.url().includes('xarm-workflow.html'));
 await f.waitForFunction(()=>!!window.sclViewer,{},{timeout:120000});
 console.log('LATEST',await f.evaluate(()=>({duration:sclViewer.duration,meshes:sclViewer.meshes,clips:sclViewer.clips,nodes:sclViewer.animatedNodes.filter(n=>/gantry|pipette|link/.test(n))})));
 assert.ok(await f.evaluate(()=>sclViewer.duration>157));
 assert.ok(await f.evaluate(()=>sclViewer.animatedNodes.some(n=>n.includes('pipette_left'))));
 await frame.locator('#play-toggle').click();
 await frame.locator('#timeline').fill('60');await page.waitForTimeout(300);
 await frame.locator('#viewer-shell').screenshot({path:'artifacts/latest-ot2.png'});
 await checkRendered(page,frame.locator('canvas'),'Opentrons');
 await frame.locator('[data-stage="xarm"]').click();
 await frame.locator('#timeline').fill('1280');await page.waitForTimeout(1500);
 await frame.locator('#viewer-shell').screenshot({path:'artifacts/latest-xarm.png'});
 await checkRendered(page,frame.locator('canvas'),'xArm');
 await page.locator('#tab-combined').click();
 await page.waitForFunction(()=>!!window.sclViewer,{},{timeout:120000});
 assert.equal(await page.evaluate(()=>sclViewer.duration),989);
 await page.locator('[data-stage=handover]').click();
 await page.locator('#timeline').fill('407');
 await page.locator('#viewer-shell').screenshot({path:'artifacts/refined-ur.png'});
 await checkRendered(page,page.locator('#viewport canvas'),'UR');
 await page.locator('#tab-latest').click();
 assert.equal(await page.locator('iframe[src^="http"]').count(),0);
 assert.equal((await page.content()).includes('100.64.254.6'),false);
 assert.equal(await page.locator('#fl-map .fl-well').count(),96);
 assert.equal(await page.locator('#fluorescence-results').count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#workflow').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/mobile.png'});
 assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASSED: PDF, both 3D workflows, revised continuous preparation replay, completed second-run OT2 replay, absence of private SDL2 embeds, mobile layout; no JavaScript errors.');
}finally{await browser.close();}
