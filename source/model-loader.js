import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import assets from 'scl-assets';
export function createModelLoader(){
 const draco=new DRACOLoader().setDecoderPath(assets.draco).setDecoderConfig({type:'wasm'});
 const loader=new GLTFLoader().setDRACOLoader(draco);
 return {draco,load:name=>loader.loadAsync(assets[name]),metadata:async name=>{const r=await fetch(assets[name+'-metadata']);if(!r.ok)throw new Error('Workflow metadata unavailable');return r.json();}};
}
