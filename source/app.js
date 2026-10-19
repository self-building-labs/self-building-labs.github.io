import {initPageMotion,enterPanel} from './motion.js';
import {initFluorescence} from './fluorescence.js';
let viewer;
let pending;
async function loadViewer() {
  if (viewer) return viewer;
  if (pending) return pending;
  const button = document.querySelector('#load-viewer');
  const status = document.querySelector('#loading-status');
  button.disabled = true;
  button.textContent = 'Loading your laboratory…';
  pending = import('./viewer.js').then(({createViewer}) => createViewer(status)).then(result => {
    viewer = result;
    return result;
  }).catch(error => {
    console.error('3D viewer:', error);
    status.textContent = 'The 3D scene could not load. Check WebGL support and your connection, then retry.';
    button.textContent = 'Retry 3D view';
    button.hidden = false;
    button.disabled = false;
    pending = null;
    throw error;
  });
  return pending;
}
document.querySelector('#load-viewer').addEventListener('click', () => { loadViewer().catch(() => {}); });
document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', async () => {
  try { const v = await loadViewer(); v.seek(Number(button.dataset.time)); v.setView(button.dataset.view||button.dataset.stage,{immediate:true}); v.setPlaying(true); } catch {}
}));
document.querySelector('#fullscreen').addEventListener('click', async () => {
  const shell = document.querySelector('#viewer-shell');
  if (!shell.requestFullscreen) return;
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await shell.requestFullscreen(); } catch (error) { console.warn('Fullscreen unavailable', error); }
});
if (!document.querySelector('#viewer-shell').requestFullscreen) document.querySelector('#fullscreen').hidden = true;

// Automatically load before the scene enters view; playback starts when ready.
const autoLoad = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) {
    autoLoad.disconnect();
    loadViewer().catch(() => {});
  }
}, {rootMargin:'250px'});


const tabs=[...document.querySelectorAll('[data-workflow]')];
function selectWorkflow(name){
 const changed=document.querySelector(`[data-workflow="${name}"]`).getAttribute("aria-selected")!=="true";
 for(const tab of tabs){const selected=tab.dataset.workflow===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.querySelector('#panel-'+tab.dataset.workflow).hidden=!selected;}
 if(changed)enterPanel(document.querySelector('#panel-'+name));
 const latestFrame=document.querySelector('#latest-workflow');
 if(name==='latest'&&!latestFrame.getAttribute('src'))latestFrame.src=latestFrame.dataset.src;
 document.querySelector('#latest-workflow').contentWindow.postMessage({type:'workflow-visibility',visible:name==='latest'},'*');
 if(name==='combined')loadViewer().then(v=>v.setPlaying(preparationMode==='animation')).catch(()=>{});else if(viewer)viewer.setPlaying(false);
}
for(const tab of tabs){tab.addEventListener('click',()=>selectWorkflow(tab.dataset.workflow));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectWorkflow(tabs[index].dataset.workflow);tabs[index].focus();}});}

autoLoad.observe(document.querySelector('#viewer-shell'));
initFluorescence();
initPageMotion();

const preparationMode='animation';
selectWorkflow('latest');

// Inform embedded viewers of page scrolling, at most once per 80 ms.
let lastScrollNotice=0;
window.addEventListener('scroll',()=>{
 const now=performance.now();if(now-lastScrollNotice<80)return;lastScrollNotice=now;
 for(const frame of document.querySelectorAll('#latest-workflow,#equipment-inspection')){
  if(frame.getAttribute('src'))frame.contentWindow.postMessage({type:'page-scrolling'},'*');
 }
},{passive:true});
