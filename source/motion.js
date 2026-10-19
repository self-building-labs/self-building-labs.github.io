// Progressive enhancement: content stays readable without JS or observers.
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const active=new Set(),byElement=new WeakMap();
export function animateElement(element,keyframes,options={}){
 if(!element||reduced.matches||!element.animate)return;
 byElement.get(element)?.cancel();
 const animation=element.animate(keyframes,{duration:320,easing:'cubic-bezier(.2,.7,.2,1)',...options});
 byElement.set(element,animation);active.add(animation);
 const cleanup=()=>{active.delete(animation);if(byElement.get(element)===animation)byElement.delete(element);};
 animation.addEventListener('finish',cleanup,{once:true});animation.addEventListener('cancel',cleanup,{once:true});
 return animation;
}
export function enterPanel(element){animateElement(element,[{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:280});}
export function initPageMotion(){
 const elements=document.querySelectorAll('.story-heading,.section-heading,.concept-steps>li,.capability-details>article,.starting-points-grid>article,.outlook-section h2,.outlook-grid>article,.closing-section .section-wrap,.paradigm-comparison');
 if(!('IntersectionObserver' in window))return;
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){if(!entry.isIntersecting)continue;observer.unobserve(entry.target);animateElement(entry.target,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:480});}
 },{threshold:0,rootMargin:'0px 0px -24px 0px'});
 elements.forEach(e=>observer.observe(e));
}
reduced.addEventListener('change',()=>{if(reduced.matches)for(const animation of [...active])animation.cancel();});
