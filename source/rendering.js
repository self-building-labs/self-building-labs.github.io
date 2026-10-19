import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';

// Work in linear light until the final output pass. AgX rolls bright metal
// reflections into the display range without bleaching the painted surfaces.
export function setupLighting(renderer,scene,{center,extent}) {
  renderer.toneMapping=THREE.AgXToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.04);
  room.dispose();pmrem.dispose();
  scene.environment=environment.texture;
  scene.environmentIntensity=1.0;
  scene.background=new THREE.Color('#e7ebee');
  const key=new THREE.DirectionalLight(0xfff8f0,2.6);
  key.target.position.copy(center);
  key.position.copy(center).add(new THREE.Vector3(-3.5,6,4));
  key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:22});
  key.shadow.bias=-.000025;key.shadow.normalBias=.0006;
  scene.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xe7efff,1.1);
  fill.position.copy(center).add(new THREE.Vector3(4,2,-3));
  fill.target.position.copy(center);
  scene.add(fill,fill.target);
  scene.add(new THREE.HemisphereLight(0xf4f7ff,0xb6bdc6,1.0));
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#d0d5da',roughness:.88,metalness:0}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.008;ground.receiveShadow=true;scene.add(ground);
  return environment;
}

export function finishMaterials(root,renderer) {
  const seen=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;object.receiveShadow=true;
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      if(seen.has(material))continue;seen.add(material);
      // Retain the source albedo and metal/plastic distinction. Roughness zero
      // creates mirror-like CAD surfaces; a small floor reflects real finishes.
      material.roughness=Math.max(material.roughness??.5,.2);
      material.envMapIntensity=1;
      for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(material[key])material[key].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      if(material.transmission>0) {
        material.thickness=.003;material.ior=1.5;
        object.castShadow=false;
      }
    }
  });
}

export function createPipeline(renderer,scene,camera) {
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  // Contact occlusion anchors feet, joints and equipment to their supports;
  // its radius is in scene meters, so it does not darken entire instruments.
  const ao=new SSAOPass(scene,camera,1,1,24);
  ao.kernelRadius=.06;ao.minDistance=.00002;ao.maxDistance=.002;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  const aa=new ShaderPass(FXAAShader);composer.addPass(aa);
  return {
    render:()=>composer.render(),
    resize(width,height){
      composer.setSize(width,height);
      const ratio=renderer.getPixelRatio();
      aa.material.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));
    },
    dispose(){ao.dispose();aa.dispose();composer.dispose();}
  };
}
