(()=>{
'use strict';
const root=document.getElementById('qtemp_root');if(!root)return;
const results=root.querySelector('[data-q="results"]');
const section=document.createElement('section');
section.className='qz-page';section.hidden=true;
section.innerHTML='<div class="qz-header"><div><span class="qz-kicker">QTEMP DISTRIBUTION</span><h2>QTemp 區間統計</h2><p>歷史交易日、年度熱力圖與目前分數</p></div><div class="qz-query"><label>分析標的 <input id="qz-symbol" maxlength="30" autocomplete="off" placeholder="MSTR / 2330.TW"></label><label>歷史期間 <select id="qz-period"><option value="1y">近 1 年</option><option value="3y">近 3 年</option><option value="5y">近 5 年</option><option value="10y" selected>近 10 年</option><option value="15y">近 15 年</option><option value="all">全部歷史</option></select></label><label>區間模式 <select id="qz-mode"><option value="fixed">固定 QTemp 分數</option><option value="percentile">歷史百分位</option></select></label><button type="button" class="primary" id="qz-refresh">查詢區間</button></div></div>'+
'<p id="qz-status" role="status">等待查詢</p><div id="qz-results" hidden>'+
'<div class="qz-metrics"><div class="qz-metric"><span>最新 QTemp</span><strong id="qz-current">—</strong></div><div class="qz-metric"><span>目前區間</span><strong id="qz-zone">—</strong></div><div class="qz-metric"><span>有效交易日</span><strong id="qz-sample">—</strong></div><div class="qz-metric"><span>已確認收盤日</span><strong id="qz-day">—</strong></div></div>'+
'<div class="qz-signal" id="qz-signal" hidden></div>'+
'<section class="qz-card"><div class="qz-card-head"><h3>歷史分數分布</h3><p>真實日 K 直方圖與經平滑的分布曲線；虛線代表目前位置</p></div><div class="qz-chart" id="qz-bell"></div></section>'+
'<section class="qz-card"><div class="qz-card-head"><h3>年度區間熱力圖</h3><p>依年份統計各 QTemp 區間的交易日數</p></div><div id="qz-heatmap" class="qz-overflow"></div></section>'+
'<section class="qz-card"><div class="qz-card-head"><h3>歷史區間天數與占比</h3><p>互斥區間 · 有效交易日 · 連續停留與進入次數</p></div><div id="qz-stats" class="qz-statstable"></div><div id="qz-highrisk" class="qz-highrisk"></div></section>'+
'<p class="qz-note" id="qz-note"></p></div>';
results.insertAdjacentElement('afterend',section);
const $=id=>document.getElementById(id);
const fmt=x=>Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
let activeSymbol='',cache=new Map(),busy=false;
function svgEl(svg,tag,attrs,text){
 const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const key of Object.keys(attrs))n.setAttribute(key,String(attrs[key]));
 if(text!==undefined)n.textContent=String(text);
 svg.append(n);return n;
}
function plotHistogram(data){
 const host=$('qz-bell');host.replaceChildren();
 const width=980,height=332,left=56,right=18,top=27,bottom=41;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('role','img');
 svg.setAttribute('aria-label','歷史 QTemp 分數直方圖、平滑密度與目前分數位置');
 const counts=data.histogram.counts,edges=data.histogram.edges;
 const max=Math.max(1,...counts),pos=v=>left+(v+100)/200*(width-left-right);
 const y=v=>top+(max*1.2-v)/(max*1.2)*(height-top-bottom);
 for(let i=0;i<=4;i++){
  const n=max*i/4;
  svgEl(svg,'line',{x1:left,x2:width-right,y1:y(n),y2:y(n),stroke:'#e9edf5'});
  svgEl(svg,'text',{x:left-9,y:y(n)+4,'font-size':12,'text-anchor':'end',fill:'#8491a9'},Math.round(n));
 }
 counts.forEach((count,i)=>{
  const center=(edges[i]+edges[i+1])/2;
  const color=center< -95?'#5960d6':center< -75?'#8a8be5':center< -35?'#78a8e5':
    center<=35?'#9da8b9':center<=75?'#48b5a7':center<95?'#e5ad72':'#d56886';
  svgEl(svg,'rect',{x:pos(edges[i])+1,y:y(count),width:Math.max(1,pos(edges[i+1])-pos(edges[i])-2),
   height:Math.max(0,y(0)-y(count)),rx:2,fill:color,opacity:.85});
 });
 const smooth=counts.map((_,i)=>{
  let sum=0,weights=0;counts.forEach((v,j)=>{
   const weight=Math.exp(-.5*Math.pow((i-j)/1.55,2));
   sum+=v*weight;weights+=weight;
  });return sum/weights;
 });
 const line=smooth.map((v,i)=>(i?'L':'M')+pos((edges[i]+edges[i+1])/2).toFixed(2)+' '+y(v).toFixed(2)).join(' ');
 svgEl(svg,'path',{d:line,fill:'none',stroke:'#555bdc','stroke-width':3.3,'stroke-linecap':'round','stroke-linejoin':'round'});
 [-100,-95,-75,-35,0,35,75,95,100].forEach(v=>
  svgEl(svg,'text',{x:pos(v),y:height-13,'text-anchor':'middle','font-size':v===0?13:11,fill:'#78869f'},v));
 const x=pos(Math.min(100,Math.max(-100,data.current.score)));
 svgEl(svg,'line',{x1:x,x2:x,y1:top,y2:height-bottom,stroke:'#313b9f','stroke-width':2.5,'stroke-dasharray':'6 5'});
 const label=Math.max(54,Math.min(width-54,x));
 svgEl(svg,'rect',{x:label-52,y:0,width:104,height:24,rx:9,fill:'#525bd5'});
 svgEl(svg,'text',{x:label,y:16,'text-anchor':'middle','font-size':12,fill:'#fff'},'目前 '+data.current.score.toFixed(2));
 host.append(svg);
}
function heatmap(data){
 const host=$('qz-heatmap');host.replaceChildren();
 const table=document.createElement('table');table.className='qz-grid';
 const head=table.createTHead().insertRow();
 const heading=document.createElement('th');heading.textContent='QTemp 區間';head.append(heading);
 data.annual.forEach(record=>{const cell=document.createElement('th');cell.textContent=record.year;head.append(cell)});
 const last=document.createElement('th');last.textContent='合計';head.append(last);
 const max=Math.max(1,...data.annual.flatMap(y=>Object.values(y.counts)));
 const body=table.createTBody();
 data.zones.forEach(zone=>{
  const row=body.insertRow(),first=row.insertCell();
  const dot=document.createElement('i');dot.className='qz-dot';dot.style.background=zone.color;
  first.append(dot,document.createTextNode(' '+zone.label));
  data.annual.forEach(record=>{
   const n=record.counts[zone.key]||0,cell=row.insertCell(),ratio=n/max;
   cell.textContent=n;
   if(n){cell.style.backgroundColor=zone.color;cell.style.opacity=String(.46+.54*ratio);
    cell.style.color=ratio>.42?'#fff':'#14223f';}
   else cell.style.background='#f2f5fb';
   cell.title=record.year+' 年 '+zone.label+'：'+n+' 日';
  });
  row.insertCell().textContent=fmt(zone.days);
 });
 host.append(table);
}
function dayCards(data){
 const host=$('qz-stats');host.replaceChildren();
 const stack=document.createElement('div');stack.className='qz-stacked';
 stack.setAttribute('role','img');stack.setAttribute('aria-label','歷史 QTemp 區間天數占比堆疊比例圖');
 data.zones.forEach(z=>{
  if(!z.days)return;
  const part=document.createElement('div');part.style.width=z.percent+'%';
  part.style.background=z.color;
  part.title=z.label+'：'+z.days+' 日（'+z.percent.toFixed(2)+'%）';
  if(z.key===data.current.zone)part.classList.add('qz-stacked-current');
  stack.append(part);
 });
 host.append(stack);
 const container=document.createElement('div');container.className='qz-overflow';
 const table=document.createElement('table');table.className='qz-stats-grid';
 const head=table.createTHead().insertRow();
 ['QTemp 區間','分數或百分位範圍','有效天數','占比','進入次數','平均持續','最長連續'].forEach(t=>{
  const th=document.createElement('th');th.textContent=t;head.append(th);
 });
 const body=table.createTBody();
 data.zones.forEach(z=>{
  const row=body.insertRow();
  if(z.key===data.current.zone)row.classList.add('qz-selected-row');
  const label=row.insertCell();const dot=document.createElement('i');
  dot.className='qz-dot';dot.style.background=z.color;
  label.append(dot,document.createTextNode(z.label));
  const values=[z.bounds,fmt(z.days)+' 天',z.percent.toFixed(2)+'%',fmt(z.entries)+' 次',
   z.entries?z.averageDays.toFixed(1)+' 日':'—',z.entries?fmt(z.longestDays)+' 日':'—'];
  values.forEach(v=>row.insertCell().textContent=v);
  if(z.leftCensored)row.title='所選期間的起點可能截斷原有的連續區間';
 });
 const foot=table.createTFoot().insertRow();foot.insertCell().textContent='合計';
 foot.insertCell().textContent='互斥分類';
 foot.insertCell().textContent=fmt(data.sample)+' 天';
 foot.insertCell().textContent=(data.zones.reduce((a,z)=>a+z.percent,0)).toFixed(2)+'%';
 for(let i=0;i<3;i++)foot.insertCell().textContent='—';
 container.append(table);host.append(container);
 const risk=$('qz-highrisk');risk.replaceChildren();
 const chip=document.createElement('div');chip.className='qz-risk-detail';
 if(data.current.highRisk100)chip.classList.add('qz-risk-current');
 const badge=document.createElement('strong');badge.textContent='100 分高風險極值';
 const info=document.createElement('span');
 info.textContent='歷史精確等於 100：'+fmt(data.highRisk.exact100Days)+' 天 · '+
  data.highRisk.exact100Percent.toFixed(2)+'%（已包含在「極端高估」內，不重複統計）';
 chip.append(badge,info);
 risk.append(chip);
}
function display(data){
 $('qz-results').hidden=false;
 $('qz-current').textContent=data.current.score.toFixed(2);
 $('qz-zone').textContent=data.current.label+(data.current.highRisk100?' · 100 分高風險':'');
 $('qz-zone').style.color=data.zones.find(z=>z.key===data.current.zone)?.color||'#35435d';
 $('qz-sample').textContent=fmt(data.sample)+' 天';
 $('qz-day').textContent=data.end;
 const signal=$('qz-signal'),confirmation=data.current.confirmation;
 signal.replaceChildren();signal.hidden=!confirmation;
 if(confirmation){
  const title=document.createElement('strong');title.textContent='當日已確認抄底訊號 · '+confirmation.signalNames.join('、');
  const value=document.createElement('b');value.textContent=fmt(confirmation.rawClose??confirmation.confirmedPrice);
  const note=document.createElement('p');note.textContent=confirmation.day+
    ' · 原始收盤參考價 '+fmt(confirmation.rawClose??confirmation.confirmedPrice)+
    '；Adj Close 還原收盤 '+fmt(confirmation.confirmedPrice)+'。'+confirmation.executionNote;
  signal.append(title,value,note);
 }
 plotHistogram(data);heatmap(data);dayCards(data);
 $('qz-note').textContent=data.source+' · '+(data.start||'—')+' 至 '+data.end+
   ' · '+(data.mode==='fixed'?'固定數值區間':'歷史百分位模式（同分平均排名）')+' · '+data.note;
 $('qz-status').textContent='統計完成 · '+data.symbol+' · '+fmt(data.sample)+' 日';
}
async function load(force=false){
 const symbol=$('qz-symbol').value.trim().toUpperCase();
 const period=$('qz-period').value,mode=$('qz-mode').value,key=[symbol,period,mode].join('|');
 if(!/^[A-Z0-9.^=_-]{1,30}$/.test(symbol)){$('qz-status').textContent='請輸入正確股票代號';return}
 if(busy)return;
 if(!force&&cache.has(key)){display(cache.get(key));return}
 busy=true;$('qz-refresh').disabled=true;$('qz-status').textContent='正在計算歷史 QTemp 區間…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{
  const response=await fetch('/api/zones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({args:[symbol,period,mode]}),signal:controller.signal});
  const data=await response.json();
  if(!response.ok||data.error)throw Error(data.error||'查詢失敗');
  cache.set(key,data);display(data);
 }catch(error){$('qz-status').textContent='統計失敗：'+(error.name==='AbortError'?'查詢逾時':error.message)}
 finally{clearTimeout(timer);busy=false;$('qz-refresh').disabled=false}
}
$('qz-refresh').onclick=()=>load(true);
$('qz-period').onchange=()=>load(true);
$('qz-mode').onchange=()=>load(true);
$('qz-symbol').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();load(true)}};
function show(){
 if(root.dataset.view!=='zones'){section.hidden=true;return}
 section.hidden=false;
 const symbol=root.querySelector('[data-q="symbol"]')?.value.trim().toUpperCase();
 if(symbol&&symbol!==activeSymbol){
  $('qz-symbol').value=symbol;activeSymbol=symbol;
 }
 load();
}
document.addEventListener('qtemp-zones-show',show);
if(root.dataset.view==='zones')show();
})();