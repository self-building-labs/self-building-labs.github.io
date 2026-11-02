import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://localhost:8877/';
const files=fs.readdirSync('site-assets');
const targets=['shared-hood-','shared-geometry-','texture-','font-','shared-'].map(prefix=>'site-assets/'+files.find(f=>f.startsWith(prefix)));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext(),cached=[];
 for(let pass=0;pass<2;pass++){
  const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  cdp.on('Network.responseReceived',({response})=>{if(response.fromDiskCache)cached.push(response.url);});
  await page.goto(base+'site-assets/'+files.find(f=>f.startsWith('favicon-')));
  await page.evaluate(async urls=>{for(const url of urls){const r=await fetch(url);if(!r.ok)throw new Error(url);await r.arrayBuffer();}},targets.map(f=>base+f));
  await page.close();
 }
 for(const target of targets)assert.ok(cached.includes(base+target),'Not cached: '+target);
 console.log(JSON.stringify({passed:true,cachedAcrossPages:targets}));
}finally{await browser.close();}
