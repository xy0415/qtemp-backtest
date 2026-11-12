(()=>{
'use strict';
const root=document.getElementById('qtemp_root'),results=root?.querySelector('[data-q="results"]');
if(!results)return;
const block=document.createElement('section');
block.className='research-insights';block.hidden=true;
block.innerHTML='<div class="insights-panel" data-insight="event" hidden>'+
'<div class="insights-heading"><h3>訊號事件研究</h3><label>訊號類型 <select data-insight-select><option>低估值</option><option>高估值</option><option>底背離</option><option>頂背離</option></select></label></div>'+
'<div class="insights-meta" data-event-meta></div><div class="insights-legend"><span><i style="background:#6565e9"></i>平均</span><span><i style="background:#2f91d5"></i>中位數</span><span><i style="background:#cad0fc"></i>第10～90百分位</span></div>'+
'<div data-event-plot class="insights-chart"></div><p data-event-note class="insights-note"></p></div>'+
'<div class="insights-panel" data-insight="calendar" hidden>'+
'<div class="insights-heading"><h3>QTemp 訊號日曆</h3><div class="insights-calendar-controls"><button type="button" data-cal-prev>‹</button><strong data-cal-month></strong><button type="button" data-cal-next>›</button></div></div>'+
'<div class="insights-legend"><span><i style="background:#5d6bea"></i>低估值</span><span><i style="background:#e06887"></i>高估值</span><span><i style="background:#20a49b"></i>底背離</span><span><i style="background:#d99b49"></i>頂背離</span></div>'+
'<div class="insights-calendar" data-calendar-grid></div><p data-calendar-details class="insights-note">選擇有訊號的日期，可在 K 線圖檢視該日。</p></div>'+
'<div class="insights-panel" data-insight="quality" hidden>'+
'<div class="insights-heading"><h3>資料品質與回測可信度</h3><button type="button" data-quality-reload>重新查詢</button></div>'+
'<div data-quality-grid class="insights-quality-grid"></div><div class="insights-quality-notes" data-quality-notes></div></div>';
results.querySelector('.panel').before(block);
const $=s=>block.querySelector(s);
let dataset=null,waiting=null,month=null;
const colors={'低估值':'#5d6bea','高估值':'#e06887','底背離':'#20a49b','頂背離':'#d99b49'};
async function requestResearch(force=false){
 const symbol=root.querySelector('[data-q="symbol"]').value.trim().toUpperCase();
 if(!force&&dataset?.symbol===symbol)return dataset;
 if(waiting)return waiting;
 waiting=(async()=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),120000);
  try{
   const response=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({args:[symbol]}),signal:controller.signal});
   const value=await response.json();
   if(!response.ok||value.error)throw Error(value.error||'查詢失敗');
   dataset=value;if(!month)month=value.quality.end.slice(0,7);
   return value;
  }finally{clearTimeout(timeout);waiting=null}
 })();
 return waiting;
}
function plotEvent(points){
 const ns='http://www.w3.org/2000/svg',w=880,h=330,side=61,right=25,top=24,bottom=41;
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 '+w+' '+h);
 svg.setAttribute('role','img');svg.setAttribute('aria-label','訊號前後平均、中位與第10到90百分位價格報酬');
 const values=points.flatMap(p=>[p.mean,p.median,p.p10,p.p90]).filter(Number.isFinite);
 const min=Math.min(0,...values)-3,max=Math.max(0,...values)+3;
 const x=d=>side+(d+20)/140*(w-side-right);
 const y=v=>top+(max-v)/(max-min)*(h-top-bottom);
 const add=(name,attrs,txt)=>{
  const node=document.createElementNS(ns,name);
  Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
  if(txt!==undefined)node.textContent=String(txt);
  svg.append(node);
 };
 for(let i=0;i<=4;i++){
  const val=min+(max-min)*i/4,yy=y(val);
  add('line',{x1:side,x2:w-right,y1:yy,y2:yy,stroke:'#e9edf5'});
  add('text',{x:side-10,y:yy+4,'text-anchor':'end',fill:'#8793a5','font-size':12},val.toFixed(1)+'%');
 }
 [-20,0,20,40,60,80,100,120].forEach(d=>add('text',{x:x(d),y:h-11,'text-anchor':'middle','font-size':12,fill:'#8190a6'},d>0?'+'+d:d));
 add('line',{x1:x(0),x2:x(0),y1:top,y2:h-bottom,stroke:'#9cacc5','stroke-dasharray':'5 5'});
 const p90=points.map((p,i)=>(i?'L':'M')+x(p.day)+' '+y(p.p90)).join(' ');
 const p10=points.slice().reverse().map(p=>'L'+x(p.day)+' '+y(p.p10)).join(' ');
 add('path',{d:p90+' '+p10+' Z',fill:'#dbe0ff',opacity:.7});
 [['mean','#6565e9',2.8],['median','#2f91d5',2.5]].forEach(([key,color,width])=>{
  const path=points.map((p,i)=>(i?'L':'M')+x(p.day)+' '+y(p[key])).join(' ');
  add('path',{d:path,fill:'none',stroke:color,'stroke-width':width});
 });
 return svg;
}
function showEvent(){
 const target=$('[data-event-plot]');target.replaceChildren();
 const key=$('[data-insight-select]').value,g=dataset.eventStudy.groups[key];
 $('[data-event-meta]').textContent='完整樣本 '+g.sample+' 次 · 排除 '+g.excluded+' 次 · −20 至 +120 個交易日';
 if(g.points.length)target.append(plotEvent(g.points));
 else target.textContent='完整歷史視窗不足，無法繪製。';
 $('[data-event-note]').textContent=dataset.eventStudy.note;
}
function showCalendar(){
 const grid=$('[data-calendar-grid]');grid.replaceChildren();
 const [year,mo]=month.split('-').map(Number);
 const first=new Date(year,mo-1,1),length=new Date(year,mo,0).getDate(),start=(first.getDay()+6)%7;
 $('[data-cal-month]').textContent=year+' 年 '+String(mo).padStart(2,'0')+' 月';
 const lookup=new Map(dataset.calendar.map(x=>[x.day,x.signals]));
 ['一','二','三','四','五','六','日'].forEach(v=>{const d=document.createElement('span');d.className='insights-weekday';d.textContent=v;grid.append(d)});
 for(let i=0;i<start;i++)grid.append(document.createElement('span'));
 for(let day=1;day<=length;day++){
  const date=year+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  const labels=lookup.get(date)||[],button=document.createElement('button');
  button.type='button';button.className='insights-day';button.disabled=!labels.length;
  const text=document.createElement('span');text.textContent=day;button.append(text);
  const dots=document.createElement('div');dots.className='insights-dots';
  labels.forEach(label=>{const dot=document.createElement('i');dot.style.background=colors[label];dot.title=label;dots.append(dot)});
  button.append(dots);button.title=labels.length?date+' '+labels.join('、'):date;
  button.onclick=()=>{
   $('[data-calendar-details]').textContent=date+'：'+labels.join('、');
   globalThis.__qtempCalendarTarget=date;
   const link=root.querySelector('[data-route="chart"]');
   if(link)link.click();else location.hash='#chart';
   globalThis.QTempChart?.jumpToDate?.(date);
  };
  grid.append(button);
 }
}
function showQuality(){
 const area=$('[data-quality-grid]'),notes=$('[data-quality-notes]');
 area.replaceChildren();notes.replaceChildren();
 const q=dataset.quality,status={yahoo_live:'Yahoo 最新取得',verified_cache:'近期已驗證快取',stale_backup:'舊版歷史備份'};
 [
 ['資料來源',q.source],['資料查詢 UTC',q.queriedAt],['資料來源狀態',status[q.dataStatus]||q.dataStatus],
 ['資料取得時間',q.cachedAt||'—'],['行情時區',q.zone],
 ['資料期間',q.start+' 至 '+q.end],['日 K 數量',q.bars],
 ['缺失交易日',q.missingSessions===null?'無法估計':q.missingSessions],
 ['價格還原',q.adjClose],['QTemp 有效樣本',q.qtempSamples],
 ['暖機期交易日',q.warmupBars],['最早有效日期',q.firstValid],
 ['確認訊號數',q.confirmedSignals]
 ].forEach(([name,value])=>{
  const cell=document.createElement('div');cell.className='insights-quality-item';
  const label=document.createElement('span');label.textContent=name;
  const strong=document.createElement('strong');strong.textContent=value??'—';cell.append(label,strong);area.append(cell);
 });
 const p=document.createElement('p');p.textContent=q.status+'；'+q.calendarMethod+'。'+q.quoteNote;notes.append(p);
 if(q.missingSample.length){
  const missing=document.createElement('p');
  missing.textContent='缺失交易日：'+q.missingSample.join('、')+(q.missingTruncated?' …':'');
  notes.append(missing);
 }
 const note=document.createElement('p');note.textContent='訊號確認：'+q.signalRule;notes.append(note);
 if(q.dataStatus==='stale_backup'){
  const warn=document.createElement('p');warn.className='insights-alert';
  warn.textContent='注意：目前採用舊版已驗證歷史備份，不代表最新收盤資料。';notes.prepend(warn);
 }
}
async function show(tab){
 block.hidden=false;
 block.querySelectorAll('[data-insight]').forEach(node=>node.hidden=node.dataset.insight!==tab);
 const target=tab==='event'?$('[data-event-plot]'):tab==='calendar'?$('[data-calendar-grid]'):$('[data-quality-grid]');
 target.textContent='資料讀取中…';
 try{
  await requestResearch();
  if(tab==='event')showEvent();
  if(tab==='calendar')showCalendar();
  if(tab==='quality')showQuality();
 }catch(error){target.textContent='資料暫不可用：'+error.message}
}
document.addEventListener('qtemp-insight-show',e=>{
 const tab=e.detail?.tab;
 if(['event','calendar','quality'].includes(tab))show(tab);
 else block.hidden=true;
});
$('[data-insight-select]').onchange=()=>{if(dataset)showEvent()};
function moveMonth(offset){
 if(!month)return;
 const [year,mo]=month.split('-').map(Number);
 const d=new Date(year,mo-1+offset,1);
 month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 showCalendar();
}
$('[data-cal-prev]').onclick=()=>moveMonth(-1);
$('[data-cal-next]').onclick=()=>moveMonth(1);
$('[data-quality-reload]').onclick=()=>{dataset=null;month=null;show('quality')};
root.querySelector('[data-q="load"]').addEventListener('click',()=>{dataset=null;month=null});
})();
