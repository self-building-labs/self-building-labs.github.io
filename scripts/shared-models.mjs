import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex').slice(0,20);
// Lossless extraction: retain all scene/animation data and exact Draco payloads.
export async function sharedModels(root,write){
 const names=['workflow','latest-workflow','opentrons-replay','hplc-workflow','hplc-hood'];
 const models=[],pieces=new Map(),hoodKeys=new Set();let original=0;
 for(const name of names){
  const bytes=await fs.readFile(`${root}/source/assets/${name}.glb`);original+=bytes.length;
  const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size).toString()),bin=bytes.subarray(28+size);
  const images=new Set((json.images||[]).map(x=>x.bufferView).filter(x=>x!==undefined));
  const keys=json.bufferViews.map((v,i)=>{
   if(images.has(i))return null;
   const data=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),key=hash(data);
   if(!pieces.has(key))pieces.set(key,{data,owners:new Set()});pieces.get(key).owners.add(name);return key;
  });
  // Keep the detailed hood and the optimized hood parts in one reusable buffer.
  const hoodViews=new Set();
  for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[]){
   const material=json.materials?.[primitive.material]?.name||'';
   if(name==='hplc-hood'||material.startsWith('hood_')){
    const compressed=primitive.extensions?.KHR_draco_mesh_compression?.bufferView;
    if(compressed!==undefined)hoodViews.add(compressed);
    for(const a of [...Object.values(primitive.attributes||{}),primitive.indices].filter(x=>x!==undefined)){
     const v=json.accessors[a].bufferView;if(v!==undefined)hoodViews.add(v);
    }
   }
  }
  for(const i of hoodViews)if(keys[i])hoodKeys.add(keys[i]);
  for(const image of json.images||[])if(image.bufferView!==undefined){const v=json.bufferViews[image.bufferView],data=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);image.uri=await write('texture',data,image.mimeType==='image/jpeg'?'.jpg':'.png');delete image.bufferView;}
  models.push({name,json,keys});
 }
 const groups=new Map();
 for(const [key,p] of pieces){const group=hoodKeys.has(key)?'shared-hood':p.owners.size>1?'shared-geometry':[...p.owners][0];if(!groups.has(group))groups.set(group,[]);groups.get(group).push([key,p]);}
 for(const [name,items] of groups){let offset=0;const chunks=[];for(const [key,p] of items){p.offset=offset;chunks.push(p.data);offset+=p.data.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}}
  const uri=await write(name,Buffer.concat(chunks),'.bin');for(const [,p] of items){p.uri=uri;p.total=offset;}}
 const result={};
 for(const {name,json,keys} of models){const mapping=new Map(),views=[],buffers=[],bufferIds=new Map();
  json.bufferViews.forEach((v,i)=>{if(!keys[i])return;const p=pieces.get(keys[i]);if(!bufferIds.has(p.uri)){bufferIds.set(p.uri,buffers.length);buffers.push({uri:p.uri,byteLength:p.total});}mapping.set(i,views.length);views.push({...v,buffer:bufferIds.get(p.uri),byteOffset:p.offset});});
  const remap=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(k==='bufferView')x[k]=mapping.get(v);else remap(v);}};
  delete json.bufferViews;delete json.buffers;remap(json);json.bufferViews=views;json.buffers=buffers;
  result[name]=await write(name,Buffer.from(JSON.stringify(json)),'.gltf');
 }
 console.log('Source models:',(original/1048576).toFixed(1),'MiB; shared binary blocks:',[...pieces.values()].filter(p=>p.owners.size>1).length);
 return result;
}
