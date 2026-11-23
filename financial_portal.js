(()=>{
'use strict';
const root=document.getElementById('qtemp_root');if(!root)return;
const intro=root.querySelector('.qroute-intro');if(!intro)return;
const portal=document.createElement('div');portal.className='fm-portal';portal.setAttribute('aria-label','金融市場研究入口');
intro.insertAdjacentElement('afterend',portal);
const main=['overview','markets','macro','sectors','stocks','news','quant'];
const featured=['^GSPC','^IXIC','^DJI','^SOX','^TWII','^N225'];
let market=null,selected='^SOX',period='3mo',requests={},loadedAt={},pending={};
let unmountNews=null, activePage='';
let homeMarket='US', marketFilter='all', marketSearch='', sortKey='name', sortDescending=false;
const detailQuotes=new Map();
const stockFormat=/^[A-Z0-9][A-Z0-9-]{0,19}(?:\.(?:TW|TWO))?$/;
const marketFilters=[
 ['all','全部'],['indices','指數'],['TW','台股'],['US','美股'],['etf','ETF'],
 ['risk','利率與風險'],['commodities','商品'],['fx','外匯'],['crypto','加密']
];
const isETF=row=>['ETF','產業 ETF'].includes(row.category);
const marketMatches={
 all:()=>true, indices:row=>['美股','半導體','台股','全球'].includes(row.category),
 TW:row=>row.region==='TW'&&(row.category==='台股個股'||isETF(row)||row.ticker==='^TWII'),
 US:row=>row.region==='US'&&(row.category==='美股個股'||isETF(row)||['美股','半導體'].includes(row.category)),
 etf:isETF, risk:row=>['利率','風險'].includes(row.category), commodities:row=>row.category==='商品',
 fx:row=>row.category==='外匯',crypto:row=>row.category==='加密'
};
const historyUrl=(symbol,range)=>'/api/market/history/'+encodeURIComponent(symbol)+'?period='+range+'&lookup=1';
const movement=row=>row.changeBp??row.changePct;
const deltaText=row=>row.changeBp!=null?(row.changeBp>0?'+':'')+clean(row.changeBp)+' bp':sign(row.changePct);
const deltaClass=row=>movement(row)>0?'fm-positive':movement(row)<0?'fm-negative':'';
const quotePrice=row=>row.value==null?'—':clean(row.value)+(row.unit==='%'?'%':'');
const visibleDate=row=>row.asOf?(row.possiblyStale?'⚠ ':'')+row.asOf:'—';

let lastAutoCheck=0;
const link=(ticker)=>'https://finance.yahoo.com/quote/'+encodeURIComponent(ticker)+'/';
const clean=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:Math.abs(v)<1?6:2});
const sign=v=>v==null?'—':((v>0?'+':'')+Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2})+'%');
const $=(q,where=portal)=>where.querySelector(q);
const el=(tag,name,cls)=>{const x=document.createElement(tag);if(name!=null)x.textContent=String(name);if(cls)x.className=cls;return x};
const labelDate=date=>date||'未取得';
const loading=(node,msg)=>{node.replaceChildren(el('p',msg,'fm-loading'))};
const stamp=(dt)=>{if(!dt)return'未取得';try{return new Date(dt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}catch{return dt}};
async function get(url,kind,ttl=120000,force=false){
 if(!force&&requests[kind]&&Date.now()-loadedAt[kind]<ttl)return requests[kind];
 if(pending[kind])return pending[kind];
 const run=async()=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),60000);
  try{
   const res=await fetch(url,{signal:ctrl.signal,cache:'no-store'});
   if(!res.ok)throw Error('HTTP '+res.status);
   const data=await res.json();
   requests[kind]=data;loadedAt[kind]=Date.now();
   return data;
  }finally{clearTimeout(timer)}
 };
 pending[kind]=run();
 try{return await pending[kind]}finally{delete pending[kind]}
}
function card(row,click){
 const button=el('button',null,'fm-quote');
 button.type='button';if(row.ticker==='^SOX')button.classList.add('fm-sox');
 const head=el('div',null,'fm-quote-head');
 head.append(el('strong',row.name),el('span',row.ticker));
 button.append(head);
 const price=el('div',row.value==null?'資料不可用':clean(row.value)+(row.unit==='%'?'%':''),'fm-price');
 button.append(price);
 const change=el('div',row.changeBp!=null?((row.changeBp>0?'+':'')+clean(row.changeBp)+' bp'):
    row.changePct==null?'尚無可比較日線':sign(row.changePct),'fm-change');
 const movement=row.changeBp==null?row.changePct:row.changeBp;
 if(movement>0)change.classList.add('fm-positive');
 if(movement<0)change.classList.add('fm-negative');
 button.append(change);
 const staleSuffix=row.possiblyStale?' · 資料可能過期（距今 '+row.ageDays+' 天）':'';
 button.append(el('small',row.asOf?'收盤日 '+row.asOf+' · Yahoo 日 K'+staleSuffix:row.status,'fm-asof'));
 button.onclick=()=>click(row.ticker);
 return button;
}
function headline(title,sub){
 const section=el('div',null,'fm-heading');
 section.append(el('h2',title));
 if(sub)section.append(el('p',sub));
 return section;
}
function panel(title,sub){
 const section=el('section',null,'fm-panel');section.append(headline(title,sub));return section;
}
function pill(text,handler){
 const b=el('button',text,'fm-pill');b.type='button';b.onclick=handler;return b;
}
function svg(tag,attrs,text){
 const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
 Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));
 if(text!=null)n.textContent=String(text);
 return n;
}
function plot(host,points,axis='價格',symbol=selected){
 host.replaceChildren();
 const cleanPoints=(points||[]).filter(x=>Array.isArray(x)&&x.length>=2&&
    Number.isFinite(+x[1])&&/^\d{4}-\d\d-\d\d$/.test(x[0]));
 if(cleanPoints.length<2){host.append(el('p','無足夠日線繪製走勢。','fm-empty'));return}
 const W=960,H=295,L=74,R=24,T=24,B=46;
 const min=Math.min(...cleanPoints.map(x=>+x[1])),max=Math.max(...cleanPoints.map(x=>+x[1]));
 const pad=(max-min||max*.02||1)*.1,low=min-pad,high=max+pad;
 const xx=i=>L+i/(cleanPoints.length-1)*(W-L-R);
 const yy=v=>T+(high-v)/(high-low)*(H-T-B);
 const frame=svg('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':symbol+' 日線走勢，橫軸為日期，縱軸為 '+axis});
 for(let i=0;i<=4;i++){
  const value=low+(high-low)*i/4,y=yy(value);
  frame.append(svg('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'var(--market-line)'}));
  frame.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',fill:'var(--market-muted)','font-size':12},clean(value)));
 }
 const path=cleanPoints.map((point,i)=>(i?'L':'M')+xx(i).toFixed(2)+' '+yy(+point[1]).toFixed(2)).join(' ');
 frame.append(svg('path',{d:path,stroke:'var(--market-accent)','stroke-width':2.6,fill:'none','stroke-linejoin':'round'}));
 for(let i=0;i<=4;i++){
  const pos=Math.round(i*(cleanPoints.length-1)/4),day=cleanPoints[pos][0];
  frame.append(svg('text',{x:xx(pos),y:H-16,'text-anchor':'middle',fill:'var(--market-muted)','font-size':12},cleanPoints.length<=130?day.slice(5):day.slice(0,7)));
 }
 frame.append(svg('text',{x:(L+W-R)/2,y:H-1,'text-anchor':'middle',fill:'var(--market-muted)','font-size':12},cleanPoints.length<=130?'日期（月－日）':'日期（年－月）'));
 frame.append(svg('text',{transform:'translate(18 '+H/2+') rotate(-90)','text-anchor':'middle',fill:'var(--market-muted)','font-size':12},axis));
 host.append(frame);
}
function chartSection(symbol='^SOX',startPeriod='3mo'){
 selected=symbol;period=startPeriod;
 const section=panel('市場走勢','以 Yahoo Finance 原始 Close 日線呈現，非即時成交報價');
 const tools=el('div',null,'fm-chart-tools');
 const ticker=el('select');ticker.setAttribute('aria-label','切換市場指標');
 (market?.items||[]).forEach(x=>{const option=new Option(x.name,x.ticker);option.selected=x.ticker===selected;ticker.add(option)});
 const periodSelect=el('select');periodSelect.setAttribute('aria-label','切換圖表期間');
 [['1mo','1 個月'],['3mo','3 個月'],['6mo','6 個月'],['1y','1 年'],['2y','2 年'],['5y','5 年']].forEach(([value,name])=>{const opt=new Option(name,value);opt.selected=value===period;periodSelect.add(opt)});
 const open=el('a','Yahoo Finance','fm-chart-link');
 open.href=link(selected);open.target='_blank';open.rel='noopener noreferrer';
 tools.append(ticker,periodSelect,open);section.append(tools);
 const host=el('div',null,'fm-chart'),status=el('p','載入圖表中…','fm-meta');
 section.append(host,status);
 const load=async()=>{
  selected=ticker.value;period=periodSelect.value;open.href=link(selected);
  const symbol=ticker.value,range=periodSelect.value;
  const requestId=symbol+'/'+range;
  status.textContent='取得 '+selected+' 的已確認日線中…';
  try{
   const data=await get('/api/market/history/'+encodeURIComponent(selected)+'?period='+encodeURIComponent(period),
    'history_'+requestId,150000);
   if(ticker.value!==symbol||periodSelect.value!==range||!section.isConnected)return;
   const axis=symbol==='^TNX'?'殖利率（%）':
     symbol==='TWD=X'?'台幣／美元':
     symbol==='JPY=X'?'日圓／美元':
     ['GC=F','SI=F','CL=F','BTC-USD','ETH-USD','SOL-USD'].includes(symbol)?'美元（USD）':
     ['^GSPC','^IXIC','^DJI','^NDX','^RUT','^SOX','^TWII','^N225','^HSI','^VIX','DX-Y.NYB'].includes(symbol)?'指數點位':
     'ETF 收盤價格（USD）';
   plot(host,data.points,axis,symbol);
   status.textContent='資料截至 '+labelDate(data.asOf)+' · '+data.source;
  }catch(e){if(ticker.value!==symbol||periodSelect.value!==range)return;host.replaceChildren(el('p','圖表資料暫時不可用。','fm-empty'));status.textContent='行情來源無法取得：'+e.message}
 };
 ticker.onchange=load;periodSelect.onchange=load;
 load();
 return section;
}
function sourceLink(title,url){
 const a=el('a',title,'fm-source-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function quantHub(){
 const section=panel('量化研究工具','保留原有 QTemp 公式、日 K、訊號研究與多資產回測');
 const grid=el('div',null,'fm-tools-grid');
 const tools=[
  ['chart','QTemp 技術圖表','日 K、QTemp 曲線、訊號及價格回顧'],
  ['signals','QTemp 訊號研究','歷史勝率、事件研究、訊號日曆'],
  ['zones','QTemp 區間統計','熱力圖、直方圖、當前分數'],
  ['strategy','策略回測','QTemp、定投與單筆投入比較'],
  ['compare','多資產相對績效','相關性、回撤、Alpha、投資組合'],
  ['resources','資料品質與公式','資料來源、TradingView 對照、匯出']
 ];
 tools.forEach(([route,title,description])=>{
  const button=el('button',null,'fm-tool-card');button.type='button';
  button.append(el('strong',title),el('span',description));
  button.onclick=()=>navigate(route);
  grid.append(button);
 });
 section.append(grid);return section;
}
function openQuant(symbol){
 const input=root.querySelector('[data-q="symbol"]');
 input.value=symbol;
 root.querySelector('[data-q="load"]')?.click();
 navigate('chart');
}
function navigate(route){
 const btn=root.querySelector('[data-route="'+route+'"]');
 if(btn)btn.click();else{
  location.hash='#'+route;
 }
}
function majorCards(items,choose){
 const grid=el('div',null,'fm-indices');
 items.forEach(item=>grid.append(card(item,choose)));return grid;
}
function openMarket(ticker){
 selected=ticker;
 marketFilter='all';
 marketSearch='';
 navigate('markets');
}
function homeQuotes(){
 const strip=root.querySelector('.qhero-quote-strip');
 strip.replaceChildren();
 if(!market){
  strip.append(el('p','讀取已確認日線…','fm-meta'));
  return;
 }
 for(const ticker of featured){
  const quote=market.items.find(item=>item.ticker===ticker);
  if(!quote)continue;
  const tile=el('button',null,'market-ticker');
  tile.type='button';
  tile.onclick=()=>openMarket(ticker);
  const identity=el('span',quote.name,'market-ticker-name');
  const price=el('strong',quotePrice(quote));
  const stats=el('span',deltaText(quote),'market-ticker-delta '+deltaClass(quote));
  tile.append(identity,price,stats,el('small',visibleDate(quote)));
  strip.append(tile);
 }
}
function sectorHeatmap(rows){
 const grid=el('div',null,'market-heatmap');
 for(const row of rows){
  const tile=el('button',null,'market-heat '+deltaClass(row));
  tile.type='button';
  tile.onclick=()=>openMarket(row.ticker);
  tile.title=row.asOf?'收盤日 '+row.asOf:'來源無資料';
  const magnitude=Math.min(Math.abs(row.changePct||0),5)/5;
  tile.style.setProperty('--heat-strength',Math.round(8+magnitude*32)+'%');
  tile.append(el('strong',row.name),el('small',row.ticker),el('span',deltaText(row)));
  grid.append(tile);
 }
 return grid;
}
const sectorRows=()=>market.items.filter(row=>row.category==='產業 ETF');
function updateHomeActivity(){
 const host=root.querySelector('.market-home-activity');
 const header=el('div',null,'market-section-header');
 header.append(el('h2','市場快覽'),el('span','追蹤標的 · 收盤日線','fm-meta'));
 const tabs=el('div',null,'market-switches');
 for(const [id,name] of [['US','美股'],['TW','台股'],['crypto','加密']]){
  const tab=pill(name,()=>{homeMarket=id;updateHomeActivity();host.querySelector('[aria-pressed=true]')?.focus()});
  tab.setAttribute('aria-pressed',String(id===homeMarket));
  tabs.append(tab);
 }
 host.replaceChildren(header,tabs);
 if(!market){host.append(el('p','讀取市場行情…','fm-meta'));return}
 const rows=market.items.filter(row=>marketMatches[homeMarket](row)&&Number.isFinite(row.changePct));
 const shares=rows.filter(row=>row.category.endsWith('個股')||isETF(row));
 const ranked=(homeMarket==='crypto'?rows:shares).slice().sort((a,b)=>b.changePct-a.changePct);
 const leaderboard=el('div',null,'market-leaders');
 for(const [label,list] of [
  ['漲幅',ranked.filter(row=>row.changePct>0).slice(0,3)],
  ['跌幅',ranked.filter(row=>row.changePct<0).slice(-3).reverse()]
 ]){
  const block=el('section');
  block.append(el('h3',label));
  if(!list.length)block.append(el('p','目前沒有符合標的','fm-meta'));
  for(const row of list){
   const item=el('button',null,'market-rank-row');
   item.type='button';item.onclick=()=>openMarket(row.ticker);
   item.append(el('strong',row.ticker),el('span',deltaText(row),deltaClass(row)));
   block.append(item);
  }
  leaderboard.append(block);
 }
 host.append(leaderboard);
 const full=pill('查看此市場行情',()=>{marketFilter=homeMarket;marketSearch='';navigate('markets')});
 host.append(full);
}
function overview(){
 const section=panel('美股產業 ETF 熱圖','依最近收盤日漲跌著色，每格代表一檔 ETF');
 section.classList.add('market-heat-section');
 section.append(sectorHeatmap(sectorRows()),pill('產業報酬比較',()=>navigate('sectors')));
 return section;
}
function fillQuoteSummary(host,row){
 host.replaceChildren();
 const label=el('span',row.ticker,'market-quote-symbol');
 const quote=el('div',null,'market-quote-number');
 quote.append(el('strong',quotePrice(row)),el('span',deltaText(row),deltaClass(row)));
 host.append(label,el('h2',row.name),quote);
 const detail=el('div',null,'market-quote-meta');
 detail.append(el('span','收盤日 '+visibleDate(row)),el('span','成交量 '+clean(row.volume)),el('span',({index:'指數點位','TWD/USD':'台幣／美元','JPY/USD':'日圓／美元'}[row.currency]||row.currency||'')+' · Yahoo Finance 日 K'));
 host.append(detail);
}
function quoteChart(section,symbol,{startPeriod=period,onPeriod,onQuote}={}){
 const summary=el('div',null,'market-quote-summary');
 const chartHost=el('div',null,'fm-chart');
 const controls=el('div',null,'market-switches');
 const state=el('p',null,'fm-meta');
 state.setAttribute('role','status');
 let revision=0, activePeriod=startPeriod;
 const load=async()=>{
  const id=++revision;
  const snapshot=preferredQuote(market?.items.find(row=>row.ticker===symbol),detailQuotes.get(symbol));
  if(snapshot)fillQuoteSummary(summary,snapshot);
  else summary.replaceChildren(el('h2',symbol));
  state.textContent='載入已確認日線…';
  controls.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===activePeriod)));
  try{
   const data=await get(historyUrl(symbol,activePeriod),'history_'+symbol+'/'+activePeriod,150000);
   if(id!==revision||!section.isConnected||summary.parentElement!==section)return;
   if(data.quote){
    fillQuoteSummary(summary,data.quote);
    onQuote?.(data.quote);
   }
   plot(chartHost,data.points,symbol==='^TNX'?'殖利率（%）':'價格',symbol);
   state.textContent='已確認日線 · '+data.asOf;
  }catch{
   if(id!==revision||!section.isConnected||summary.parentElement!==section)return;
   chartHost.replaceChildren(el('p','無法取得此標的的走勢','fm-empty'));
   state.textContent='請核對代號或稍後重試';
  }
 };
 for(const [id,label] of [['1mo','1月'],['3mo','3月'],['6mo','6月'],['1y','1年'],['2y','2年'],['5y','5年']]){
  const button=pill(label,()=>{activePeriod=id;onPeriod?.(id);load()});
  button.dataset.period=id;
  controls.append(button);
 }
 const links=el('div',null,'market-quote-links');
 links.append(sourceLink('Yahoo Finance',link(symbol)),pill('QTemp 圖表',()=>openQuant(symbol)));
 section.replaceChildren(summary,controls,chartHost,state,links);
 load();
}
function preferredQuote(snapshot,detail){
 if(!snapshot)return detail;
 if(detail?.value!=null&&(!snapshot.asOf||detail.asOf>=snapshot.asOf))return detail;
 return snapshot;
}
function markets(){
 const frame=el('section',null,'fm-panel market-terminal');
 const subnav=el('div',null,'market-view-links');
 subnav.append(el('strong','報價表'),pill('產業比較',()=>navigate('sectors')));
 const layout=el('div',null,'market-table-layout');
 const catalog=el('div',null,'market-catalog');
 const detail=el('aside',null,'market-detail');
 const filters=el('div',null,'market-switches');
 const form=el('form',null,'market-search');
 const field=el('input');
 field.type='search';field.value=marketSearch;field.maxLength=24;
 field.placeholder='搜尋名稱或代號，例如 2330.TW';
 field.setAttribute('aria-label','搜尋行情');
 const submit=el('button','查詢代號');submit.type='submit';
 form.append(field,submit);
 const scroll=el('div',null,'market-table-scroll');
 const table=el('table',null,'market-quotes-table');
 const head=table.createTHead().insertRow();
 const tbody=table.createTBody();
 const empty=el('p','清單無符合標的，可輸入台股或美股代號查詢。','fm-meta');
 const sorts={
  name:(a,b)=>a.ticker.localeCompare(b.ticker),value:(a,b)=>a.value-b.value,
  move:(a,b)=>a.changePct-b.changePct,volume:(a,b)=>a.volume-b.volume,date:(a,b)=>a.asOf.localeCompare(b.asOf)
 };
 const sortValue={name:row=>row.ticker,value:row=>row.value,move:row=>row.changePct,volume:row=>row.volume,date:row=>row.asOf};
 for(const [key,label] of [['name','標的'],['value','收盤價'],['move','漲跌'],['volume','成交量'],['date','交易日']]){
  const heading=el('th');heading.scope='col';
  const button=pill(label,()=>{
   sortDescending=sortKey===key?!sortDescending:key!=='name';
   sortKey=key;paint();
  });
  heading.dataset.sort=key;heading.append(button);head.append(heading);
 }
 const chartOptions={
  onPeriod:range=>{period=range},
  onQuote:row=>{
   if(detailQuotes.size>=32&&!detailQuotes.has(row.ticker))detailQuotes.delete(detailQuotes.keys().next().value);
   detailQuotes.set(row.ticker,row);
   paint();
  }
 };
 const showSymbol=(symbol,moveToChart=false)=>{
  selected=symbol;paint();quoteChart(detail,symbol,chartOptions);
  if(moveToChart&&matchMedia('(max-width: 900px)').matches)detail.scrollIntoView({block:'start'});
 };
 function paint(){
  const focused=tbody.contains(document.activeElement)?document.activeElement.textContent:null;
  filters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===marketFilter)));
  head.querySelectorAll('th').forEach(th=>th.setAttribute('aria-sort',th.dataset.sort===sortKey?(sortDescending?'descending':'ascending'):'none'));
  tbody.replaceChildren();
  const query=marketSearch.toLowerCase();
  const known=new Set(market.items.map(row=>row.ticker));
  const rows=market.items.map(row=>preferredQuote(row,detailQuotes.get(row.ticker)));
  for(const [ticker,row] of detailQuotes)if(!known.has(ticker))rows.push(row);
  const filtered=rows.filter(row=>marketMatches[marketFilter](row)&&(row.name.toLowerCase().includes(query)||row.ticker.toLowerCase().includes(query)));
  filtered.sort((a,b)=>{
   const left=sortValue[sortKey](a),right=sortValue[sortKey](b);
   if(left==null||right==null)return Number(left==null)-Number(right==null);
   return (sortDescending?-1:1)*sorts[sortKey](a,b);
  });
  for(const row of filtered){
   const tr=tbody.insertRow();
   const name=tr.insertCell();
   const button=pill(row.ticker,()=>showSymbol(row.ticker,true));
   button.setAttribute('aria-pressed',String(row.ticker===selected));
   name.append(button,el('small',row.name));
   tr.insertCell().textContent=quotePrice(row);
   const delta=tr.insertCell();delta.textContent=deltaText(row);delta.className=deltaClass(row);
   tr.insertCell().textContent=clean(row.volume);
   tr.insertCell().textContent=visibleDate(row);
  }
  empty.hidden=filtered.length>0;
  if(focused)[...tbody.querySelectorAll('button')].find(button=>button.textContent===focused)?.focus({preventScroll:true});
 }
 for(const [key,label] of marketFilters){
  const button=pill(label,()=>{
   marketFilter=key;
   const candidates=market.items.filter(marketMatches[key]);
   if(candidates.length&&!candidates.some(row=>row.ticker===selected))showSymbol(candidates[0].ticker);
   else paint();
  });
  button.dataset.filter=key;filters.append(button);
 }
 field.oninput=()=>{marketSearch=field.value.trim();paint()};
 form.onsubmit=event=>{
  event.preventDefault();
  let symbol=field.value.trim().toUpperCase();
  if(marketFilter==='TW'&&/^\d{4,6}[A-Z]?$/.test(symbol))symbol+='.TW';
  const found=market.items.find(row=>row.ticker===symbol||row.name.toUpperCase()===symbol);
  if(!found&&!stockFormat.test(symbol)){
   empty.hidden=false;empty.textContent='請輸入有效的台股或美股代號。';return;
  }
  marketFilter='all';marketSearch='';
  field.value='';empty.textContent='清單無符合標的，可輸入台股或美股代號查詢。';
  showSymbol(found?.ticker||symbol,true);
 };
 scroll.append(table);catalog.append(filters,form,scroll,empty);
 layout.append(catalog,detail);frame.append(subnav,layout);
 const available=market.items.filter(marketMatches[marketFilter]);
 if(marketFilter!=='all'&&available.length&&!available.some(row=>row.ticker===selected))selected=available[0].ticker;
 paint();quoteChart(detail,selected,chartOptions);
 return frame;
}
function macros(){
 const frag=document.createDocumentFragment();
 const s=panel('市場中的總經代理變數','這些屬市場報價，不等於官方 CPI、失業率或政策利率公布值');
 const rows=market.items.filter(x=>['^TNX','^VIX','DX-Y.NYB','GC=F','TWD=X'].includes(x.ticker));
 s.append(majorCards(rows,ticker=>{selected=ticker;render()}));frag.append(s);
 frag.append(chartSection(['^TNX','^VIX','DX-Y.NYB','GC=F','TWD=X'].includes(selected)?selected:'^TNX',period));
 const official=panel('官方總體經濟資料','官方公布數值、歷史資料與原文公告均可前往原始來源查證');
 [['FRED 經濟資料','https://fred.stlouisfed.org/'],['Federal Reserve','https://www.federalreserve.gov/'],
 ['BLS 通膨與就業','https://www.bls.gov/'],['BEA GDP 與 PCE','https://www.bea.gov/']]
 .forEach(([n,u])=>official.append(sourceLink(n,u)));
 frag.append(official);return frag;
}
function sectors(){
 const section=panel('產業 ETF 報酬比較','比較同一檔 ETF 的已確認日線，價格採 Yahoo Finance Close');
 section.classList.add('market-sector-view');
 const header=el('div',null,'market-view-links');
 header.append(pill('回報價表',()=>navigate('markets')));
 const controls=el('div',null,'market-switches');
 const ranking=el('div',null,'market-sector-ranking');
 const detail=el('div',null,'market-detail');
 const state=el('p',null,'fm-meta');
 const rows=sectorRows();
 let chosenPeriod='1d',generation=0;
 function show(row){
  selected=row.ticker;quoteChart(detail,row.ticker);
  if(matchMedia('(max-width: 900px)').matches)detail.scrollIntoView({block:'start'});
 }
 function paint(values){
  ranking.replaceChildren();
  const valid=values.slice().sort((a,b)=>(b.changePct??-Infinity)-(a.changePct??-Infinity));
  const extent=Math.max(1,...valid.map(row=>Math.abs(row.changePct||0)));
  for(const row of valid){
   const button=el('button',null,'market-sector-row');button.type='button';button.onclick=()=>show(row);
   const bar=el('span',null,'market-sector-bar '+deltaClass(row));
   bar.style.setProperty('--bar-size',Math.abs(row.changePct||0)/extent*100+'%');
   button.append(el('strong',row.name),el('small',row.ticker),bar,el('span',deltaText(row),deltaClass(row)),el('small',visibleDate(row)));
   ranking.append(button);
  }
 }
 async function choose(range){
  const version=++generation;
  chosenPeriod=range;
  controls.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===range)));
  state.textContent='';
  if(range==='1d'){paint(rows);return}
  state.textContent='正在計算期間報酬…';
  ranking.replaceChildren();
  const bars=range==='5d'?5:21;
  const results=await Promise.all(rows.map(async row=>{
   try{
    const data=await get(historyUrl(row.ticker,'3mo'),'history_'+row.ticker+'/3mo',150000);
    const base=data.points.at(-1-bars),last=data.points.at(-1);
    return {...row,asOf:last?.[0],changePct:base?.[1]>0&&last?.[1]>0?(last[1]/base[1]-1)*100:null};
   }catch{return {...row,changePct:null}}
  }));
  if(version!==generation||chosenPeriod!==range||!section.isConnected)return;
  state.textContent='';
  paint(results);
 }
 for(const [range,label] of [['1d','單日'],['5d','近 5 個交易日'],['21d','近 21 個交易日']]){
  const button=pill(label,()=>choose(range));button.dataset.period=range;controls.append(button);
 }
 const wrap=el('div',null,'market-table-layout');
 const list=el('div');
 list.append(controls,state,ranking);
 wrap.append(list,detail);section.append(header,wrap);
 choose('1d');
 quoteChart(detail,rows.find(row=>row.ticker===selected)?.ticker||'SOXX');
 return section;
}
function statusRow(){
 const s=el('p',null,'fm-data-status');
 const success=(market?.items||[]).filter(x=>x.value!=null).length;
 s.textContent='行情：'+success+'/'+(market?.items?.length||0)+' 檔有資料 · 收盤日期依標的顯示 · 伺服器檢查 '+stamp(market?.updatedUTC)+' · 後端最多快取 3 分鐘';
 const stale=market?.items?.filter(x=>x.possiblyStale)||[];
 if(stale.length){
  s.append(el('span',' · '+stale.length+' 檔資料日期較舊（可能含休市或來源延遲）','fm-stale-notice'));
 }
 const refresh=el('button','立即重新檢查','fm-refresh-button');
 refresh.type='button';refresh.onclick=async()=>{refresh.disabled=true;refresh.textContent='正在檢查…';
  try{await render(true)}finally{refresh.disabled=false;refresh.textContent='立即重新檢查'}
 };
 s.append(refresh);
 return s;
}
async function render(force=false){
 const page=root.dataset.view;
 const changed=activePage!==page;
 if(changed){
  unmountNews?.();
  unmountNews=null;
  activePage=page;
 }
 if(!main.includes(page)){portal.hidden=true;return}
 portal.hidden=false;
 if(page==='quant'){portal.replaceChildren(quantHub());return}

 if(page==='news'){
  if(!changed)return;
  const section=el('section',null,'fm-wire-page');
  portal.replaceChildren(section);
  unmountNews=window.equationNews.mount(section,{official:()=>get('/api/market/news','news',120000)});
  return;
 }
 if(page==='overview'&&changed){
  homeQuotes();
  updateHomeActivity();
  unmountNews=window.equationNews.mount(root.querySelector('.qhero-wire'),{preview:true});
 }
 if(changed || !portal.querySelector('.fm-panel')){
  portal.replaceChildren(el('p','載入市場資料中…','fm-loading'));
 }
 try{
  market=await get('/api/market/overview','market',120000,force);
  if(root.dataset.view!==page)return;
  if(page==='overview'){homeQuotes();updateHomeActivity()}
  const body=page==='overview'?overview():['markets','stocks'].includes(page)?markets():page==='macro'?macros():sectors();
  portal.replaceChildren(body,statusRow());
 }catch(e){if(root.dataset.view===page){
  if(page==='overview'&&!market){
   root.querySelector('.qhero-quote-strip').replaceChildren(el('p','行情暫時無法取得','fm-meta'));
   root.querySelector('.market-home-activity').replaceChildren(el('p','市場快覽載入失敗','fm-meta'));
  }
  const warning=el('p',portal.querySelector('.fm-panel')?'行情更新失敗，目前顯示上次資料。':'暫時無法取得金融市場資料。','fm-empty fm-market-warning');
  warning.append(pill('重試',()=>render(true)));
  portal.querySelector('.fm-market-warning')?.remove();
  if(portal.querySelector('.fm-panel'))portal.prepend(warning);
  else portal.replaceChildren(warning,sourceLink('Yahoo Finance','https://finance.yahoo.com/'));
 }}
}
document.addEventListener('qtemp-route-change',()=>render());
window.qtempMarkets={quoteChart:(host,symbol,onPeriod,startPeriod)=>quoteChart(host,symbol,{startPeriod,onPeriod})};
function refreshWhenVisible(){
 if(document.hidden||portal.contains(document.activeElement)&&document.activeElement.matches('input,select')||!['overview','markets','stocks','macro','sectors'].includes(root.dataset.view))return;
 if(Date.now()-lastAutoCheck<120000)return;
 lastAutoCheck=Date.now();
 if(Date.now()-(loadedAt.market||0)>120000)render(true);
}
setInterval(refreshWhenVisible,120000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWhenVisible()});
window.addEventListener('focus',refreshWhenVisible);
render();
})();
