import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
let total=0,max={name:'',bytes:0};
for(const name of new Set(files)){
 const file=path.join(root,name);if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
 const bytes=fs.statSync(file).size;total+=bytes;if(bytes>max.bytes)max={name,bytes};
 assert.ok(bytes<=100*1024*1024,`${name} exceeds GitHub's 100 MiB file limit`);
}
let references=0;
for(const name of ['index.html','xarm-workflow.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8').split('<script>window.SCL_ASSETS=')[0];
 for(const match of html.matchAll(/(?:src|href|poster|data-src)="([^"]+)"/g)){
  const ref=match[1];if(/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(ref))continue;
  assert.ok(fs.existsSync(path.resolve(root,decodeURIComponent(ref.split(/[?#]/)[0]))),`${name}: missing ${ref}`);references++;
 }
}
assert.ok(total<1e9,'Repository working files exceed the 1 GB Pages site limit');
for(const name of ['self-building-labs-v8.mp4','sbl_full_web_corrected.mp4'])assert.ok(files.includes(name),`${name} is excluded from Git`);
console.log(JSON.stringify({passed:true,localReferences:references,workingFilesMB:+(total/1e6).toFixed(1),largestFile:max.name,largestFileMB:+(max.bytes/1e6).toFixed(1)},null,2));
