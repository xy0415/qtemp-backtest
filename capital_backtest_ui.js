(()=>{'use strict';
const root=document.getElementById('qtemp_root');
const panel=root?.querySelector('[data-addon="1"]');
if(!panel)return;
panel.innerHTML='<div class="capital-head"><div><h3>長期投資策略回測</h3><p>QTemp 低估值訊號定額買入 ／ 定期定額 ／ 期初單筆投入</p></div></div>'+
'<div class="capital-form">'+
'<label>股票代號（Ticker）<input id="cap-symbol" value="SPY" maxlength="30" autocomplete="off"></label>'+
'<label>開始日期<input id="cap-start" type="date" value="2010-01-01"></label>'+
'<label>結束日期<input id="cap-end" type="date" value="2026-11-12"></label>'+
'<label>期初金額（IA）<input id="cap-initial" type="number" value="100000" min="0" step="1000"></label>'+
'<label>每期定額金額<input id="cap-periodic" type="number" value="10000" min="0" step="1000"></label>'+
'<label>投資頻率<select id="cap-frequency"><option value="weekly">每週</option><option value="monthly" selected>每月</option><option value="quarterly">每季</option><option value="semiannual">每半年</option><option value="annual">每年</option></select></label>'+
'<label>QTemp 每次低估值投入金額<input id="cap-signal" type="number" value="10000" min="0" step="1000"></label>'+
'<label>定投時點<select id="cap-timing"><option value="begin">期初</option><option value="end" selected>期末</option></select></label>'+
'<label>單筆投入本金<select id="cap-lump"><option value="match_dca" selected>與定投整段總本金相同</option><option value="initial_only">僅投入期初 IA</option></select></label>'+
'</div><div class="capital-action"><button type="button" class="primary" id="cap-run">執行三策略回測</button><span id="cap-status" role="status"></span></div>'+
'<div id="cap-results" hidden><div class="capital-divider"></div><div class="capital-kpis" id="cap-kpis"></div>'+
'<div class="capital-section"><div class="capital-section-head"><h3>策略報酬比較</h3><div class="capital-buttons"><button id="cap-wealth" type="button" aria-pressed="true">資產價值</button><button id="cap-return" type="button" aria-pressed="false">累積報酬率</button><button id="cap-png" type="button">匯出 PNG</button></div></div>'+
'<div class="capital-legend" id="cap-legend"></div><div class="capital-svg-wrap" id="cap-chart"></div><p class="capital-chart-note" id="cap-chart-note"></p></div>'+
'<div class="capital-section"><h3>績效對照表</h3><div class="capital-table-scroller" id="cap-table"></div></div>'+
'<div class="capital-section"><div class="capital-section-head"><h3>逐筆買入明細</h3><div class="capital-buttons"><label>策略 <select id="cap-trade-kind"><option value="qtemp">QTemp 低估值</option><option value="dca">定期定額</option><option value="lump">單筆投入</option></select></label><button type="button" id="cap-trades-csv">匯出交易 CSV</button></div></div><div class="capital-table-scroller" id="cap-trades-table"></div><div class="capital-trade-pager"><button type="button" id="cap-trade-prev">上一頁</button><span id="cap-trade-position"></span><button type="button" id="cap-trade-next">下一頁</button></div><p class="capital-chart-note">成交價格使用 Adj Close 還原的日線開盤或收盤價；不計手續費及稅費。每筆期末市值為該筆買入股數按回測最後一日收盤價計算。</p></div>'+'<div class="capital-section"><h3>統計基礎</h3><p class="capital-chart-note" id="cap-method"></p></div></div>';
const $=id=>document.getElementById(id);
const money=x=>x===null||x===undefined?'—':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:0});
const decimal=x=>x==null?'—':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
const percent=x=>x==null?'—':(x*100).toFixed(2)+'%';
const colors=['#5d64eb','#2889e3','#ec8945'];
const ids=['qtemp','dca','lump'];
let latest=null, mode='wealth', tradePage=0;
const endDate=new Date();
$('cap-end').value=[endDate.getFullYear(),String(endDate.getMonth()+1).padStart(2,'0'),String(endDate.getDate()).padStart(2,'0')].join('-');
function element(tag,cls,txt){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(txt!==undefined)e.textContent=String(txt);
 return e;
}
function fillMetrics(data){
 const parent=$('cap-kpis');parent.replaceChildren();
 const entries=[['資料起點',data.start],['資料終點',data.end],['有效交易日',data.days+' 日'],['每期定投金額',money(data.periodicAmount)]];
 entries.forEach(([a,b])=>{
  const wrap=element('div','capital-kpi');wrap.append(element('span','',a),element('strong','',b));parent.append(wrap);
 });
}
function drawTable(data){
 const host=$('cap-table');host.replaceChildren();
 const t=document.createElement('table');t.className='capital-performance';
 const rows=[
  ['總投入本金', 'invested',money],
  ['期末總資產','wealth',money],
  ['總損益','profit',money],
  ['總報酬率','return',percent],
  ['年化資金報酬率（XIRR）','xirr',percent],
  ['年化報酬率（CAGR）','cagr',percent],
  ['最大回撤（資金流調整）','maxDrawdown',percent],
  ['年化波動率（資金流調整）','volatility',percent],
  ['報酬風險比（零無風險利率）','sharpeZeroRf',decimal],
  ['買進次數','purchaseCount',x=>x],
  ['額外投入次數','extraCount',x=>x]
 ];
 const head=t.createTHead().insertRow();
 ['績效指標','QTemp 低估值','定期定額','單筆投入'].forEach((label,i)=>{
  const th=document.createElement('th');th.textContent=label;
  if(i)th.style.borderTop='3px solid '+colors[i-1];
  head.append(th);
 });
 const body=t.createTBody();
 rows.forEach(([name,key,fmt])=>{
  const row=body.insertRow();const label=row.insertCell();label.textContent=name;label.className='capital-table-label';
  data.strategies.forEach((item,i)=>{
   const cell=row.insertCell();cell.textContent=fmt(item[key]);
   if(key==='wealth'){cell.className='capital-emphasis';cell.style.color=colors[i];}
   else if(key==='profit'||key==='return'||key==='xirr')cell.className=item[key]<0?'capital-negative':'';
  });
 });
 host.append(t);
}
function drawTrades(){
 const host=$('cap-trades-table');host.replaceChildren();
 if(!latest)return;
 const current=latest.strategies.find(x=>x.id===$('cap-trade-kind').value);
 const trades=current?.trades||[],pageSize=20,totalPages=Math.max(1,Math.ceil(trades.length/pageSize));
 tradePage=Math.max(0,Math.min(tradePage,totalPages-1));
 const t=document.createElement('table');t.className='capital-performance capital-trades';
 const columns=['類型','訊號確認日','實際買入日','買入價','投入金額','本次買入股數',
 '累積股數','持股總成本','平均持股成本','當日持股市值','本次持股期末市值'];
 const hr=t.createTHead().insertRow();columns.forEach(name=>hr.append(element('th','',name)));
 const body=t.createTBody();
 trades.slice(tradePage*pageSize,(tradePage+1)*pageSize).forEach(trade=>{
  const row=body.insertRow();
  [trade.type,trade.confirmation||'—',trade.entry,decimal(trade.price),money(trade.amount),
   decimal(trade.addedShares),decimal(trade.shares),money(trade.costBasis),decimal(trade.avgCost),
   money(trade.purchaseDayValue),money(trade.lotEndValue)].forEach(val=>row.insertCell().textContent=val);
 });
 host.append(t);
 $('cap-trade-prev').disabled=tradePage===0;
 $('cap-trade-next').disabled=tradePage>=totalPages-1;
 $('cap-trade-position').textContent=(tradePage+1)+' / '+totalPages+' 頁 · '+trades.length+' 筆'+(current?.tradesTruncated?'（列表截斷）':'');
}
$('cap-trade-kind').onchange=()=>{tradePage=0;drawTrades()};
$('cap-trade-prev').onclick=()=>{tradePage--;drawTrades()};
$('cap-trade-next').onclick=()=>{tradePage++;drawTrades()};
$('cap-trades-csv').onclick=()=>{
 if(!latest)return;
 const current=latest.strategies.find(x=>x.id===$('cap-trade-kind').value);
 const heading=['類型','訊號確認日','實際買入日','買入價','投入金額','本次買入股數',
  '累積股數','持股總成本','平均持股成本','當日持股市值','本次持股期末市值'];
 const rows=[heading,...(current?.trades||[]).map(t=>[
  t.type,t.confirmation,t.entry,t.price,t.amount,t.addedShares,t.shares,t.costBasis,t.avgCost,t.purchaseDayValue,t.lotEndValue])];
 const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='QTemp_'+latest.symbol+'_'+current.id+'_trades.csv';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function niceTick(value){const a=Math.abs(value);if(a>=1e9)return (value/1e9).toFixed(1)+'B';if(a>=1e6)return (value/1e6).toFixed(1)+'M';if(a>=1e3)return (value/1e3).toFixed(0)+'K';return value.toFixed(0)}
function renderChart(data){
 const host=$('cap-chart');host.replaceChildren();
 const isReturn=mode==='return';
 const points=data.strategies.map(s=>s.points);
 const all=points.flatMap(arr=>arr.map(p=>isReturn?(p[3]===null?0:p[3]*100):p[1]));
 const max=Math.max(0,...all),min=Math.min(0,...all);
 const left=85,top=22,width=950,height=330,right=112,bottom=39;
 const yLow=isReturn?Math.min(0,min):0;
 const yHigh=max===yLow?yLow+1:max*1.13+(isReturn?2:0);
 const xStart=new Date(data.start+'T00:00:00Z').getTime();
 const xEnd=new Date(data.end+'T00:00:00Z').getTime();
 const xRange=Math.max(1,xEnd-xStart);
 const x=date=>left+(new Date(date+'T00:00:00Z').getTime()-xStart)/xRange*(width-left-right);
 const y=value=>top+(yHigh-value)/(yHigh-yLow)*(height-top-bottom);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
 svg.setAttribute('viewBox','0 0 '+width+' '+height);
 svg.setAttribute('role','img');
 svg.setAttribute('aria-label',isReturn?'三策略歷史累積報酬率比較':'三策略資產曲線與投入本金比較');
 svg.classList.add('capital-chart-svg');
 const NS='http://www.w3.org/2000/svg';
 function node(tag,attrs,text){
  const e=document.createElementNS(NS,tag);
  Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));
  if(text!==undefined)e.textContent=text;
  svg.append(e);return e;
 }
 for(let i=0;i<=4;i++){
  const value=yLow+(yHigh-yLow)*i/4;const py=y(value);
  node('line',{x1:left,x2:width-right,y1:py,y2:py,stroke:'#e8edf5','stroke-width':1});
  node('text',{x:left-11,y:py+4,'text-anchor':'end',fill:'#8a97a8','font-size':13},isReturn?value.toFixed(0)+'%':niceTick(value));
 }
 const first=new Date(xStart).getUTCFullYear(),last=new Date(xEnd).getUTCFullYear();
 const count=Math.max(1,Math.ceil((last-first)/7));
 for(let yr=first;yr<=last;yr+=count){
  const time=new Date(Date.UTC(yr,0,1)).getTime();
  if(time<xStart||time>xEnd)continue;
  node('text',{x:left+(time-xStart)/xRange*(width-left-right),y:height-12,'text-anchor':'middle',fill:'#8190a6','font-size':13},yr);
 }
 data.strategies.forEach((s,i)=>{
  const arr=points[i].filter(p=>(isReturn?p[3]!==null:Number.isFinite(p[1])));
  if(!arr.length)return;
  const value=p=>isReturn?p[3]*100:p[1];
  const path=arr.map((p,k)=>(k?'L':'M')+x(p[0]).toFixed(2)+' '+y(value(p)).toFixed(2)).join(' ');
  node('path',{d:path,fill:'none',stroke:colors[i],'stroke-width':2.9,'stroke-linejoin':'round','stroke-linecap':'round'});
  if(!isReturn){
   const invested=points[i].map((p,k)=>(k?'L':'M')+x(p[0]).toFixed(2)+' '+y(p[2]).toFixed(2)).join(' ');
   node('path',{d:invested,fill:'none',stroke:colors[i],'stroke-width':1.5,'stroke-dasharray':'5 5',opacity:.65});
  }
  const end=arr[arr.length-1];
  node('circle',{cx:x(end[0]),cy:y(value(end)),r:4.2,fill:colors[i],stroke:'#fff','stroke-width':2});
  const label=isReturn?value(end).toFixed(1)+'%':niceTick(value(end));
  node('text',{x:x(end[0])+10,y:y(value(end))+4,fill:colors[i],'font-size':13,'font-weight':750},label);
 });
 host.append(svg);
 $('cap-chart-note').textContent=isReturn?
  '累積報酬率 = 當日總資產 ÷ 累計投入本金 − 1。新增資金會影響比率，年化比較請參考 XIRR。':
  '實線：策略資產價值；虛線：累積投入本金。策略投入總額可能不同，請同時比較本金與 XIRR。';
 const legend=$('cap-legend');legend.replaceChildren();
 data.strategies.forEach((s,i)=>{
  const el=element('span');const dot=element('i');dot.style.background=colors[i];el.append(dot,document.createTextNode(s.name));legend.append(el);
 });
 ['cap-wealth','cap-return'].forEach(id=>$ (id).setAttribute('aria-pressed',String((id==='cap-wealth')===!isReturn)));
}
function setMode(next){mode=next;if(latest)renderChart(latest)}
$('cap-wealth').onclick=()=>setMode('wealth');
$('cap-return').onclick=()=>setMode('return');
$('cap-png').onclick=()=>{
 const svg=$('cap-chart').querySelector('svg');if(!svg)return;
 const source=new XMLSerializer().serializeToString(svg);
 const blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const image=new Image();image.onload=()=>{
  const canvas=document.createElement('canvas');canvas.width=1900;canvas.height=660;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  canvas.toBlob(file=>{
   URL.revokeObjectURL(url);if(!file)return;
   const download=URL.createObjectURL(file),a=document.createElement('a');
   a.href=download;a.download='QTemp_'+latest.symbol+'_'+mode+'.png';a.click();
   setTimeout(()=>URL.revokeObjectURL(download),1000);
  },'image/png');
 };image.onerror=()=>{$('cap-status').textContent='圖片匯出失敗';URL.revokeObjectURL(url)};image.src=url;
};
$('cap-run').onclick=async()=>{
 const button=$('cap-run'),status=$('cap-status');
 const args=['cap-symbol','cap-start','cap-end','cap-initial','cap-periodic','cap-frequency','cap-signal','cap-timing','cap-lump'].map(id=>$(id).value);
 if(args.some(x=>x.trim()==='')){status.textContent='所有欄位皆須填寫';return}
 button.disabled=true;status.textContent='歷史資料與三策略計算中…';$('cap-results').hidden=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{
  const response=await fetch('/api/capital_comparison',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({args}),signal:controller.signal});
  const result=await response.json();
  if(!response.ok||result.error)throw new Error(result.error||'資料回傳失敗');
  latest=result;mode='wealth';
  fillMetrics(result);drawTable(result);renderChart(result);tradePage=0;drawTrades();
  $('cap-method').textContent=result.note;
  $('cap-results').hidden=false;
  status.textContent='回測完成 · '+result.symbol+' · '+result.start+' 至 '+result.end;
 }catch(e){status.textContent='回測失敗：'+(e.name==='AbortError'?'連線逾時':e.message)}
 finally{clearTimeout(timer);button.disabled=false}
};
})();