import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {createModelLoader} from './model-loader.js';
import {setupLighting,finishMaterials,createPipeline} from './rendering.js';
import {pageIsScrolling} from './interaction.js';
import referenceMaterials from './assets/reference-materials.json';
const $=selector=>document.querySelector(selector);
const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const up=([x,y,z])=>new THREE.Vector3(x,z,-y);
const views={
 overview:{position:[2.25,-3.3,2.95],target:[-.15,0,1.28]},
 drawer:{position:[-.905,-1.259,1.681],target:[-.491,-.436,1.292]},
 plate:{position:[1.1,-1.5,2.2],target:[-.2,.1,1.1]}
};
let active=true;
window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='workflow-visibility')active=event.data.visible;});
async function init(){
 const {load,metadata:loadMetadata,draco}=createModelLoader();
 const [gltf,hood,metadata]=await Promise.all([load('hplc-workflow'),load('hplc-hood'),loadMetadata('hplc-workflow')]);
 draco.dispose();
 const viewport=$('#viewport'),timeline=$('#timeline'),play=$('#play-toggle'),follow=$('#follow-workflow');
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;
 renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','HPLC laboratory. Drag to orbit, scroll or use plus and minus to zoom, arrow keys to pan.');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.02,80);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.15;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;controls.listenToKeyEvents(renderer.domElement);
 // Reuse the existing viewers' material palette while retaining authored texture maps.
 const aliases={xarm_factory_white:'WarmWhiteEnamel',xarm_factory_metal:'silver',cytation_cover:'warm_white_molded_polymer',ot2_white:'white.001'};
 const referenceByBase=new Map(Object.entries(referenceMaterials).map(([name,value])=>[name.replace(/\.\d+$/,''),value]));
 const matchedMaterials=new Set();
 for(const model of [gltf.scene,hood.scene])model.traverse(object=>{
  if(!object.isMesh)return;
  for(const material of Array.isArray(object.material)?object.material:[object.material]){
   const name=aliases[material.name]||material.name;
   const ref=referenceMaterials[name]||referenceByBase.get(name.replace(/\.\d+$/,''));
   if(!ref)continue;
   material.color.fromArray(ref.color);material.roughness=ref.roughness;material.metalness=ref.metalness;matchedMaterials.add(material);
  }
 });
 // Smooth curved CAD housings while retaining sharp mechanical edges.
 let smoothedMeshes=0;
 gltf.scene.traverse(object=>{
  if(!object.isMesh||!object.geometry.attributes.position)return;
  let parent=object;
  while(parent&&!/^(link[1-5]|ft_tool|carriage)$/.test(parent.name))parent=parent.parent;
  if(parent){
   // The helper hashes at 0.01 units; use millimetres to avoid merging distinct small CAD features.
   const input=object.geometry.clone();input.scale(1000,1000,1000);
   const normals=toCreasedNormals(input,Math.PI/3).getAttribute('normal');
   const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
   geometry.setAttribute('normal',normals);object.geometry=geometry;smoothedMeshes++;
  }
 });
 // Only the shared renderer supplies the ground and lighting.
 const importedGround=gltf.scene.getObjectByName('Ground');if(importedGround)importedGround.visible=false;
 setupLighting(renderer,scene,{center:up([.25,0,1.1]),extent:2.5});finishMaterials(gltf.scene,renderer);finishMaterials(hood.scene,renderer);hood.scene.name="Fume hood";scene.add(gltf.scene,hood.scene);
 const pipeline=createPipeline(renderer,scene,camera),mixer=new THREE.AnimationMixer(gltf.scene);
 for(const clip of gltf.animations){const action=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();}
 const duration=metadata.duration_s;timeline.max=duration;$('#time-total').textContent=format(duration);
 let time=0,playing=false,dirty=true,inView=true,currentView='overview',lastChapter=-1;
 const chapters=[{start:0,view:'drawer',label:'Opening the HPLC drawer'},{start:363.35,view:'plate',label:'Picking up the plate from the OT-2'},{start:496.42,view:'drawer',label:'Loading and releasing the plate'},{start:584.37,view:'drawer',label:'Closing the HPLC drawer'}];
 function setView(name){currentView=name;camera.position.copy(up(views[name].position));controls.target.copy(up(views[name].target));controls.update();dirty=true;document.querySelectorAll('[data-camera]').forEach(b=>{b.classList.toggle('active',b.dataset.camera===name);b.setAttribute('aria-pressed',String(b.dataset.camera===name));});}
 function setPlaying(value){playing=value;play.textContent=playing?'Ⅱ':'▶';play.setAttribute('aria-label',playing?'Pause simulation':'Play simulation');}
 function seek(value){time=THREE.MathUtils.clamp(value,0,duration);mixer.setTime(time);timeline.value=time;timeline.setAttribute('aria-valuetext',`${format(time)} of ${format(duration)}`);$('#time-current').textContent=format(time);const chapter=chapters.findLastIndex(c=>time>=c.start);if(chapter!==lastChapter){if(follow.checked)setView(chapters[chapter].view);lastChapter=chapter;$('#phase-label').textContent=chapters[chapter].label;document.querySelectorAll('.hplc-stages button').forEach((b,i)=>b.classList.toggle('active',i===chapter));}renderer.shadowMap.needsUpdate=true;dirty=true;}
 viewport.prepend(renderer.domElement);$('.viewer-poster').hidden=true;$('#viewer-launch').hidden=true;$('.camera-controls').hidden=false;
 for(const e of [timeline,play,$('#speed')])e.disabled=false;
 document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{follow.checked=false;setView(b.dataset.camera);}));
 document.querySelectorAll('.hplc-stages button').forEach(b=>b.addEventListener('click',()=>{seek(Number(b.dataset.time));setView(b.dataset.view);setPlaying(true);}));
 $('#reset-camera').addEventListener('click',()=>setView(currentView));controls.addEventListener('start',()=>follow.checked=false);controls.addEventListener('change',()=>dirty=true);
 follow.addEventListener('change',()=>{if(follow.checked)setView(chapters[lastChapter].view);});
 renderer.domElement.addEventListener('keydown',e=>{if(['+','=','-','_'].includes(e.key)){e.preventDefault();follow.checked=false;camera.position.sub(controls.target).multiplyScalar(['-','_'].includes(e.key)?1.15:.87).add(controls.target);controls.update();}});
 timeline.addEventListener('input',()=>seek(Number(timeline.value)));play.addEventListener('click',()=>{if(time>=duration)seek(0);setPlaying(!playing);});
 $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#viewer-shell').requestFullscreen?.();}catch{}});
 const resize=new ResizeObserver(()=>{const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.fov=width<600?54:36;camera.updateProjectionMatrix();pipeline.resize(width,height);dirty=true;});resize.observe(viewport);
 new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;}).observe(viewport);
 seek(0);setView('overview');setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
 let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;if(document.hidden||!active||!inView)return;if(pageIsScrolling()&&!dirty)return;if(playing){seek(time+dt*Number($('#speed').value));if(time>=duration)setPlaying(false);}controls.update();if(dirty){pipeline.render();dirty=false;}});
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setPlaying(false);$('#phase-label').textContent='3D graphics interrupted. Reload this page to restore the viewer.';});
 window.sclViewer={seek,setPlaying,setView,get currentView(){return currentView;},get time(){return time;},get playing(){return playing&&active;},duration,clips:gltf.animations.length,get meshes(){let n=0;gltf.scene.traverse(o=>{if(o.isMesh)n++;});return n;},get animatedNodes(){return gltf.animations.flatMap(c=>c.tracks.map(t=>t.name));},get pose(){return gltf.animations.flatMap(c=>c.tracks).filter(t=>t.name.endsWith(".position")).slice(0,30).map(t=>gltf.scene.getObjectByName(t.name.slice(0,-9))?.position.toArray());},get smoothedMeshes(){return smoothedMeshes;},get referenceMaterialCount(){return matchedMaterials.size;},get hoodMeshes(){let n=0;hood.scene.traverse(o=>{if(o.isMesh)n++;});return n;},get bounds(){return new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).toArray();}};
}
init().catch(error=>{console.error(error);$('#loading-status').textContent='The HPLC scene could not load. Reload to retry.';const retry=$('#load-viewer');retry.hidden=false;retry.textContent='Reload 3D view';retry.addEventListener('click',()=>location.reload());});
