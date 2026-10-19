import {pageIsScrolling} from './interaction.js';
import {setupLighting,finishMaterials,createPipeline} from './rendering.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

// Camera poses originate from the USD scene. glTF changes Z-up to Y-up.
const up = ([x,y,z]) => new THREE.Vector3(x,z,-y);
const views = {
  overview: {position:[-7.6,-9.2,5.6], target:[-1.9,-1.5,1.1], label:'Full laboratory'},
  ur: {position:[-5.8,-5.7,2.65], target:[-3.9,-3.05,1.24], label:'UR3e + UR5e'},
  mobile: {position:[-6,-6.5,4], target:[-2.6,-2.1,1], label:'Mobile transport'},
  xarm: {position:[1.9,-2.8,2.35], target:[-.05,-.1,1.25], label:'xArm laboratory'}
};
const formatTime = value => `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;

export async function createViewer(status) {
  const viewport = document.querySelector('#viewport');
  const timeline = document.querySelector('#timeline');
  const playButton = document.querySelector('#play-toggle');
  const speed = document.querySelector('#speed');
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-label','Interactive 3D laboratory. Drag to orbit, Scroll to zoom, right-drag to pan. Arrow keys pan the camera; plus and minus zoom.');
  renderer.domElement.tabIndex = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .03, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.minDistance = .12;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI*.49;
  controls.listenToKeyEvents(renderer.domElement);
  renderer.domElement.addEventListener('keydown', event => {
    if (['+','=','-','_'].includes(event.key)) {
      event.preventDefault();
      camera.position.sub(controls.target).multiplyScalar(event.key==='-' || event.key==='_' ? 1.15 : .87).add(controls.target);
      controls.update();
    }
  });
  const environment=setupLighting(renderer,scene,{center:up([-2.8,-2,1.1]),extent:5});
  const loader = new GLTFLoader();
  const embedded = window.SCL_ASSETS;
  const decode = text => Uint8Array.from(atob(text),c=>c.charCodeAt(0)).buffer;
  // Pinned Three.js decoder hook: embedded worker libraries avoid file:// fetches.
  class LocalDracoLoader extends DRACOLoader {
    _loadLibrary(url,type) {
      if (!embedded) return super._loadLibrary(url,type);
      return Promise.resolve(type==='arraybuffer' ? decode(embedded.dracoWasm) : embedded.dracoJS);
    }
  }
  const draco = new LocalDracoLoader();
  draco.setDecoderPath('./vendor/draco/');
  loader.setDRACOLoader(draco);
  let gltf, metadata;
  try {
    if (embedded) {
      status.textContent = 'Preparing the embedded laboratory…';
      [gltf,metadata] = await Promise.all([loader.parseAsync(decode(embedded.model),''),Promise.resolve(embedded.workflow)]);
    } else {
      [gltf,metadata] = await Promise.all([
        loader.loadAsync('./assets/workflow.glb', progress => { status.textContent = progress.total ? `Loading original scene · ${Math.round(progress.loaded/progress.total*100)}%` : `Loading original scene · ${(progress.loaded/1048576).toFixed(1)} MB`; }),
        fetch('./assets/workflow.json').then(response=>{if(!response.ok)throw new Error('Workflow metadata unavailable');return response.json();})
      ]);
    }
  } catch (error) { controls.dispose(); environment.dispose(); renderer.dispose(); draco.dispose(); throw error; }
  draco.dispose();
  const posesOnly=metadata.mode==='poses';
  Object.assign(views,metadata.views||{});
  if(posesOnly){scene.environmentIntensity=.8;renderer.toneMappingExposure=1.1;}
  finishMaterials(gltf.scene,renderer);
  if(posesOnly)gltf.scene.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      // USD preview opacity was imported as transmission. Restore the source
      // thin-surface transparency instead of refracting the whole hood view.
      if(material.transmission>0){material.opacity=1-material.transmission;material.transmission=0;material.transparent=true;material.depthWrite=false;material.needsUpdate=true;object.castShadow=false;}
    }
  });
  scene.add(gltf.scene);
  const pipeline=createPipeline(renderer,scene,camera);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) {
    clip.duration = metadata.duration_s;
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);
    action.clampWhenFinished = true;
    action.play();
  }
  const duration = Math.round(Math.min(metadata.duration_s, Math.max(...gltf.animations.map(clip=>clip.duration),0))*1000)/1000;
  if (!duration) { controls.dispose(); environment.dispose(); renderer.dispose(); throw new Error('No recorded motion found in scene'); }
  timeline.max = duration;
  const total=document.querySelector('#time-total');if(total)total.textContent=formatTime(duration);
  const stageAt = value => {
    const phase=metadata.phases.find(p=>value>=p.start_s && value<p.end_s);
    if(posesOnly)return phase?.camera;
    if(metadata.chapters)return metadata.chapters.find(c=>value>=c.time_s&&value<c.end_s)?.id||metadata.chapters.at(-1).id;
    return phase?.camera==='dispenser'?'ur':phase?.camera||'ur';
  };
  let time = 0, playing = false, currentView = 'ur', inView = true, dirty = true, previousStage;
  const follow = document.querySelector('#follow-workflow');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let cameraInitialized = false, cameraTransition = false;
  const desiredPosition = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
  function stopAutoCamera() { follow.checked = false; cameraTransition = false; }
  renderer.domElement.addEventListener('keydown',event=>{
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','=','-','_'].includes(event.key)) stopAutoCamera();
  });
  function setView(name,{immediate=false}={}) {
    if(!views[name])return;
    currentView = name;
    const view = views[name];
    camera.fov=Math.max(view.fov||36,viewport.clientWidth<600?48:28);camera.updateProjectionMatrix();
    // Clear residual drag inertia before handing the camera back to a preset.
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    desiredPosition.copy(up(view.position));
    desiredTarget.copy(up(view.target));
    cameraTransition = cameraInitialized && !reducedMotion.matches && !posesOnly && !immediate;
    if (!cameraTransition) {
      camera.position.copy(desiredPosition);
      controls.target.copy(desiredTarget);
      controls.update();
    }
    cameraInitialized = true; dirty = true;
    document.querySelector('#camera-label').textContent = view.label;
    document.querySelectorAll('[data-camera]').forEach(button => { const selected = button.dataset.camera === name; button.classList.toggle('active',selected); button.setAttribute('aria-pressed',String(selected)); });
  }
  function setPlaying(value) {
    playing = posesOnly?false:value;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label',playing?'Pause simulation':'Play simulation');
  }
  function seek(value) {
    time = posesOnly?THREE.MathUtils.clamp(Math.round(value),0,5):THREE.MathUtils.clamp(value,0,duration);
    const excluded=(metadata.excluded_intervals||[]).find(r=>time>=r.start_s&&time<r.end_s);
    if(excluded)time=excluded.end_s;
    mixer.setTime(time);
    renderer.shadowMap.needsUpdate = true;dirty = true;
    timeline.value = time;
    timeline.setAttribute('aria-valuetext',`${formatTime(time)} of ${formatTime(duration)}`);
    document.querySelector('#time-current').textContent = formatTime(time);
    const stage = stageAt(time);
    const phaseCamera=metadata.phases.find(p=>time>=p.start_s && time<p.end_s)?.camera||'shaker';
    if (follow.checked && phaseCamera !== previousStage) setView(phaseCamera);
    previousStage = phaseCamera;
    document.querySelectorAll('[data-stage]').forEach(button=>button.classList.toggle('active',button.dataset.stage===stage));
    const phase = metadata.phases.find(phase=>time>=phase.start_s && time<phase.end_s);
    document.querySelector('#phase-label').textContent = phase ? phase.name.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()) : 'Workflow complete';
  }
  seek(metadata.initial_time_s||0);setView(posesOnly?'overview':'ur');setPlaying(!posesOnly);
  if(posesOnly){document.querySelector('#viewer-shell .playback').hidden=true;}
  controls.addEventListener('change',()=>{dirty=true;});
  controls.addEventListener('start',stopAutoCamera);
  follow.addEventListener('change',()=>{if(follow.checked)setView(metadata.phases.find(p=>time>=p.start_s&&time<p.end_s)?.camera||stageAt(time));else cameraTransition=false;});
  viewport.prepend(renderer.domElement);
  document.querySelector('.viewer-poster').hidden = true;
  document.querySelector('#viewer-launch').hidden = true;
  for (const selector of ['.camera-controls','.orbit-hint','#viewport-label']) document.querySelector(selector).hidden = false;
  for (const element of [timeline,playButton,speed]) element.disabled = false;
  document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{follow.checked=false;setView(button.dataset.camera);}));
  document.querySelector('#reset-camera').addEventListener('click',()=>setView(currentView));
  playButton.addEventListener('click',()=> { if(time>=duration)seek(0);setPlaying(!playing); });
  timeline.addEventListener('input',()=> {seek(Number(timeline.value));});
  const resize = new ResizeObserver(()=>{
    const {width,height} = viewport.getBoundingClientRect();
    renderer.setSize(width,height);camera.aspect=width/height;camera.fov=Math.max(views[currentView].fov||36,width<600?48:28);camera.updateProjectionMatrix();pipeline.resize(width,height);dirty=true;
  });
  resize.observe(viewport);
  const intersection = new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;},{threshold:0});
  intersection.observe(viewport);
  let last = performance.now();
  renderer.setAnimationLoop(now=>{
    const elapsed = Math.min((now-last)/1000,.1);last=now;
    if(document.hidden || !inView || pageIsScrolling())return;
    if(playing){seek(time+elapsed*Number(speed.value));if(time>=duration)seek(0);}
    if (cameraTransition) {
      const blend = 1 - Math.exp(-2 * elapsed);
      camera.position.lerp(desiredPosition, blend);
      controls.target.lerp(desiredTarget, blend);
      if (camera.position.distanceToSquared(desiredPosition)<.000001 &&
          controls.target.distanceToSquared(desiredTarget)<.000001) cameraTransition=false;
      dirty=true;
    }
    controls.update();
    if(dirty || playing){pipeline.render();dirty=false;}
  });
  renderer.domElement.addEventListener('webglcontextlost', event=>{
    event.preventDefault();setPlaying(false);
    document.querySelector('#phase-label').textContent='3D graphics interrupted. Reload the page to restore the viewer.';
  });
  // Exposed read-only diagnostics make it possible to verify an actual animated scene.
  window.sclViewer = {get sourceRevision(){return metadata.scene_sha256;},get currentView(){return currentView;},get playing(){return playing;},get excludedIntervals(){return metadata.excluded_intervals||[];},get mode(){return metadata.mode||'replay';},get cameraPosition(){return camera.position.toArray();},get autoCamera(){return follow.checked;},get time(){return time;},get duration(){return duration;},get clips(){return gltf.animations.length;},get meshes(){let n=0;gltf.scene.traverse(o=>{if(o.isMesh)n++;});return n;}};
  return {seek,setView,setPlaying};
}
