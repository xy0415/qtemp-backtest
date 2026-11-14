(()=>{'use strict';
const root=document.getElementById('qtemp_root'),target=root?.querySelector('[data-addon="2"]');
if(!target)return;
target.innerHTML='<div class="dc-heading"><h3>多資產相對績效研究</h3><p>相同交易期間 · Adj Close 還原 · 可自訂長期回測與投資組合</p></div>'+
'<div class="dc-form">'+
'<label>比較標的（最多 4 檔）<input id="dc-symbols" value="SOXL,MRVL,COHR" placeholder="SOXL,MRVL,COHR"></label>'+
'<label>比較基準<select id="dc-benchmark"><option>SPY</option><option>QQQ</option><option>SOXX</option></select></label>'+
'<label>回測時間<select id="dc-period"><option value="1y">近 1 年</option><option value="3y">近 3 年</option><option value="5y">近 5 年</option><option value="10y" selected>近 10 年</option><option value="15y">近 15 年</option><option value="all">全部可用歷史</option><option value="custom">自訂日期</option></select></label>'+
'<label class="dc-date" hidden>起始日期<input type="date" id="dc-from"></label>'+
'<label class="dc-date" hidden>結束日期<input type="date" id="dc-to"></label>'+
'<label>權重（％，依標的順序）<input id="dc-weights" placeholder="空白代表等權，例如 50,25,25"></label>'+
'<label>再平衡<select id="dc-rebalance"><option value="none">買入持有</option><option value="monthly">每月</option><option value="quarterly">每季</option><option value="annual">每年</option></select></label>'+
'<button type="button" class="primary" id="dc-run">分析比較</button></div>'+
'<div class="dc-status" id="dc-status" role="status">設定標的與時間範圍後開始分析。</div>'+
'<div id="dc-results" hidden><div class="dc-overview" id="dc-overview"></div>'+
'<nav class="dc-tabs" aria-label="比較分析子分頁">'+
'<button type="button" data-dc-tab="performance" aria-selected="true">績效總覽</button>'+
'<button type="button" data-dc-tab="returns">報酬走勢</button>'+
'<button type="button" data-dc-tab="drawdowns">歷史回撤</button>'+
'<button type="button" data-dc-tab="correlation">相關性分析</button>'+
'<button type="button" data-dc-tab="portfolio">投資組合</button>'+
'</nav><div id="dc-panel" class="dc-panel"></div>'+
'<p id="dc-notes" class="dc-notes"></p></div>';
const $=id=>document.getElementById(id);
let data=null,active='performance',chartMode='nav',busy=false;
const fmt=(v,digits=2)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const pct=(v)=>v==null?'—':fmt(v*100)+'%';
const names={
 totalReturn:'總報酬',cagr:'CAGR',volatility:'年化波動率',maxDrawdown:'最大回撤',
 sharpe:'Sharpe',sortino:'Sortino',calmar:'Calmar',winRate:'正報酬日勝率',
 bestYear:'最佳年度',worstYear:'最差年度',maxUnderwaterDays:'最長水下期間',recoveryDays:'最深回撤恢復期間',
 beta:'Beta',alpha:'年化 Jensen Alpha',trackingError:'追蹤誤差',informationRatio:'資訊比率'
};
const fractionKeys=new Set(['totalReturn','cagr','volatility','maxDrawdown','winRate','bestYear','worstYear','alpha','trackingError']);
function table(columns,rows){
 const scroller=document.createElement('div');scroller.className='dc-scroll';
 const el=document.createElement('table'),head=el.createTHead().insertRow();
 columns.forEach(col=>{const th=document.createElement('th');th.textContent=col;head.append(th)});
 const body=el.createTBody();
 rows.forEach(row=>{const tr=body.insertRow();row.forEach(v=>{const td=tr.insertCell();td.textContent=v==null?'—':String(v)})});
 scroller.append(el);return scroller;
}
function button(label,fn){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;
}
function section(heading,description=''){
 const box=document.createElement('section');box.className='dc-section';
 const header=document.createElement('div');header.className='dc-section-head';
 const h=document.createElement('h4');h.textContent=heading;header.append(h);
 if(description){const p=document.createElement('p');p.textContent=description;header.append(p)}
 box.append(header);return box;
}
const seriesColors=['#6268e5','#28aa9b','#d78c53','#c470a9','#536478','#383f9f'];
function downsample(points,limit=1000){
 if(points.length<=limit)return points;
 const positions=new Set([0,points.length-1]);
 for(let j=0;j<limit;j++)positions.add(Math.round(j*(points.length-1)/(limit-1)));
 return [...positions].sort((a,b)=>a-b).map(i=>points[i]);
}
function svgChart(series,ylabel,options={}){
 const W=1050,H=370,L=79,R=25,T=29,B=54;
 const wrap=document.createElement('div');wrap.className='dc-chart-wrap';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('role','img');
 svg.setAttribute('aria-label','橫軸日期，縱軸'+ylabel+'的多資產折線比較');
 const filtered=series.filter(s=>s.points.length>=2).map(s=>({...s,points:downsample(s.points)}));
 if(!filtered.length){wrap.textContent='資料不足，無法繪製圖表';return wrap}
 const merged=filtered.flatMap(s=>s.points);
 const dates=merged.map(p=>Date.parse(p[0]+'T00:00:00Z')).filter(Number.isFinite);
 const tx=Math.min(...dates),end=Math.max(...dates),dateSpan=end-tx||1;
 const values=merged.map(p=>p[1]).filter(v=>v!=null&&Number.isFinite(v)&&(!options.log||v>0));
 if(!values.length){wrap.textContent='沒有可繪製的有效數值';return wrap}
 const transform=v=>options.log?Math.log(v):v;
 let low=Math.min(...values.map(transform)),high=Math.max(...values.map(transform));
 if(options.zero&&!options.log){low=Math.min(0,low);high=Math.max(0,high)}
 const range=high-low||1;low-=range*.07;high+=range*.07;
 const xx=day=>L+(Date.parse(day+'T00:00:00Z')-tx)/dateSpan*(W-L-R);
 const yy=v=>T+(high-transform(v))/(high-low)*(H-T-B);
 function el(name,attrs,text){
  const node=document.createElementNS('http://www.w3.org/2000/svg',name);
  Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
  if(text!==undefined)node.textContent=String(text);
  svg.append(node);return node;
 }
 for(let i=0;i<=4;i++){
  const val=low+(high-low)*i/4,y=T+(high-val)/(high-low)*(H-T-B);
  el('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#e5ebf5'});
  const display=options.log?Math.exp(val):val;
  el('text',{x:L-12,y:y+4,'text-anchor':'end','font-size':12,fill:'#75849b'},fmt(display,options.percent?1:2)+(options.percent?'%':''));
 }
 for(let i=0;i<=5;i++){
  const stamp=new Date(tx+dateSpan*i/5);
  const year=stamp.getUTCFullYear(),month=String(stamp.getUTCMonth()+1).padStart(2,'0');
  const x=L+(W-L-R)*i/5;
  el('text',{x,y:H-19,'text-anchor':'middle','font-size':12,fill:'#72829b'},year+'-'+month);
 }
 el('text',{x:(L+W-R)/2,y:H-2,'text-anchor':'middle','font-size':13,fill:'#576983'},'日期（年－月）');
 el('text',{transform:'translate(17 '+(H-B+T)/2+') rotate(-90)','text-anchor':'middle','font-size':13,fill:'#576983'},ylabel);
 filtered.forEach((s,i)=>{
  const path=s.points.filter(p=>p[1]!=null&&Number.isFinite(p[1])&&(!options.log||p[1]>0))
   .map((p,j)=>(j?'L':'M')+xx(p[0]).toFixed(2)+' '+yy(p[1]).toFixed(2)).join(' ');
  el('path',{d:path,stroke:s.color||seriesColors[i%seriesColors.length],'stroke-width':2.3,'stroke-linejoin':'round',fill:'none'});
 });
 wrap.append(svg);
 const legend=document.createElement('div');legend.className='dc-legend';
 filtered.forEach((s,i)=>{const item=document.createElement('span'),dot=document.createElement('i');
  dot.style.background=s.color||seriesColors[i%seriesColors.length];item.append(dot,document.createTextNode(s.name));legend.append(item)});
 wrap.append(legend);
 return wrap;
}
function overview(){
 const holder=$('dc-overview');holder.replaceChildren();
 const pairs=[['共同起點',data.commonStart],['共同終點',data.commonEnd],
 ['共同交易日',fmt(data.commonDays,0)+' 日'],['基準',data.benchmark]];
 pairs.forEach(([label,value])=>{const card=document.createElement('div');card.className='dc-card';
  const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=value;
  card.append(a,b);holder.append(card)});
}
function performance(){
 const panel=$('dc-panel');panel.replaceChildren();
 const basic=section('完整績效對照','時間範圍內所有標的與基準使用相同交易日；年化指標採 252 交易日。');
 const columns=['指標',...data.assets.map(x=>x.symbol),data.benchmark+'（基準）'];
 const keys=['totalReturn','cagr','volatility','maxDrawdown','sharpe','sortino','calmar','winRate',
             'bestYear','worstYear','maxUnderwaterDays','recoveryDays','beta','alpha','trackingError','informationRatio'];
 const bm=data.benchmarkMetrics;
 const rows=keys.map(k=>[names[k],...data.assets.map(x=>metric(k,x.metrics[k])),
   ['beta','alpha','trackingError','informationRatio'].includes(k)?'—':metric(k,bm[k])]);
 rows.push(['最新 QTemp（該標的最近確認日 K）',...data.assets.map(x=>x.qtemp==null?'—':fmt(x.qtemp)),'—']);
 basic.append(table(columns,rows));panel.append(basic);
 const span=section('標的歷史資料範圍','共同交易日以所有比較標的及選定基準的交集決定，不補齊缺失資料。');
 span.append(table(['代號','最早資料','最新收盤','歷史日 K'],Object.entries(data.listed).map(([sym,x])=>[sym,x.first,x.last,fmt(x.bars,0)])));
 panel.append(span);
}
function metric(key,v){
 if(v==null)return '—';
 if(key.endsWith('Days'))return fmt(v,0)+' 個交易日';
 return fractionKeys.has(key)?pct(v):fmt(v);
}
function returns(){
 const panel=$('dc-panel');panel.replaceChildren();
 const box=section('報酬走勢比較','所有標的與投資組合起始淨值 100。超額報酬以相同日期的基準淨值比較。');
 const toolbar=document.createElement('div');toolbar.className='dc-toolbar';
 const choices=[['nav','淨值 100'],['log','對數座標'],['excess','相對基準超額報酬']];
 choices.forEach(([id,label])=>{const btn=button(label,()=>{chartMode=id;returns()});btn.className=chartMode===id?'active':'';toolbar.append(btn)});
 box.append(toolbar);
 const assets=data.assets;
 const field=chartMode==='excess'?'excess':'nav';
 const plotted=assets.map((x,i)=>({name:x.symbol,points:x[field],color:seriesColors[i]}));
 if(chartMode!=='excess')plotted.push({name:data.benchmark,points:data.benchmarkSeries.nav,color:'#6a7791'});
 const percentage=chartMode==='excess';
 box.append(svgChart(plotted,percentage?'相對基準超額報酬（%）':'標準化淨值（起始 = 100）',
   {percent:percentage,zero:percentage,log:chartMode==='log'}));
 panel.append(box);
}
function drawdowns(){
 const panel=$('dc-panel');panel.replaceChildren();
 const box=section('歷史回撤走勢','每個交易日與當時已創下的最高淨值比較，縱軸為回撤幅度（%）。');
 const series=data.assets.map((x,i)=>({name:x.symbol,points:x.drawdown,color:seriesColors[i]}));
 series.push({name:data.benchmark,points:data.benchmarkSeries.drawdown,color:'#6a7791'});
 box.append(svgChart(series,'從高點回撤（%）',{percent:true,zero:true}));panel.append(box);
 const risk=section('回撤深度與修復時間','恢復期間指最深回撤發生前的高點至恢復該高點所需交易日；未恢復顯示「尚未恢復」。');
 risk.append(table(['標的','最大回撤','最長水下期間','最深回撤修復期間'],
  data.assets.map(x=>[x.symbol,pct(x.metrics.maxDrawdown),metric('maxUnderwaterDays',x.metrics.maxUnderwaterDays),
   x.metrics.recoveryDays==null?'尚未恢復':metric('recoveryDays',x.metrics.recoveryDays)])));
 panel.append(risk);
}
function correlations(){
 const panel=$('dc-panel');panel.replaceChildren();
 const box=section('Pearson 日報酬相關矩陣','採共同交易日的日報酬，不以股價水準計算。範圍 −1 至 +1。');
 const names=data.symbols;
 const matrix=document.createElement('div');matrix.className='dc-corr';
 matrix.style.gridTemplateColumns='repeat('+(names.length+1)+',minmax(0,1fr))';
 const label=(v,cell=false,value=0)=>{
  const d=document.createElement('div');d.className=cell?'dc-corr-cell':'dc-corr-label';
  if(cell){const level=Math.abs(value);d.style.background='rgba(98,105,219,'+(.08+level*.70)+')';d.style.color=level>.67?'#fff':'#26375b';}
  d.textContent=v;matrix.append(d);
 };
 label('');names.forEach(name=>label(name));
 names.forEach(a=>{
  label(a);
  names.forEach(b=>{
   const item=data.correlations.find(x=>x.symbol===a),val=item?.values[b];
   label(val==null?'—':fmt(val),true,val??0);
  });
 });
 box.append(matrix);panel.append(box);
 const rolling=section('60 交易日滾動相關性','各資產與所選基準 '+data.benchmark+' 的日報酬 Pearson 相關係數，至少 60 個有效配對。');
 const lines=data.rollingCorrelations.map((x,i)=>({name:x.symbol,points:x.points,color:seriesColors[i]}));
 if(lines.some(x=>x.points.length>1))rolling.append(svgChart(lines,'Pearson 相關係數（−1～1）'));
 else{const p=document.createElement('p');p.textContent='可用交易日不足 60 日，無法計算滾動相關性。';rolling.append(p)}
 panel.append(rolling);
}
function portfolio(){
 const panel=$('dc-panel');panel.replaceChildren();
 const description=section('投資組合配置','使用上方輸入的權重與再平衡設定；每期首次共同交易日按目標權重再平衡。');
 description.append(table(['代號','目標權重'],Object.entries(data.portfolio.weights).map(([k,v])=>[k,fmt(v)+'%'])));
 const p=document.createElement('p');p.className='dc-minor';
 p.textContent='再平衡方式：'+({none:'買入持有',monthly:'每月',quarterly:'每季',annual:'每年'}[data.portfolio.rebalancing])+
 ' · 再平衡次數：'+data.portfolio.rebalanceCount;description.append(p);
 panel.append(description);
 const portfolioSeries=data.assets.find(x=>x.symbol==='投資組合');
 if(portfolioSeries){
  const chart=section('組合與基準績效','橫軸為日期，縱軸為從 100 開始的標準化投資組合市值。');
  chart.append(svgChart([{name:'投資組合',points:portfolioSeries.nav,color:'#6268e5'},
   {name:data.benchmark,points:data.benchmarkSeries.nav,color:'#6a7791'}],'標準化淨值（起始 = 100）'));
  panel.append(chart);
  const card=section('組合風險與報酬');
  card.append(table(['指標','投資組合'],['totalReturn','cagr','volatility','maxDrawdown','sharpe','sortino','calmar'].map(k=>[names[k],metric(k,portfolioSeries.metrics[k])])));
  panel.append(card);
 }
}
function switchTab(id){
 active=id;
 target.querySelectorAll('[data-dc-tab]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.dcTab===id)));
 ({performance,returns,drawdowns,correlation:correlations,portfolio}[id]||performance)();
}
target.querySelectorAll('[data-dc-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.dcTab));
$('dc-period').onchange=()=>{
 const custom=$('dc-period').value==='custom';
 target.querySelectorAll('.dc-date').forEach(n=>n.hidden=!custom);
};
function display(response){
 data=response;$('dc-results').hidden=false;
 overview();
 const info=document.createElement('span');
 $('dc-status').textContent='已完成 · '+data.commonDays+' 個共同交易日 · '+data.commonStart+' ～ '+data.commonEnd;
 const notes=$('dc-notes');notes.replaceChildren();
 data.notes.forEach(line=>{const p=document.createElement('p');p.textContent=line;notes.append(p)});
 switchTab(active);
}
$('dc-run').onclick=async()=>{
 if(busy)return;
 busy=true;$('dc-run').disabled=true;$('dc-status').textContent='正在取得 Yahoo 已確認日線並進行長期比較…';
 const args=[$('dc-symbols').value,$('dc-benchmark').value,$('dc-period').value,
             $('dc-from').value,$('dc-to').value,$('dc-weights').value,$('dc-rebalance').value];
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),150000);
 try{
  const response=await fetch('/api/deep_compare',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({args}),signal:controller.signal});
  const payload=await response.json();
  if(!response.ok||payload.error)throw Error(payload.error||'分析失敗');
  display(payload);
 }catch(e){$('dc-status').textContent='比較失敗：'+(e.name==='AbortError'?'查詢超時':e.message)}
 finally{clearTimeout(timer);busy=false;$('dc-run').disabled=false}
};
})();