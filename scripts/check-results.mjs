import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('source/assets/fluorescence-560.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const external=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>{external.push(r.request().url());return r.abort();});
 // The 3D viewers are checked separately; keep this check focused on the results.
 await page.route('**/xarm-workflow.html',r=>r.abort());
 await page.goto(pathToFileURL(resolve('index.html')).href);
 await page.locator('#results').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('#fl-map .fl-well').count(),96);
 assert.equal(await page.locator('#fl-timepoint option').count(),10);
 assert.equal(await page.locator('#results iframe').count(),0);
 const text=await page.locator('#results').innerText();assert.ok(!/absorbance|data quality|download|source records/i.test(text));assert.match(text,/560 nm/);
 await page.locator('[data-well="B3"]').click();
 assert.equal(await page.locator('#fl-well-heading').innerText(),'Well B3');
 assert.match(await page.locator('#fl-readout').innerText(),new RegExp(String(data.timepoints[9].values.B3)+' RFU'));
 await page.locator('#fl-timepoint').selectOption('0');
 assert.match(await page.locator('#fl-readout').innerText(),new RegExp(String(data.timepoints[0].values.B3)+' RFU'));
 assert.match(await page.locator('[data-well="C2"]').getAttribute('class'),/fl-excluded/);
 await page.locator('[data-well="C2"]').click();assert.match(await page.locator('#fl-readout').innerText(),/Excluded measurement/);
 await page.locator('[data-well="B3"]').click();
 await page.locator('#fl-curve').hover({position:{x:150,y:100}});assert.match(await page.locator('#fl-readout').innerText(),/RFU/);
 await page.locator('#fl-timepoint').selectOption('9');
 assert.equal(await page.locator('#fluorescence-plot > section:last-child').getAttribute('class'),'fl-panel fl-temperature-panel');
 await page.locator('#results').screenshot({path:'artifacts/fluorescence-560-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#results').scrollIntoViewIfNeeded();
 await page.locator('#results').screenshot({path:'artifacts/fluorescence-560-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,emission_nm:560,wells:96,timepoints:10,rawValues:true,exclusions:true,temperatureLast:true,noCopiedDashboard:true,mobile:true,externalRequests:external}));
}finally{await browser.close();}
