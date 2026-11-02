import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync('site-assets/manifest.json'));
let oldBytes=0,newBytes=0,views=0,images=0;const used=new Set(),hoods=new Set();
for(const name of ['workflow','latest-workflow','opentrons-replay','hplc-workflow','hplc-hood']){
 const original=fs.readFileSync(`source/assets/${name}.glb`);oldBytes+=original.length;
 const len=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+len)),bin=original.subarray(28+len);
 const file=manifest[name],dir=path.dirname(file),output=JSON.parse(fs.readFileSync(file));used.add(file);
 const imageViews=new Set((json.images||[]).map(x=>x.bufferView));
 const originalViews=json.bufferViews.map((v,i)=>imageViews.has(i)?null:hash(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))).filter(Boolean);
 const convertedViews=output.bufferViews.map(v=>{const f=path.join(dir,output.buffers[v.buffer].uri);used.add(f);const b=fs.readFileSync(f);return hash(b.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));});
 assert.deepEqual(convertedViews,originalViews,`${name}: binary payload changed`);views+=convertedViews.length;
 for(let i=0;i<(json.images||[]).length;i++){const v=json.bufferViews[json.images[i].bufferView];if(!v)continue;const f=path.join(dir,output.images[i].uri);used.add(f);assert.equal(hash(fs.readFileSync(f)),hash(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)));images++;}
 for(const key of ['nodes','scenes','animations','materials','textures'])assert.deepEqual(output[key],json[key],`${name}: ${key} changed`);
 for(const b of output.buffers)if(b.uri.startsWith('shared-hood'))hoods.add(b.uri);
}
assert.equal(hoods.size,1);
for(const file of used)newBytes+=fs.statSync(file).size;
assert.ok(newBytes<oldBytes);
console.log(JSON.stringify({passed:true,exactBinaryViews:views,exactImages:images,originalModelMiB:oldBytes/1048576,sharedModelMiB:newBytes/1048576,sharedHood:[...hoods]}));
