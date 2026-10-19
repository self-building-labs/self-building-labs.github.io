import {pageIsScrolling} from './interaction.js';
import {setupLighting,finishMaterials,createPipeline} from './rendering.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

// Camera poses originate from the USD scene. glTF changes Z-up to Y-up.
const up = ([x,y,z]) => new THREE.Vector3(x,z,-y);
const views = {
  overview: {position:[-1.5,-2.8,3.1], target:[.3,-.02,1.1], label:'Quantum dot laboratory'},
  ot2: {position:[-.75,-.75,1.72], target:[-.36,.32,1.16], label:'Opentrons liquid handling'},
  mobile: {position:[-6,-6.5,4], target:[-2.6,-2.1,1], label:'Mobile transport'},
  xarm: {position:[-1.5,-2.8,3.1], target:[.3,-.02,1.1], label:'xArm plate workflow'}
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
  const environment=setupLighting(renderer,scene,{center:up([.25,0,1.1]),extent:2.5});
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
  let gltf, metadata,opentrons;
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
    opentrons=await loader.parseAsync(decode(embedded.opentronsModel),'');
  } catch (error) { controls.dispose(); environment.dispose(); renderer.dispose(); draco.dispose(); throw error; }
  draco.dispose();
  finishMaterials(gltf.scene,renderer);
  finishMaterials(opentrons.scene,renderer);
  scene.add(gltf.scene,opentrons.scene);
  const pipeline=createPipeline(renderer,scene,camera);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) {
    clip.duration = metadata.xarm_clip_duration_s;
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);
    action.clampWhenFinished = true;
    action.play();
  }
  const ot2Duration=metadata.opentrons.run_duration_s;
  const ot2Mixer=new THREE.AnimationMixer(opentrons.scene);
  for(const clip of opentrons.animations){clip.duration=metadata.opentrons.clip_duration_s;const action=ot2Mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();}
  const duration=metadata.duration_s;
  timeline.max=duration;timeline.min=0;
  document.querySelector('#time-total').textContent=formatTime(duration);
  document.querySelector('[data-stage=xarm]').dataset.time=ot2Duration;
  let time = 0, playing = false, currentView = 'ot2', inView = true, dirty = true, previousStage;
  const follow = document.querySelector('#follow-workflow');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let cameraInitialized = false, cameraTransition = false, orbitTime = 0;
  const desiredPosition = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3(), orbitAxis = new THREE.Vector3(0,1,0);
  function stopAutoCamera() { follow.checked = false; cameraTransition = false; }
  renderer.domElement.addEventListener('keydown',event=>{
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','=','-','_'].includes(event.key)) stopAutoCamera();
  });
  function setView(name,{immediate=false}={}) {
    currentView = name;
    const view = views[name];
    // Clear residual drag inertia before handing the camera back to a preset.
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    orbitTime = 0;
    desiredPosition.copy(up(view.position));
    desiredTarget.copy(up(view.target));
    cameraTransition = cameraInitialized && !reducedMotion.matches && !immediate;
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
    playing = value;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label',playing?'Pause simulation':'Play simulation');
  }
  function seek(value) {
    time = THREE.MathUtils.clamp(value,0,duration);
    const ot2Active=time<ot2Duration;
    opentrons.scene.visible=ot2Active;gltf.scene.visible=!ot2Active;
    if(ot2Active)ot2Mixer.setTime(time/ot2Duration*metadata.opentrons.clip_duration_s);
    else mixer.setTime(metadata.xarm_clip_start_s+time-ot2Duration);
    renderer.shadowMap.needsUpdate = true;dirty = true;
    timeline.value = time;
    timeline.setAttribute('aria-valuetext',`${formatTime(time)} of ${formatTime(duration)}`);
    document.querySelector('#time-current').textContent = formatTime(time);
    const stage = time < ot2Duration ? 'ot2' : 'xarm';
    if (follow.checked && stage !== previousStage) setView(stage);
    previousStage = stage;
    document.querySelectorAll('[data-stage]').forEach(button=>button.classList.toggle('active',button.dataset.stage===stage));
    const phase = metadata.phases.find(phase=>time>=phase.start_s && time<phase.end_s);
    document.querySelector('#phase-label').textContent = phase ? phase.name.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()) : 'Workflow complete';
  }
  setView('ot2'); seek(0);setPlaying(true);
  controls.addEventListener('change',()=>{dirty=true;});
  controls.addEventListener('start',stopAutoCamera);
  follow.addEventListener('change',()=>{if(follow.checked)setView(time<ot2Duration?'ot2':'xarm');else cameraTransition=false;});
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
    renderer.setSize(width,height);camera.aspect=width/height;camera.fov=width<600?54:36;camera.updateProjectionMatrix();pipeline.resize(width,height);dirty=true;
  });
  resize.observe(viewport);
  const intersection = new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;},{threshold:0});
  intersection.observe(viewport);
  let last = performance.now();
  renderer.setAnimationLoop(now=>{
    const elapsed = Math.min((now-last)/1000,.1);last=now;
    if(document.hidden || !inView || pageIsScrolling())return;
    if(playing){seek(time+elapsed*Number(speed.value));if(time>=duration)seek(0);}
    // A bounded sweep keeps the working side of the robots in view. Its rate
    // uses real elapsed time, independently of simulation playback speed.
    const orbiting = follow.checked && playing && currentView==='xarm' && !reducedMotion.matches;
    if (orbiting) {
      orbitTime += elapsed;
      const view = views[currentView];
      desiredTarget.copy(up(view.target));
      orbitOffset.copy(up(view.position)).sub(desiredTarget);
      orbitOffset.applyAxisAngle(orbitAxis, .28 * Math.sin(orbitTime * Math.PI / 32));
      desiredPosition.copy(desiredTarget).add(orbitOffset);
    }
    if (cameraTransition || orbiting) {
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
  window.sclViewer = {get playing(){return playing;},get currentView(){return currentView;},get opentronsRun(){return metadata.opentrons.source_run;},get opentronsDuration(){return ot2Duration;},get opentronsVisible(){return opentrons.scene.visible;},get pipettePosition(){opentrons.scene.updateMatrixWorld(true);return opentrons.scene.getObjectByName('pipette_left')?.getWorldPosition(new THREE.Vector3()).toArray();},get animatedNodes(){return [...gltf.animations,...opentrons.animations].flatMap(c=>c.tracks.map(t=>t.name));},get cameraPosition(){return camera.position.toArray();},get autoCamera(){return follow.checked;},get time(){return time;},get duration(){return duration;},get clips(){return gltf.animations.length;},get meshes(){let n=0;gltf.scene.traverse(o=>{if(o.isMesh)n++;});return n;}};
  return {seek,setView,setPlaying};
}
