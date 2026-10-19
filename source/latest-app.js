import {createViewer} from './latest-viewer.js';
let viewer;
const status=document.querySelector('#loading-status');
async function load(){try{viewer=await createViewer(status);}catch(error){console.error(error);status.textContent='The interactive scene could not load. Reload to retry.';}}
load();
document.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>{if(viewer){viewer.seek(Number(b.dataset.time));viewer.setView(b.dataset.stage,{immediate:true});document.querySelector('#speed').value=b.dataset.stage==='ot2'?'8':'1';viewer.setPlaying(true);}}));
document.querySelector('#fullscreen').addEventListener('click',()=>{const shell=document.querySelector('#viewer-shell');if(document.fullscreenElement)document.exitFullscreen();else shell.requestFullscreen?.();});
window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='workflow-visibility'&&viewer)viewer.setPlaying(event.data.visible);});
