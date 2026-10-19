import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve('index.html')).href);
 assert.equal(await page.locator('#tab-latest').getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('#panel-combined').isVisible(),false);
 const colors=await page.locator('.resource').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));assert.equal(colors[0],colors[1]);assert.notEqual(colors[0],'rgba(0, 0, 0, 0)');
 await page.locator('#latest-workflow').scrollIntoViewIfNeeded();
 const frame=await (await page.locator('#latest-workflow').elementHandle()).contentFrame();
 await frame.waitForFunction(()=>!!window.sclViewer,null,{timeout:120000});
 async function checkSeek(p){
  if(!await p.evaluate(()=>sclViewer.playing))await p.locator('#play-toggle').click();
  await p.locator('#timeline').fill('100');
  assert.equal(await p.evaluate(()=>sclViewer.playing),true);
  await p.waitForFunction(()=>sclViewer.time>100.2);
  await p.locator('#play-toggle').click();
  await p.locator('#timeline').fill('200');
  assert.equal(await p.evaluate(()=>sclViewer.playing),false);
  assert.equal(await p.evaluate(()=>sclViewer.time),200);
 }
 await checkSeek(frame);
 await page.locator('#tab-combined').click();
 await page.waitForFunction(()=>!!window.sclViewer,null,{timeout:120000});
 await checkSeek(page);assert.deepEqual(errors,[]);
 console.log('PASS: quantum dot default loads; matching resource buttons; both timelines preserve playing and paused states when seeking');
}finally{await browser.close();}
