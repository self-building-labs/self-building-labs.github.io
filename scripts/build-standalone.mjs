import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
// Bundle the editable sources; visitors need no Node runtime.
const require=createRequire(new URL('../package.json',import.meta.url));
const {build}=require('esbuild');
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFile(path.join(root,p));
const mime=p=>({'.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json'}[path.extname(p)]||'application/octet-stream');
const dataURL=async p=>`data:${mime(p)};base64,${(await read(p)).toString('base64')}`;
let css=await fs.readFile(path.join(root,'source/style.css'),'utf8');
const fonts=await fs.readFile(path.join(root,'source/vendor/fonts/fonts.css'),'utf8');
let embeddedFonts=fonts;
for(const match of fonts.matchAll(/url\(([^)]+)\)/g))embeddedFonts=embeddedFonts.replace(match[0],`url(${await dataURL('source/vendor/fonts/'+match[1])})`);
css=css.replace(/@import url\([^;]+;/,embeddedFonts);
for(const kind of (process.argv.includes('--latest-only')?['latest']:['main','latest'])){
 const latest=kind==='latest';
 let html=(await read(latest?'source/latest.html':'source/index.html')).toString();
 html=html.replace(/<link rel="stylesheet" href="style.css">/,()=>`<style>${css}</style>`).replace(/<script type="importmap">[\s\S]*?<\/script>/,'').replace(/<script type="module" src="[^"]+"><\/script>/,'');
 for(const match of [...html.matchAll(/(?:src|href)="((?:assets\/|favicon\.svg)[^"]*)"/g)])html=html.replaceAll(`"${match[1]}"`,`"${await dataURL('source/'+match[1])}"`);
 const assets={model:(await read(`source/assets/${latest?'latest-workflow':'workflow'}.glb`)).toString('base64'),workflow:JSON.parse(await read(`source/assets/${latest?'latest-workflow':'workflow'}.json`)),dracoJS:(await read('source/vendor/draco/draco_wasm_wrapper.js')).toString(),dracoWasm:(await read('source/vendor/draco/draco_decoder.wasm')).toString('base64')};
 if(latest)assets.opentronsModel=(await read('source/assets/opentrons-replay.glb')).toString('base64');
 const bundled=await build({entryPoints:[path.join(root,`source/${latest?'latest-app':'app'}.js`)],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false,legalComments:'inline',nodePaths:[path.join(root,'node_modules')]});
 const payload=JSON.stringify(assets).replaceAll('<','\\u003c');
 html=html.replace('</body>',()=>`<script>window.SCL_ASSETS=${payload};</script><script>${bundled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body>`);
 const output=latest?'xarm-workflow.html':'index.html';await fs.writeFile(path.join(root,output),html);console.log(output,(Buffer.byteLength(html)/1048576).toFixed(1),'MB');
}
