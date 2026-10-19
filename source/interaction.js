let scrollUntil=0;
const markScroll=()=>{scrollUntil=performance.now()+140;};
window.addEventListener('scroll',markScroll,{passive:true});
window.addEventListener('message',event=>{
 if(event.source===parent&&event.data?.type==='page-scrolling')markScroll();
});
export function pageIsScrolling(){return performance.now()<scrollUntil;}
