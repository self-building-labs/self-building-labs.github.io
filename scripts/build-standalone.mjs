import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {sharedModels} from './shared-models.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'site-assets');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
const read=p=>fs.readFile(path.join(root,p));
const write=async(name,data,ext)=>{const file=`${name}-${createHash('sha256').update(data).digest('hex').slice(0,20)}${ext}`;await fs.writeFile(path.join(out,file),data);return file;};
const models=await sharedModels(root,write);
const manifest={};
for(const [name,file]of Object.entries(models))manifest[name]=`./site-assets/${file}`;
for(const name of ['workflow','latest-workflow','hplc-workflow'])manifest[`${name}-metadata`]='./site-assets/'+await write(name,await read(`source/assets/${name}.json`),'.json');
const dracoDir='draco-'+createHash('sha256').update(await read('source/vendor/draco/draco_decoder.wasm')).digest('hex').slice(0,12);
await fs.cp(path.join(root,'source/vendor/draco'),path.join(out,dracoDir),{recursive:true});manifest.draco=`./site-assets/${dracoDir}/`;
let fonts=(await read('source/vendor/fonts/fonts.css')).toString();
for(const m of [...fonts.matchAll(/url\(([^)]+)\)/g)])fonts=fonts.replace(m[0],`url(${await write('font',await read('source/vendor/fonts/'+m[1]),path.extname(m[1]))})`);
let css=(await read('source/style.css')).toString().replace(/@import url\([^;]+;/,fonts);
const cssFile=await write('style',Buffer.from(css),'.css'),refineFile=await write('refinement',await read('source/refinement.css'),'.css');
const bundled=await build({entryPoints:{app:'source/app.js',latest:'source/latest-app.js',hplc:'source/hplc-app.js'},absWorkingDir:root,bundle:true,format:'esm',splitting:true,outdir:out,entryNames:'[name]-[hash]',chunkNames:'shared-[hash]',platform:'browser',target:'es2022',minify:true,metafile:true,plugins:[{name:'asset-manifest',setup(b){b.onResolve({filter:/^scl-assets$/},()=>({path:'manifest',namespace:'scl'}));b.onLoad({filter:/.*/,namespace:'scl'},()=>({contents:`export default ${JSON.stringify(manifest)}`,loader:'js'}));}}]});
for(const [kind,source,destination,entry]of [['main','index','index','source/app.js'],['latest','latest','xarm-workflow','source/latest-app.js'],['hplc','hplc','hplc-workflow','source/hplc-app.js']]){
 let html=(await read(`source/${source}.html`)).toString().replace('href="style.css"',`href="site-assets/${cssFile}"`).replace('href="refinement.css"',`href="site-assets/${refineFile}"`).replace(/<script type="importmap">[\s\S]*?<\/script>/,'').replace(/<script type="module" src="[^"]+"><\/script>/,'');
 for(const m of [...html.matchAll(/(?:src|href)="((?:assets\/|favicon\.svg)[^"]*)"/g)])html=html.replaceAll(`"${m[1]}"`,`"site-assets/${await write(path.basename(m[1],path.extname(m[1])),await read('source/'+m[1]),path.extname(m[1]))}"`);
 const script=Object.entries(bundled.metafile.outputs).find(([,v])=>v.entryPoint===entry)[0];
 html=html.replace('</body>',`<script type="module" src="${script}"></script></body>`);await fs.writeFile(path.join(root,destination+'.html'),html);console.log(destination+'.html',Buffer.byteLength(html),'bytes');
}
// Version the iframe documents as well as their assets. Otherwise a browser can
// reuse an older viewer HTML document that still points at old model bundles.
let mainHtml=(await read('index.html')).toString();
for(const viewer of ['hplc-workflow.html','xarm-workflow.html']){
 const version=createHash('sha256').update(await read(viewer)).digest('hex').slice(0,12);
 mainHtml=mainHtml.replace(`data-src="${viewer}"`,`data-src="${viewer}?v=${version}"`);
}
await fs.writeFile(path.join(root,'index.html'),mainHtml);
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
