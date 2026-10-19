import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const file of ['xarm-workflow.html','index.html']){
 const page=await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'});
 await page.goto(pathToFileURL(resolve(file)).href);
 if(file==='index.html')await page.locator('#tab-combined').click();
 await page.waitForFunction(()=>!!window.sclViewer,null,{timeout:120000});
 const canvas=page.locator('#viewport canvas');await canvas.hover();
 const before=await page.evaluate(()=>sclViewer.cameraPosition);
 await page.mouse.wheel(0,-300);
 await page.waitForFunction(b=>Math.hypot(...sclViewer.cameraPosition.map((v,i)=>v-b[i]))>.01,before);
 await page.waitForTimeout(500);
 const inward=await page.evaluate(()=>sclViewer.cameraPosition);
 await page.mouse.wheel(0,300);
 await page.waitForFunction(b=>Math.hypot(...sclViewer.cameraPosition.map((v,i)=>v-b[i]))>.01,inward);
 const outward=await page.evaluate(()=>sclViewer.cameraPosition);
 assert.ok(inward.reduce((sum,v,i)=>sum+(v-before[i])*(outward[i]-v),0)<0,'Wheel directions must move camera in opposite directions');
 assert.equal(await page.evaluate(()=>sclViewer.autoCamera),false);
 console.log(`PASS ${file}: ordinary wheel zooms both directions and stops automatic camera movement`);
 await page.close();
 }
}finally{await browser.close();}
