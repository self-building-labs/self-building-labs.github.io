import {animateElement} from './motion.js';
import data from './assets/fluorescence-560.json';
const NS='http://www.w3.org/2000/svg';
const number=v=>Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:1}):'No reading';
function node(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
export function initFluorescence(){
 const root=document.querySelector('#fluorescence-plot');if(!root)return;
 const select=root.querySelector('#fl-timepoint'),map=root.querySelector('#fl-map');
 const wells=Object.keys(data.timepoints[0].values);
 const valid=data.timepoints.flatMap(t=>Object.entries(t.values).filter(([w,v])=>!t.excluded.includes(w)&&Number.isFinite(v)).map(([,v])=>v));
 const maximum=Math.ceil(Math.max(...valid)/100)*100;
 let selectedWell='H8',selectedTime=data.timepoints.length-1,lastCurveWell;
 const isValid=(t,w)=>Number.isFinite(t.values[w])&&!t.excluded.includes(w);
 data.timepoints.forEach((t,i)=>{const option=document.createElement('option');option.value=i;option.textContent=t.label;select.append(option);});select.value=selectedTime;
 map.append(document.createElement('span'));
 for(let c=1;c<=12;c++){const label=document.createElement('span');label.className='fl-grid-label';label.textContent=c;map.append(label);}
 const buttons=new Map();
 for(const row of 'ABCDEFGH'){
  const label=document.createElement('span');label.className='fl-grid-label';label.textContent=row;map.append(label);
  for(let col=1;col<=12;col++){
   const w=row+col,b=document.createElement('button');b.type='button';b.className='fl-well';b.textContent=w;b.dataset.well=w;
   b.addEventListener('click',()=>{selectedWell=w;render();});
   b.addEventListener('keydown',event=>{const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-12,ArrowDown:12}[event.key];if(!step)return;const i=wells.indexOf(w),next=i+step;if(next>=0&&next<wells.length){event.preventDefault();selectedWell=wells[next];render();buttons.get(selectedWell).focus();}});
   buttons.set(w,b);map.append(b);
  }
 }
 root.querySelector('#fl-scale-max').textContent=number(maximum)+' RFU';
 function axes(svg,{xmin,xmax,ymax,xLabel,yLabel,ticks,width=700,height=300}){
  const left=88,right=30,top=32,bottom=80;
  const x=v=>left+(v-xmin)/(xmax-xmin)*(width-left-right),y=v=>height-bottom-v/ymax*(height-top-bottom);
  svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  for(let i=0;i<=4;i++){const v=i*ymax/4;svg.append(node('line',{x1:left,y1:y(v),x2:width-right,y2:y(v),class:'fl-gridline'}),node('text',{x:left-10,y:y(v)+4,'text-anchor':'end',class:'fl-axis-text'},number(v)));}
  for(const [v,label] of ticks)svg.append(node('text',{x:x(v),y:height-bottom+30,'text-anchor':'middle',class:'fl-axis-text'},label));
  svg.append(node('text',{x:(width+left-right)/2,y:height-12,'text-anchor':'middle',class:'fl-axis-title'},xLabel),node('text',{transform:`translate(22 ${(height+top-bottom)/2}) rotate(-90)`,'text-anchor':'middle',class:'fl-axis-title'},yLabel));
  return {x,y,width,height,left,right,top,bottom};
 }
 function renderCurve(){
  const svg=root.querySelector('#fl-curve');
  const width=Math.max(520,svg.clientWidth||700);
  const wellMaximum=Math.max(100,Math.ceil(Math.max(0,...data.timepoints.filter(t=>isValid(t,selectedWell)).map(t=>t.values[selectedWell]))/100)*100);
  const a=axes(svg,{width,height:360,xmin:0,xmax:9,ymax:wellMaximum,xLabel:'Ambient baseline / time at 60 °C',yLabel:'Fluorescence (RFU)',ticks:data.timepoints.map((t,i)=>[i,i===0?(width<640?'Amb.':'Ambient'):t.label])});
  svg.setAttribute('aria-label',`${selectedWell}: 560 nm fluorescence across ten measurements`);
  const separator=(a.x(0)+a.x(1))/2;
  svg.append(node('line',{x1:separator,x2:separator,y1:a.top,y2:a.height-a.bottom,class:'fl-separator'}));
  let path='',connected=false;
  data.timepoints.forEach((t,i)=>{
   if(!isValid(t,selectedWell)){connected=false;return;}
   const px=a.x(i),py=a.y(t.values[selectedWell]);
   // Ambient is a separate temperature condition; do not connect it to the hold.
   if(i>=1){path+=(connected?'L':'M')+px+','+py;connected=true;}
  });
  const curve=node('path',{d:path,fill:'none',stroke:'#155eef','stroke-width':2.5});svg.append(curve);
  if(lastCurveWell!==undefined&&lastCurveWell!==selectedWell)animateElement(curve,[{opacity:.2},{opacity:1}],{duration:260});
  lastCurveWell=selectedWell;
  data.timepoints.forEach((t,i)=>{
   const value=t.values[selectedWell];if(!isValid(t,selectedWell))return;
   const circle=node('circle',{cx:a.x(i),cy:a.y(value),r:i===selectedTime?6:4,fill:i===0?'#fff':'#155eef',stroke:'#155eef','stroke-width':2});
   circle.append(node('title',{},`${selectedWell} · ${t.label}: ${number(value)} RFU at ${t.temperature_c} °C`));svg.append(circle);
  });
  const guide=node('line',{x1:a.x(selectedTime),x2:a.x(selectedTime),y1:a.top,y2:a.height-a.bottom,class:'fl-guide'});svg.prepend(guide);
  const hit=node('rect',{x:a.left,y:a.top,width:a.width-a.left-a.right,height:a.height-a.top-a.bottom,fill:'transparent'});
  function nearest(event){const box=svg.getBoundingClientRect(),px=(event.clientX-box.left)*a.width/box.width;return Math.max(0,Math.min(9,Math.round((px-a.left)/(a.width-a.left-a.right)*9)));}
  hit.addEventListener('pointermove',e=>showReadout(nearest(e)));
  hit.addEventListener('pointerleave',()=>showReadout(selectedTime));
  hit.addEventListener('click',e=>{selectedTime=nearest(e);select.value=selectedTime;render();});svg.append(hit);
 }
 function showReadout(i){const t=data.timepoints[i],v=t.values[selectedWell];root.querySelector('#fl-readout').textContent=`${selectedWell} · ${t.label} · ${isValid(t,selectedWell)?number(v)+' RFU':t.excluded.includes(selectedWell)?'Excluded measurement':'No reading'} · ${t.temperature_c} °C`;}
 function render(){
  const t=data.timepoints[selectedTime];
  for(const [well,b] of buttons){
   const value=t.values[well],good=isValid(t,well),fraction=good?value/maximum:0;
   b.style.background=good?`hsl(220 85% ${97-fraction*58}%)`:'';b.style.color=fraction>.55?'#fff':'#10234b';
   b.classList.toggle('fl-excluded',t.excluded.includes(well));b.classList.toggle('fl-missing',!Number.isFinite(value));
   b.setAttribute('aria-pressed',String(well===selectedWell));
   b.title=`${well}: ${number(value)} RFU${t.excluded.includes(well)?' (excluded)':''}`;
  }
  root.querySelector('#fl-well-heading').textContent=`Well ${selectedWell}`;
  root.querySelector('#fl-temperature-label').textContent=`Measured at ${t.temperature_c} °C`;
  showReadout(selectedTime);renderCurve();
 }
 select.addEventListener('change',()=>{selectedTime=Number(select.value);render();});
 render();
 function renderTemperature(){
 const svg=root.querySelector('#fl-temperature'),readings=data.temperature.readings;
 const hours=p=>(Date.parse(p.at)-Date.parse(data.temperature.started_at))/3600000;
 const end=Math.ceil(Math.max(...readings.map(hours)));
 const a=axes(svg,{xmin:0,xmax:end,ymax:80,xLabel:'Hours since heating began',yLabel:'Temperature (°C)',ticks:Array.from({length:Math.floor(end/2)+1},(_,i)=>[i*2,String(i*2)]),width:Math.max(640,svg.clientWidth||1100),height:300});
 svg.append(node('line',{x1:a.x(0),x2:a.x(end),y1:a.y(data.temperature.setpoint_c),y2:a.y(data.temperature.setpoint_c),class:'fl-setpoint'}));
 let path='',previous;
 for(const p of readings){
  const gap=!previous||(Date.parse(p.at)-Date.parse(previous.at)>90000)||p.phase==='timepoint'||previous.phase==='timepoint';
  path+=(gap?'M':'L')+a.x(hours(p))+','+a.y(p.c);previous=p;
  const dot=node('circle',{cx:a.x(hours(p)),cy:a.y(p.c),r:p.phase==='timepoint'?3:1.7,fill:'#155eef'});
  dot.append(node('title',{},`${hours(p).toFixed(2)} h: ${p.c} °C`));svg.append(dot);
 }
 svg.append(node('path',{d:path,fill:'none',stroke:'#155eef','stroke-width':2}));
 }
 renderTemperature();
 let lastWidth=root.clientWidth;
 new ResizeObserver(()=>{if(root.clientWidth===lastWidth)return;lastWidth=root.clientWidth;renderCurve();renderTemperature();}).observe(root);

}
