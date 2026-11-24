(() => {
'use strict';
const content=document.getElementById('content');
const tapes=document.getElementById('tapes');
const header=document.querySelector('.top-menu');
const format=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2});
const tiny=new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:5});
const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2});
const time=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const tapeNames={crypto:'加密貨幣'};
const menus={
 tw:[['rank','市值排行'],['index','大盤指數'],['etf','台股 ETF'],['lookup','個股查詢'],['disclosures','公司重大訊息'],['news','台股快訊']],
 us:[['rank','市值排行'],['index','主要指數'],['etf','產業與 ETF'],['lookup','個股查詢'],['news','美股快訊']],
 crypto:[['rank','市值排行'],['assets','加密資產總覽'],['lookup','幣種查詢'],['news','加密快訊']],
 rti:[['analysis','行情與 RTI'],['signals','訊號研究'],['zones','區間統計'],['backtest','買賣策略'],['capital','投入策略比較'],['compare','多資產比較'],['resources','研究資源'],['method','指標說明']]
};
const legacy={overview:'home',markets:'us',sectors:'us/etf',stocks:'us/lookup',macro:'us/index',news:'us/news',
 quant:'rti',chart:'rti',signals:'rti',zones:'rti',strategy:'rti',compare:'rti',resources:'rti/method',watchlist:'home'};
const cache=new Map();
const pending=new Map();
let clearNews;
let currentPage='';
const node=(tag,value,cls)=>{
 const element=document.createElement(tag);
 if(value!=null)element.textContent=value;
 if(cls)element.className=cls;
 return element;
};
function anchor(label,href,cls){
 const a=node('a',label,cls);a.href=href;return a;
}
function button(label,action,cls){
 const b=node('button',label,cls);b.type='button';b.onclick=action;return b;
}
function quantity(value,short=false){
 if(typeof value!=='number'||!Number.isFinite(value))return '—';
 return (short?compact:Math.abs(value)<1&&value!==0?tiny:format).format(value);
}
function move(value){
 return typeof value==='number'?(value>0?'+':'')+format.format(value)+'%':'—';
}
const direction=value=>value>0?'rise':value<0?'fall':'';
function dateTime(value){
 if(!value)return '—';
 if(value.length===10)return value;
 const date=new Date(value);
 return Number.isFinite(+date)?time.format(date):'—';
}
const urlSymbol=symbol=>encodeURIComponent(symbol);
const rtiSymbol=(market,ticker)=>market==='crypto'?ticker+'-USD':ticker;
const marketLink=(market,category,symbol)=>'#'+market+'/'+category+(symbol?'/'+urlSymbol(symbol):'');
const rtiLink=symbol=>'#rti/analysis/'+urlSymbol(symbol);
const marketApi=market=>'/api/market/rankings/'+market;
function cleanSymbol(raw,market){
 const value=raw.normalize('NFKC').toUpperCase().trim();
 if(market==='tw'&&/^\d{4,6}[A-Z]?$/.test(value))return value+'.TW';
 if(market==='crypto')return /^[A-Z0-9]{1,18}$/.test(value)?value+'-USD':value;
 return value;
}
async function get(path,ttl=90000){
 if(cache.get(path)?.expires>Date.now())return cache.get(path).data;
 if(pending.has(path))return pending.get(path);
 const task=(async ()=>{
  try{
   const response=await fetch(path,{signal:AbortSignal.timeout(45000)});
   const data=await response.json();
   if(!response.ok||data.error)throw Error(data.error||'資料來源暫不可用');
   if(cache.size>=32)cache.delete(cache.keys().next().value);
   cache.set(path,{data,expires:Date.now()+ttl});
   return data;
  }finally{pending.delete(path)}
 })();
 pending.set(path,task);return task;
}
function notice(parent,text,action){
 const state=node('div',text,'terminal-notice');
 state.setAttribute('role','status');
 if(action)state.append(button('重試',action,'terminal-button'));
 parent.replaceChildren(state);
}
function timestamp(data){
 return node('p',[data.source,data.stale?'上次成功資料':null,data.checkedAt?'查詢 '+dateTime(data.checkedAt):null].filter(Boolean).join(' · '),'terminal-meta');
}
function seriesLink(market,row){
 const symbol=rtiSymbol(market,row.ticker);
 return marketLink(market,'lookup',symbol);
}
function tapeList(market,data,duplicate=false){
 const series=node('div',null,'tape-series');
 if(duplicate)series.setAttribute('aria-hidden','true');
 for(const row of data.items){
  const item=anchor('',seriesLink(market,row),'tape-item');
  if(duplicate)item.tabIndex=-1;
  item.title=row.name+' · 市值 '+quantity(row.marketCap,true)+' '+row.currency;
  item.append(node('span','#'+row.rank,'tape-rank'),node('strong',row.ticker),node('span',quantity(row.value)),
              node('span',move(row.changePct),direction(row.changePct)));
  series.append(item);
 }
 return series;
}
async function refreshTape(market,track,label){
 try{
  const data=await get(marketApi(market),120000);
  track.replaceChildren(tapeList(market,data),tapeList(market,data,true));
  const original=track.firstElementChild;
  if(original.getBoundingClientRect().width<track.parentElement.clientWidth)track.lastElementChild.remove();
  track.classList.toggle('moving',track.childElementCount===2);
  if(!label.querySelector('small'))label.append(node('small'));
  label.querySelector('small').textContent=data.stale?'舊資料':data.source==='Yahoo Finance'?'前 10':data.source;
  label.title=[data.source,data.stale?'目前顯示上次成功資料':null,data.checkedAt&&dateTime(data.checkedAt)].filter(Boolean).join(' · ');
 }catch{
  if(!track.classList.contains('moving'))track.replaceChildren(node('span','市值排名載入中或暫不可用','terminal-meta'));
 }
}
function mountTapes(){
 const row=node('div',null,'tape-row');
 const label=node('span','MARKETS','tape-label');
 const window=node('div',null,'tape-window');
 const track=node('div',null,'tape-track');
 track.append(node('span','載入市值排行…','terminal-meta'));
 window.append(track);row.append(label,window);tapes.append(row);
 async function refresh(){
  if(document.hidden)return;
  const results=await Promise.allSettled(Object.keys(tapeNames).map(market=>get(marketApi(market),120000)));
  const build=duplicate=>{
   const series=node('div',null,'tape-series');
   if(duplicate)series.setAttribute('aria-hidden','true');
   results.forEach((result,i)=>{
    const market=Object.keys(tapeNames)[i];
    if(result.status==='fulfilled'){
     series.append(node('span',tapeNames[market],'tape-group'));
     const list=tapeList(market,result.value,duplicate);
     while(list.firstChild)series.append(list.firstChild);
    }
   });
   return series;
  };
  if(results.some(r=>r.status==='fulfilled')){
   track.replaceChildren(build(false),build(true));
   track.classList.add('moving');
  }else track.replaceChildren(node('span','市值排行暫時無法取得','terminal-meta'));
 }
 refresh();setInterval(refresh,150000);document.addEventListener('visibilitychange',refresh);
 const control=document.getElementById('pause-tapes');
 control.onclick=()=>{const paused=tapes.classList.toggle('paused');control.textContent=paused?'播放跑馬燈':'暫停跑馬燈';control.setAttribute('aria-pressed',String(paused))};
}
function table(columns,rows,empty='沒有可顯示的資料'){
 const wrap=node('div',null,'terminal-table-wrap');wrap.tabIndex=0;
 const table=node('table',null,'terminal-table');
 const head=table.createTHead().insertRow();
 for(const [label] of columns){const th=node('th',label);th.scope='col';head.append(th)}
 const body=table.createTBody();
 for(const row of rows){
  const tr=body.insertRow();
  for(const [,cell,style] of columns){
   const td=tr.insertCell();
   const value=cell(row);
   if(value instanceof Node)td.append(value);
   else td.textContent=value??'—';
   if(style)td.className=style(row);
  }
 }
 if(!rows.length){const td=body.insertRow().insertCell();td.colSpan=columns.length;td.textContent=empty}
 wrap.append(table);return wrap;
}
function marketTable(market,rows,ranked){
 const label=market==='crypto'?'幣種':'標的';
 const quoteLabel=ranked?(market==='crypto'?'現貨價格':'最近報價'):'收盤價';
 const cols=[
  [label,row=>{
   const name=anchor(row.ticker,seriesLink(market,row),'terminal-symbol');
   const stack=node('span',null,'symbol-stack');
   stack.append(name,node('small',row.name));return stack;
  }],
  [quoteLabel,row=>quantity(row.value)+(row.unit==='%'?'%':'')],
  [market==='crypto'?'24H 漲跌':ranked?'日漲跌':'收盤漲跌',row=>move(row.changePct),row=>direction(row.changePct)],
  [market==='crypto'?'24H 成交額':'成交量',row=>quantity(row.volume,true)],
  ...(ranked?[['市值',row=>quantity(row.marketCap,true)],['排名',row=>row.rank]]:[]),
  ['幣別',row=>row.currency==='index'?'點':row.currency],
  ['資料時間',row=>dateTime(row.asOf)]
 ];
 return table(cols,rows);
}
function marketBoard(host,market,category){
 const ranked=category==='rank';
 const path=ranked?marketApi(market):'/api/market/segment/'+market+'/'+category;
 notice(host,'正在取得'+(ranked?'市值前十':'收盤行情')+'…');
 get(path).then(data=>{
  if(!host.isConnected)return;
  host.replaceChildren(marketTable(market,data.items,ranked),timestamp(data));
  if(ranked&&market==='us')host.append(node('p','涵蓋美國交易所掛牌公司與 ADR，同一公司的多類股合併計列。','terminal-meta'));
  if(ranked&&market==='crypto')host.append(node('p','市值排名包含穩定幣，成交額以美元計。','terminal-meta'));
 }).catch(error=>{if(host.isConnected)notice(host,error.message,()=>marketBoard(host,market,category))});
}
function showHome(){
 const hero=node('section',null,'terminal-hero');
 const left=node('div',null,'hero-left');
 const copy=node('div',null,'hero-copy');
 const eyebrow=node('p','CRYPTO MARKETS / QUANTITATIVE RESEARCH','hero-regions');
 const title=node('h1',null,'hero-headline');
 title.append(node('span','RTI Market Terminal'));
 const intro=node('p','行情排行、加密快訊與 RTI 指標回測。','hero-description');
 const links=node('div',null,'hero-links');
 links.append(anchor('探索市場','#crypto','terminal-button primary'),anchor('RTI 深度回測','#rti/backtest','terminal-button'));
 copy.append(eyebrow,title,intro,links);
 const metrics=node('div',null,'hero-metrics');
 for(const [label,value,detail] of [['市場專區','01','加密貨幣'],['市場快訊','LIVE','EquationNews'],['資產排行','100','CoinMarketCap'],['技術分析','RTI','歷史溫度與回測']]){
  const box=node('div');box.append(node('small',label),node('strong',value),node('small',detail));metrics.append(box);
 }
 left.append(copy,metrics);
 const right=node('div',null,'hero-terminal');
 const status=node('div',null,'hero-terminal-title');status.append(node('span','MARKET OVERVIEW'),node('span','● LIVE DATA','hero-live'));
 const preview=node('div',null,'hero-preview');notice(preview,'讀取市場資料…');
 right.append(status,preview,node('p','市場資料依來源更新時間顯示。','hero-footnote'));
 hero.append(left,right);content.append(hero);
 get('/api/market/crypto/assets',300000).then(data=>{
  if(!preview.isConnected)return;
  const items=data.items.slice(0,8);const featured=items[0];
  const headline=node('div',null,'hero-quote');
  headline.append(node('strong',featured.symbol+' / USD'),node('strong',quantity(featured.price),'hero-price'),node('span',move(featured.change24h),direction(featured.change24h)));
  const metrics=node('div',null,'hero-quote-metrics');
  for(const [label,value] of [['市值',quantity(featured.marketCap,true)],['24H 成交額',quantity(featured.volume,true)],['7D 漲跌',move(featured.change7d)],['資料來源',data.source]]){
   const box=node('div');box.append(node('small',label),node('strong',value));metrics.append(box);
  }
  const quoteTable=table([['資產',x=>anchor(x.symbol,marketLink('crypto','lookup',x.symbol+'-USD'),'terminal-symbol')],['價格 USD',x=>quantity(x.price)],['24H',x=>move(x.change24h),x=>direction(x.change24h)],['市值',x=>quantity(x.marketCap,true)]],items);
  const actions=node('div',null,'hero-preview-actions');actions.append(anchor('查看全部資產','#crypto/assets','terminal-button'),anchor('市場快訊','#crypto/news','terminal-button'));
  preview.replaceChildren(headline,metrics,quoteTable,actions,timestamp(data));
 }).catch(error=>{if(preview.isConnected)notice(preview,error.message,()=>showHome())});
 const section=node('section',null,'home-listing');
 const heading=node('div',null,'home-listing-header');
 heading.append(node('div',null,'home-heading-copy'),anchor('完整市場排行','#crypto/assets','terminal-button'));
 heading.firstChild.append(node('p','THE MARKETS','hero-regions'),node('h2','市場概況'));
 section.append(heading);
 const boards=node('div',null,'home-markets');
 for(const [market,label] of Object.entries(tapeNames)){
  const group=node('section',null,'home-market');const head=node('div',null,'home-market-heading');
  head.append(node('h2',label),anchor('查看全部','#'+market,'terminal-link'));
  const slot=node('div');group.append(head,slot);boards.append(group);notice(slot,'讀取市值排行…');
  get(marketApi(market),120000).then(data=>{
   if(!slot.isConnected)return;
   slot.replaceChildren(marketTable(market,data.items.slice(0,5),true),timestamp(data));
  }).catch(error=>{if(slot.isConnected)notice(slot,error.message,()=>showHome())});
 }
 section.append(boards);content.append(section);
}
function frame(market,category){
 const wrapper=node('div',null,'terminal-layout');
 const sidebar=node('aside',null,'terminal-sidebar');
 const nav=node('nav');
 nav.setAttribute('aria-label',(tapeNames[market]||'RTI')+'子選單');
 sidebar.append(node('strong',tapeNames[market]||'RTI'),nav);
 for(const [id,label] of menus[market]){
  const link=anchor(label,marketLink(market,id));
  if(id===category)link.setAttribute('aria-current','page');
  nav.append(link);
 }
 const body=node('article',null,'terminal-page'+(market==='rti'?' rti-research-page':''));
 const area=node('div');
 const title=node('h1',menus[market].find(item=>item[0]===category)[1]);
 body.append(title,area);wrapper.append(sidebar,body);content.append(wrapper);
 return area;
}
function showCryptoAssets(host){
 notice(host,'正在讀取加密資產資料…');
 get('/api/market/crypto/assets',300000).then(data=>{
  if(!host.isConnected)return;
  const intro=node('p','依市值排序的加密資產，點選代號查看行情；點選列可展開供給與估值資訊。','terminal-meta');
  const search=node('input');search.placeholder='搜尋名稱或代號';search.setAttribute('aria-label','搜尋加密資產');
  const details=node('div',null,'terminal-method');details.append(node('h2','資產詳情'),node('p','選擇表格中的資產查看供給與估值。'));
  const view=node('div');
  function render(){
   const query=search.value.toLowerCase();
   const rows=data.items.filter(x=>(x.symbol+' '+x.name).toLowerCase().includes(query));
   const columns=[['排名',x=>x.rank],['資產',x=>{const b=button(x.symbol+' · '+x.name,()=>detail(x),'terminal-link');return b}],
    ['價格 USD',x=>quantity(x.price)],['1H',x=>move(x.change1h),x=>direction(x.change1h)],
    ['24H',x=>move(x.change24h),x=>direction(x.change24h)],['7D',x=>move(x.change7d),x=>direction(x.change7d)],
    ['30D',x=>move(x.change30d),x=>direction(x.change30d)],['市值',x=>quantity(x.marketCap,true)],['24H 成交額',x=>quantity(x.volume,true)]];
   view.replaceChildren(table(columns,rows));
  }
  function detail(x){
   details.replaceChildren(node('h2',x.name+' / '+x.symbol),table([['資料',x=>x[0]],['數值',x=>x[1]]],[
    ['流通供給量',quantity(x.circulating,true)],['總供給量',quantity(x.totalSupply,true)],['最大供給量',quantity(x.maxSupply,true)],
    ['完全稀釋估值 USD',quantity(x.fullyDiluted,true)],['市值占比',move(x.dominance)],['成交額 24H 變化',move(x.volumeChange)],
    ['分類',(x.tags||[]).join('、')||'—'],['更新時間',dateTime(x.lastUpdated)]]),
    anchor('查看價格與 RTI',marketLink('crypto','lookup',x.symbol+'-USD'),'terminal-button'));
  }
  search.oninput=render;render();
  host.replaceChildren(intro,search,timestamp(data),view,details);
 }).catch(error=>{if(host.isConnected)notice(host,error.message,()=>showCryptoAssets(host))});
}
function showBacktest(host,symbol){
 const form=node('form',null,'terminal-form');
 function field(label,value,type){const wrap=node('label',label);const input=node('input');input.type=type;input.value=value;input.required=true;wrap.append(input);form.append(wrap);return input}
 const ticker=field('標的代號',symbol||'2330.TW','text');
 const start=field('開始日期','2016-01-01','date');
 const end=field('結束日期',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'date');
 const initial=field('起始本金','100000','number');initial.min='1';
 const allocation=field('每次買賣比例 %','100','number');allocation.min='0.01';allocation.max='100';allocation.step='0.01';
 const fee=field('單次交易成本 %','0.1','number');fee.min='0';fee.max='5';fee.step='0.01';
 const submit=node('button','執行回測','terminal-button primary');submit.type='submit';form.append(submit);
 const result=node('div');host.append(node('p','檢視 RTI 訊號在歷史期間的資金表現與交易紀錄，並與買入持有比較。','terminal-meta'),form,result);
 form.onsubmit=event=>{
  event.preventDefault();const selected=cleanSymbol(ticker.value,ticker.value.match(/^\d/) ? 'tw' : 'us');
  const params=new URLSearchParams({start:start.value,end:end.value,initial:initial.value,allocation:allocation.value,fee:fee.value});
  notice(result,'正在計算歷史日線與 RTI 訊號…');submit.disabled=true;
  get('/api/rti/'+urlSymbol(selected)+'/backtest?'+params,180000).then(data=>{
   if(!result.isConnected)return;
   const vitals=node('div',null,'rti-vitals');
   for(const [label,value] of [['期末資產',quantity(data.value)],['累積報酬',move(data.totalReturn*100)],['年化報酬',move(data.annualizedReturn*100)],['最大回撤',move(data.maxDrawdown*100)],['買入持有',move(data.benchmarkReturn*100)]]){
    const box=node('div');box.append(node('small',label),node('strong',value));vitals.append(box);
   }
   const graph=node('div',null,'terminal-chart');
   result.replaceChildren(vitals,node('p',[data.symbol,data.start+' 至 '+data.end,data.source,data.stale?'上次成功資料':null].filter(Boolean).join(' · '),'terminal-meta'),
    node('p',data.note,'terminal-meta'),node('h2','策略資產曲線'),graph,node('h2','交易明細'),table([
     ['日期',x=>x.day],['方向',x=>x.action==='buy'?'買入':'賣出'],['成交價格',x=>quantity(x.price)],['成交數量',x=>quantity(x.shares)],
     ['剩餘現金',x=>quantity(x.cash)],['持有數量',x=>quantity(x.holdings)],['交易後資產',x=>quantity(x.equity)]
    ],data.transactions,'所選期間沒有可執行的正式訊號。'));
   drawSeries(graph,data.curve.map(x=>({day:x.day,close:x.value})),{title:'RTI 策略資產',divergences:[]});
  }).catch(error=>{if(result.isConnected)notice(result,error.message)}).finally(()=>submit.disabled=false);
 };
}
function showDisclosures(host){
 notice(host,'正在取得上市櫃公司重大訊息…');
 get('/api/market/tw/disclosures').then(data=>{
  if(!host.isConnected)return;
  const link=anchor('公開資訊觀測站','https://mops.twse.com.tw/','terminal-link');
  link.target='_blank';link.rel='noopener noreferrer';
  const list=node('section',null,'terminal-disclosures');
  for(const row of data.items){
   const item=node('article');
   item.append(node('p',[dateTime(row.asOf),row.source,row.symbol,row.name].filter(Boolean).join(' · '),'terminal-meta'),
    node('h2',row.title));
   list.append(item);
  }
  if(!data.items.length)list.append(node('p','目前沒有可顯示的公告或來源暫不可用。','terminal-meta'));
  host.replaceChildren(list,timestamp(data),link);
 }).catch(error=>{if(host.isConnected)notice(host,error.message,()=>showDisclosures(host))});
}
function showNews(host,market){
 const traditionalMarkets=/債券|债券|外匯|外汇|currency|forex|\btreasury\b|\bbonds?\b/i;
 const taiwan=/台灣|臺灣|台湾|台股|臺股|台積電|台积电|聯發科|联发科|鴻海|鸿海|\bTAIWAN\b|\bTSMC\b|\bTAIEX\b/i;
 const text=story=>[story.zh,story.en].filter(Boolean).join(' ');
 const cryptoChannels=['main','pricechange','oi','major','binance','korea','tier2','tier3','alpha','hl','cz','earn'];
 if(market==='crypto'){
  clearNews=window.equationNews.mount(host,{allowedChannels:cryptoChannels,initialChannel:'main',
   storyFilter:item=>!(item.channels||[]).includes('tradfi')&&!traditionalMarkets.test(text(item))});
 }else if(market==='tw'){
  clearNews=window.equationNews.mount(host,{allowedChannels:['tradfi'],initialChannel:'tradfi',
   storyFilter:item=>taiwan.test(text(item))&&!traditionalMarkets.test(text(item))});
 }else{
  clearNews=window.equationNews.mount(host,{allowedChannels:['tradfi','tfmoves'],initialChannel:'tfmoves',
   storyFilter:item=>!traditionalMarkets.test(text(item))&&((item.channels||[]).includes('tfmoves')||
    /美股|美國|美国|美联储|聯準會|标普|標普|纳斯达克|那斯達克|道琼斯|道瓊|\bUS\b|\bNASDAQ\b|S&P|Dow Jones|NYSE|Wall Street|Fed /i.test(text(item)))});
 }
}
const edges=[['1mo','1 月',23],['3mo','3 月',66],['6mo','6 月',130],['1y','1 年',260],['2y','2 年',520],['5y','5 年',1300]];
function drawSeries(host,rows,{field='close',title,temperature=false,divergences=[]}={}){
 const ns='http://www.w3.org/2000/svg';
 function svg(tag,attributes,value){
  const element=document.createElementNS(ns,tag);
  for(const [name,v] of Object.entries(attributes))element.setAttribute(name,v);
  if(value!=null)element.textContent=value;
  return element;
 }
 const usable=rows.filter(row=>Number.isFinite(row[field]));
 if(usable.length<2){notice(host,'尚無足夠有效數據繪圖。');return}
 const points=usable.map(row=>row[field]);
 const rawMin=Math.min(...points),rawMax=Math.max(...points);
 const margin=(rawMax-rawMin||Math.max(rawMax*.01,.01))*.09;
 const lower=temperature?-7:rawMin-margin;
 const upper=temperature?107:rawMax+margin;
 const width=1024,height=temperature?250:280;
 const left=92,right=width-25,top=18,bottom=height-32;
 const x=i=>left+i*(right-left)/(rows.length-1);
 const y=value=>bottom-(value-lower)*(bottom-top)/(upper-lower);
 const chart=svg('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title});
 for(const step of temperature?[0,50,100]:Array.from({length:5},(_,i)=>lower+i*(upper-lower)/4)){
  chart.append(svg('line',{x1:left,x2:right,y1:y(step),y2:y(step),class:'chart-grid'}),
   svg('text',{x:left-7,y:y(step)+5,'text-anchor':'end'},quantity(step)));
 }
 const labelStep=Math.max(1,Math.floor((rows.length-1)/4));
 for(let index=0;index<rows.length;index+=labelStep){
  if(index!==0&&rows.length-index<labelStep*.35)break;
  chart.append(svg('text',{x:x(index),y:height-8,'text-anchor':'middle'},rows[index].day));
 }
 let from=null;
 const visible=new Map();
 rows.forEach((row,index)=>{
  const value=row[field];
  if(!Number.isFinite(value)){from=null;return}
  const pos=[x(index),y(value)];
  visible.set(row.day,pos);
  if(from){
   const tone=temperature?(row.stage!=='formal'?'preview':value<=10?'cold':value>=90?'hot':'neutral'):'price';
   chart.append(svg('line',{x1:from[0],y1:from[1],x2:pos[0],y2:pos[1],class:'chart-path '+tone}));
  }
  if(temperature&&(row.entry||row.hot||row.cold)){
   const hot=row.entry?row.entry==='sell':row.hot;
   chart.append(svg('rect',{x:pos[0]-2,y:y(hot?106:-6)-2,width:4,height:4,class:'chart-mark '+(row.entry?'entry':hot?'hot':'cold')}));
  }
  from=pos;
 });
 for(const event of divergences){
  const from=visible.get(event.start),to=visible.get(event.end);
  if(from&&to)chart.append(svg('line',{x1:from[0],y1:from[1],x2:to[0],y2:to[1],class:'chart-div'}));
 }
 const readout=node('p',null,'terminal-meta chart-readout');
 const read=index=>{
  const row=rows[index];
  const signal=row.entry==='buy'?'買入訊號':row.entry==='sell'?'賣出訊號':row.cold?'相對低溫':row.hot?'相對高溫':'';
  readout.textContent=[row.day,quantity(row[field]),signal].filter(Boolean).join(' · ');
 };
 chart.onpointermove=event=>{
  const box=chart.getBoundingClientRect();
  const pixel=(event.clientX-box.left)*width/box.width;
  read(Math.max(0,Math.min(rows.length-1,Math.round((pixel-left)*(rows.length-1)/(right-left)))));
 };
 chart.onpointerleave=()=>read(rows.length-1);
 read(rows.length-1);
 host.replaceChildren(chart,readout);
}
function lookup(host,market,symbol){
 const form=node('form',null,'terminal-form');
 const field=node('input');
 field.type='search';field.maxLength=24;field.value=symbol||'';
 field.placeholder=market==='tw'?'2330 或 6488.TWO':market==='us'?'NVDA 或 ^SOX':'BTC 或 BTC-USD';
 field.setAttribute('aria-label','標的代號');
 const submit=node('button','查詢','terminal-button primary');submit.type='submit';
 form.append(field,submit);
 const result=node('div',null,'terminal-detail');
 host.append(form,result);
 const selected=cleanSymbol(symbol||'',market);
 form.onsubmit=event=>{
  event.preventDefault();
  const code=cleanSymbol(field.value,market);
  if(!code)return;
  if(code===selected)load(edges[1][0]);
  else location.hash=marketLink(market,'lookup',code);
 };
 if(!selected){notice(result,'輸入代號或從市值排行選取標的。');return}
 const expected={tw:/^[A-Z0-9]+\.(TW|TWO)$|^\^TWII$/,us:/^(?:[A-Z][A-Z0-9-]{0,19}|\^[A-Z0-9]{1,10})$/,crypto:/^[A-Z0-9][A-Z0-9_-]{0,20}-USD$/};
 if(!expected[market].test(selected)){notice(result,'請輸入這個市場的有效代號。');return}
 const summary=node('div',null,'detail-heading');
 const ranges=node('div',null,'terminal-actions');
 const chart=node('div',null,'terminal-chart');
 result.append(summary,ranges,chart);
 for(const [range,label] of edges){
  const action=button(label,()=>load(range),'terminal-button');action.dataset.range=range;ranges.append(action);
 }
 let generation=0;
 function load(range){
  const applying=++generation;
  for(const item of ranges.children)item.setAttribute('aria-pressed',String(item.dataset.range===range));
  notice(chart,'載入已確認收盤日線…');
  get('/api/market/history/'+urlSymbol(selected)+'?lookup=1&period='+range).then(data=>{
   if(generation!==applying||!chart.isConnected)return;
   const quote=data.quote||{};
   summary.replaceChildren(node('h2',quote.name||selected),node('strong',quantity(quote.value),'terminal-number'),
      node('span',move(quote.changePct),direction(quote.changePct)),anchor('檢視 RTI',rtiLink(selected),'terminal-button'));
   summary.append(node('p','已確認收盤日 '+data.asOf+' · '+data.source,'terminal-meta'));
   drawSeries(chart,data.points.map(([day,close])=>({day,close})),{title:selected+' 日線走勢'});
  }).catch(error=>{if(generation===applying&&chart.isConnected)notice(chart,error.message,()=>load(range))});
 }
 load(edges[1][0]);
}
function showMethod(host){
 for(const [title,body] of [
  ['技術溫度','共識分數由 EMA50／EMA200 趨勢、CCI20 動能、量價強弱組成，權重為 45／35／20。共識與 EMA200 價格乖離以 35／50 加權，校準前以 EMA3 平滑。'],
  ['分位與樣本','每日只用當日以前的樣本比較，平手採中間名次。預設股票 504 根、加密 730 根。圖上顯示 0–100 分位；校準分數使用 −100 至 +100。原始映射與初步分位標為暫算。'],
  ['訊號與年度統計','低溫為 RSI14 低於 30 且校準分數低於 −90，高溫為 RSI14 高於 70 且校準分數高於 90。訊號結束的下一根採開盤價計入年度統計，金色方塊標示。'],
  ['已確認背離','選取後顯示符合價格、溫度、K 棒方向與路徑限制的背離。右側 3 根已收盤 K 棒確認後才繪製。'],
  ['歷史本益比','僅供獨立參考，使用先前日線和最近四次已公布的實際 EPS。若報告間隔、資料日期或樣本不足，顯示無可用數據。'],
  ['網頁資料口徑','股票採 Yahoo Finance 還原日線，加密使用已結束的 UTC 日線。即時盤中候選與 Discord 通知可於原 TradingView 指標使用。']
 ]){
  const section=node('section',null,'terminal-method');section.append(node('h2',title),node('p',body));host.append(section);
 }
}
function showRTI(host,symbol){
 const options=new URLSearchParams(location.search);
 const form=node('form',null,'terminal-form');
 const input=node('input');input.type='search';input.maxLength=24;input.value=symbol||'SPY';
 input.placeholder='2330.TW／NVDA／BTC-USD';input.setAttribute('aria-label','RTI 標的代號');
 const bars=node('input');bars.type='number';bars.min=30;bars.max=1000;bars.placeholder='自動';bars.value=options.get('rank')||'';
 const minimum=node('input');minimum.type='number';minimum.min=30;minimum.max=1000;
 minimum.placeholder='自動';minimum.value=options.get('minimum')||'';
 const div=node('input');div.type='checkbox';div.checked=options.get('divergence')==='1';
 for(const [label,field] of [['標的代號',input],['比較 K 棒數',bars],['最低樣本',minimum],['顯示已確認背離',div]]){
  const group=node('label',label);group.append(field);form.append(group);
 }
 const submit=node('button','計算 RTI','terminal-button primary');submit.type='submit';form.append(submit);
 const slot=node('div',null,'rti-output');
 host.append(form,slot);
 let generation=0;
 function load(){
  const selected=input.value.trim().normalize('NFKC').toUpperCase();
  if(!selected){notice(slot,'輸入要分析的標的。');return}
  const query=new URLSearchParams();
  if(bars.value)query.set('rank',bars.value);
  if(minimum.value)query.set('minimum',minimum.value);
  if(div.checked)query.set('divergence','1');
  const url=new URL(location.href);url.search=query.toString();url.hash=rtiLink(selected);
  history.replaceState(null,'',url);
  currentPage=location.hash;
  const version=++generation;
  notice(slot,'計算已確認日線溫度…');
  get('/api/rti/'+urlSymbol(selected)+'?'+query,120000).then(data=>{
   if(version!==generation||!slot.isConnected)return;
   renderRTI(slot,data);
  }).catch(error=>{if(version===generation&&slot.isConnected)notice(slot,error.message,load)});
 }
 form.onsubmit=event=>{event.preventDefault();load()};
 load();
}
function renderRTI(host,data){
 const rows=data.rows;
 const latest=rows.at(-1);
 const stages={formal:'正式分位',preliminary:'初步分位（暫算）',raw:'原始映射（暫算）',none:'資料不足'};
 const summary=node('div',null,'rti-vitals');
 for(const [label,value] of [
  ['標的',data.symbol],['技術溫度',quantity(latest.percentile)],['校準分數',quantity(latest.score)],
  ['RSI',quantity(latest.rsi)],['正式樣本',latest.samples+' / '+data.minimum]
 ]){
  const stat=node('div');stat.append(node('small',label),node('strong',value));summary.append(stat);
 }
 const tools=node('div',null,'terminal-actions');
 const price=node('div',null,'terminal-chart');
 const oscillator=node('div',null,'terminal-chart');
 host.replaceChildren(summary,node('p',[stages[latest.stage],data.asOf,data.priceBasis,'比較 '+data.rankLength+' 根',data.stale?'上次成功資料':null].filter(Boolean).join(' · '),'terminal-meta'),
  tools,node('h2','價格走勢'),price,node('h2','RTI 技術溫度'),oscillator);
 const crypto=data.symbol.endsWith('-USD');
 for(const [range,label,count] of edges){
  const chip=button(label,()=>show(count,chip),'terminal-button');chip.dataset.range=range;tools.append(chip);
 }
 function show(count,active){
  for(const item of tools.children)item.setAttribute('aria-pressed',String(item===active));
  const view=rows.slice(-Math.round(crypto?count*365/252:count));
  drawSeries(price,view,{title:data.symbol+' 價格走勢',divergences:[]});
  drawSeries(oscillator,view,{field:'percentile',title:'RTI 技術溫度',temperature:true,divergences:data.divergences});
 }
 show(260,tools.children[3]);
 const stats=node('section',null,'terminal-statistics');
 const years=node('select');years.setAttribute('aria-label','年度統計顯示年數');
 for(const count of [1,3,5,10,15])years.add(new Option('近 '+count+' 年',count));
 years.value='10';
 const options=node('div',null,'terminal-actions');options.append(node('h2','年度進場統計'),years);
 const yearTable=node('div');
 const update=()=>yearTable.replaceChildren(table([
   ['年度',x=>x.year],['過冷買入次數',x=>x.buyCount],['買入均價',x=>quantity(x.buyAverage)],
   ['過熱賣出次數',x=>x.sellCount],['賣出均價',x=>quantity(x.sellAverage)]
  ],data.annual.slice(0,Number(years.value))));
 years.onchange=update;update();
 stats.append(options,yearTable);host.append(stats);
 const study=node('section',null,'terminal-statistics');
 study.append(node('h2','歷史訊號與後續報酬'),node('p','依原站的訊號研究方式，統計正式 RTI 進場訊號後的歷史表現；日數為交易日，報酬以訊號日開盤價至指定日收盤價計算。','terminal-meta'));
 const findings=[];
 for(const type of ['buy','sell'])for(const horizon of [5,20,60,252]){
  const values=[];
  for(let i=0;i<rows.length-horizon;i++){
   const row=rows[i],future=rows[i+horizon];
   if(row.entry===type&&row.stage==='formal'&&row.open>0&&future.close>0)values.push((future.close/row.open-1)*100);
  }
  values.sort((a,b)=>a-b);const n=values.length;
  findings.push({type,horizon,n,avg:n?values.reduce((a,b)=>a+b,0)/n:null,median:n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:null,positive:n?100*values.filter(x=>x>0).length/n:null});
 }
 study.append(table([['訊號',x=>x.type==='buy'?'過冷買入':'過熱賣出'],['持有日數',x=>x.horizon],['有效樣本',x=>x.n],['平均報酬',x=>move(x.avg)],['報酬中位數',x=>move(x.median)],['上漲比例',x=>x.positive==null?'—':quantity(x.positive)+'%']],findings));
 study.append(node('p','資料不足的訊號不列入統計；每個期間的有效樣本數可能不同。未計交易成本、稅與滑價。','terminal-meta'));
 host.append(study);
 if(data.divergences.length){
  const panel=node('section',null,'terminal-statistics');
  panel.append(node('h2','已確認背離'),table([
   ['類型',x=>x.kind==='bull'?'底背離':'頂背離'],['起點',x=>x.start],['終點',x=>x.end],['確認日',x=>x.confirmed]
  ],data.divergences.slice(-20).reverse()));
  host.append(panel);
 }
 if(!crypto&&!data.symbol.startsWith('^')){
  const valuation=node('section',null,'terminal-method');
  const payload=node('div');
  const load=()=>{
   notice(payload,'讀取已公布 EPS…');
   get('/api/rti/'+urlSymbol(data.symbol)+'/valuation',90000).then(detail=>{
    if(!payload.isConnected)return;
    payload.replaceChildren(detail.value==null?node('p',detail.note||'最近四次公告 EPS 不足、過期或無有效估值。'):
      node('p','本益比 '+quantity(detail.value)+' 倍 · EPS '+quantity(detail.eps)+' · 歷史分位 '+(detail.percentile==null?'樣本不足':quantity(detail.percentile)+'%')+' · 資料日 '+detail.asOf));
   }).catch(()=>{if(payload.isConnected)notice(payload,'暫時無法取得已公布 EPS',load)});
  };
  valuation.append(node('h2','歷史本益比'),button('讀取已公布 EPS',load,'terminal-button'),payload);
  host.append(valuation);
 }
}
function rtiResearch(host,view,symbol){
 const form=node('form',null,'terminal-form');
 const input=node('input');input.type='search';input.value=symbol||'SPY';input.required=true;input.setAttribute('aria-label','RTI 標的代號');
 const group=node('label','標的代號');group.append(input);const submit=node('button','查詢','terminal-button primary');submit.type='submit';form.append(group,submit);
 const output=node('div');host.append(form,output);
 function load(){
  const code=cleanSymbol(input.value,input.value.match(/^\d/) ? 'tw':'us');
  notice(output,'讀取 RTI 歷史資料…');
  get('/api/rti/'+urlSymbol(code)+(view==='signals'?'?divergence=1':''),120000).then(data=>{
   if(!output.isConnected)return;
   const all=data.rows;const selector=node('select');selector.setAttribute('aria-label','統計期間');
   for(const n of [1,3,5,10,15,0])selector.add(new Option(n?'近 '+n+' 年':'全部歷史',String(n)));
   selector.value='10';const panel=node('div',null,'rti-research-results');const header=node('div',null,'terminal-actions rti-research-controls');header.append(node('strong',data.symbol),selector,button('匯出日線 CSV',()=>downloadRows(all,data.symbol),'terminal-button'));
   output.replaceChildren(header,node('p',[data.priceBasis,'資料日 '+data.asOf,data.stale?'上次成功資料':null].filter(Boolean).join(' · '),'terminal-meta'),panel);
   function update(){
    const years=Number(selector.value);const end=new Date(all.at(-1).day+'T00:00:00Z');end.setUTCFullYear(end.getUTCFullYear()-years);
    const rows=all.filter(r=>!years||r.day>=end.toISOString().slice(0,10));const formal=rows.filter(r=>r.stage==='formal'&&Number.isFinite(r.score));
    panel.replaceChildren();
    if(view==='zones'){
     const zones=[['極端低溫',-Infinity,-95],['低溫',-95,-75],['偏弱',-75,-35],['中性',-35,35.0000001],['偏強',35.0000001,75.0000001],['高溫',75.0000001,95.0000001],['極端高溫',95.0000001,Infinity]];
     const metrics=zones.map(([name,lo,hi])=>{let days=0,segments=0,longest=0,run=0;for(const r of rows){if(r.stage==='formal'&&r.score>=lo&&r.score<hi){days++;if(!run)segments++;run++;longest=Math.max(run,longest)}else run=0}return {name,days,segments,longest,average:segments?days/segments:null,pct:formal.length?days/formal.length*100:null}});
     panel.append(node('h2','RTI 七區間歷史統計'),node('p','依 RTI 校準分數分類；僅使用正式分位，暖機與暫算日中斷連續區間。','terminal-meta'),table([['區間',x=>x.name],['天數',x=>x.days],['比例',x=>x.pct==null?'—':quantity(x.pct)+'%'],['進入次數',x=>x.segments],['平均連續日數',x=>quantity(x.average)],['最長連續日數',x=>x.longest]],metrics));
     const annual=[...new Set(formal.map(x=>x.day.slice(0,4)))].reverse().map(year=>({year,...Object.fromEntries(zones.map(([name,lo,hi])=>[name,formal.filter(x=>x.day.startsWith(year)&&x.score>=lo&&x.score<hi).length]))}));
     panel.append(node('h2','年度區間分布'),table([['年度',x=>x.year],...zones.map(([name])=>[name,x=>x[name]])],annual));
    }else if(view==='signals'){
     const events=rows.filter(r=>r.entry&&r.stage==='formal').map(r=>({day:r.day,type:r.entry,price:r.open,score:r.score,rsi:r.rsi})).reverse();
     const years=[...new Set(rows.map(x=>x.day.slice(0,4)))].reverse().map(year=>{const y=events.filter(x=>x.day.startsWith(year));const buys=y.filter(x=>x.type==='buy'),sells=y.filter(x=>x.type==='sell');const avg=x=>x.length?x.reduce((v,r)=>v+r.price,0)/x.length:null;return {year,buys:buys.length,buyAvg:avg(buys),sells:sells.length,sellAvg:avg(sells)}});
     panel.append(node('h2','年度訊號統計'),table([['年度',x=>x.year],['買入次數',x=>x.buys],['買入均價',x=>quantity(x.buyAvg)],['賣出次數',x=>x.sells],['賣出均價',x=>quantity(x.sellAvg)]],years));
     const studies=[];for(const kind of ['buy','sell'])for(const n of [5,20,60,252]){const outcomes=[];for(let i=0;i<rows.length-n;i++){const r=rows[i];if(r.entry===kind&&r.stage==='formal'&&r.open>0&&rows[i+n].close>0)outcomes.push((rows[i+n].close/r.open-1)*100)}outcomes.sort((a,b)=>a-b);let k=outcomes.length;studies.push({kind,n,count:k,avg:k?outcomes.reduce((a,b)=>a+b,0)/k:null,median:k?(outcomes[Math.floor((k-1)/2)]+outcomes[Math.floor(k/2)])/2:null,positive:k?outcomes.filter(x=>x>0).length/k*100:null})}
     panel.append(node('h2','事件研究 · 訊號後報酬'),table([['訊號',x=>x.kind==='buy'?'買入':'賣出'],['交易日',x=>x.n],['樣本',x=>x.count],['平均報酬',x=>move(x.avg)],['中位數',x=>move(x.median)],['上漲比例',x=>x.positive==null?'—':quantity(x.positive)+'%']],studies),node('p','訊號日開盤價至指定日收盤價，未計成本。上漲比例是價格上漲比例，不等同賣出訊號勝率。','terminal-meta'));
     panel.append(node('h2','訊號明細與日曆'),table([['日期',x=>x.day],['訊號',x=>x.type==='buy'?'買入':'賣出'],['開盤參考價',x=>quantity(x.price)],['RTI',x=>quantity(x.score)],['RSI',x=>quantity(x.rsi)]],events));
     if(data.divergences.length)panel.append(node('h2','已確認背離'),table([['類型',x=>x.kind==='bull'?'底背離':'頂背離'],['起點',x=>x.start],['終點',x=>x.end],['確認日',x=>x.confirmed]],data.divergences.filter(x=>rows.some(r=>r.day===x.confirmed)).reverse()));
    }else{
     const latest=rows.at(-1);const history=rows.slice(-200).reverse();
     panel.append(node('h2','資料品質'),node('p','日線 '+rows.length+' 筆 · 正式分位 '+formal.length+' 筆 · 最新資料 '+latest.day+' · 正式最低樣本 '+data.minimum+' · '+data.priceBasis,'terminal-meta'),node('p','所有歷史計算以資料來源已結束日線為基礎；資料不足時不補虛構價格。','terminal-meta'),node('h2','日線與 RTI 資料（最近 200 筆）'),table([['日期',x=>x.day],['開盤',x=>quantity(x.open)],['最高',x=>quantity(x.high)],['最低',x=>quantity(x.low)],['收盤',x=>quantity(x.close)],['RTI 分數',x=>quantity(x.score)],['分位',x=>quantity(x.percentile)],['訊號',x=>x.entry==='buy'?'買入':x.entry==='sell'?'賣出':'—']],history),node('h2','指標公式與 TradingView 對照'),node('p','可匯出完整日線及 RTI 欄位，與 TradingView 匯出的同標的、同週期及同價格口徑資料逐日核對。TradingView 盤中資料與網站已收盤日線可能不同。','terminal-meta'),anchor('查看 RTI 計算方式','#rti/method','terminal-button'));
     addCsvAudit(panel,rows);
    }
   }
   selector.onchange=update;update();
  }).catch(e=>{if(output.isConnected)notice(output,e.message,load)});
 }
 form.onsubmit=e=>{e.preventDefault();load()};load();
}
function addCsvAudit(host,rows){
 const section=node('section',null,'terminal-method');section.append(node('h2','TradingView CSV 對照'),node('p','上傳 TradingView 匯出日線 CSV；比較同日期收盤價與 RTI 原始溫度。請選擇相同代號、日線與價格還原口徑。','terminal-meta'));
 const input=node('input');input.type='file';input.accept='.csv,text/csv';input.setAttribute('aria-label','選擇 TradingView CSV');const output=node('div');section.append(input,output);host.append(section);
 input.onchange=async()=>{
  const file=input.files[0];if(!file)return;if(file.size>5*1024*1024){notice(output,'CSV 超過 5 MB');return}
  const lines=(await file.text()).replace(/^\ufeff/,'').trim().split(/\r?\n/);
  const parse=line=>{const cells=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){cells.push(value);value=''}else value+=c}cells.push(value);return cells};
  const head=parse(lines.shift()).map(x=>x.trim().toLowerCase());const dateCol=head.findIndex(x=>['time','date','日期'].includes(x));const closeCol=head.findIndex(x=>['close','收盤','收盤價'].includes(x));const scoreCol=head.findIndex(x=>x.includes('原始溫度')||x.includes('原 −100')||x==='rti');
  if(dateCol<0||closeCol<0){notice(output,'CSV 需要 time/date 與 close 欄位。');return}
  const lookup=new Map(rows.map(r=>[r.day,r]));const matches=[];
  for(const line of lines){const cells=parse(line);let raw=cells[dateCol]||'';if(/^\d{10,13}$/.test(raw))raw=new Date(Number(raw)*(raw.length===10?1000:1)).toISOString().slice(0,10);else raw=raw.slice(0,10);const item=lookup.get(raw);if(!item)continue;const close=Number(cells[closeCol]);const score=scoreCol>=0&&cells[scoreCol]!==''?Number(cells[scoreCol]):null;matches.push({day:raw,website:item.close,tv:Number.isFinite(close)?close:null,delta:Number.isFinite(close)?close-item.close:null,rti:item.score,tvRti:Number.isFinite(score)?score:null,rtiDelta:Number.isFinite(score)&&Number.isFinite(item.score)?score-item.score:null})}
  output.replaceChildren(node('p','共同日期 '+matches.length+' 筆'+(scoreCol<0?' · CSV 未找到 RTI 原始溫度欄位，僅比較收盤價':''),'terminal-meta'),table([['日期',x=>x.day],['網站收盤',x=>quantity(x.website)],['TV 收盤',x=>quantity(x.tv)],['收盤差',x=>quantity(x.delta)],['網站 RTI',x=>quantity(x.rti)],['TV RTI',x=>quantity(x.tvRti)],['RTI 差',x=>quantity(x.rtiDelta)]],matches.slice(-200).reverse()));
 };
}
function downloadRows(rows,symbol){
 const cols=['day','open','high','low','close','score','percentile','stage','rsi','cold','hot','entry'];
 const csv='\ufeff'+[cols.join(','),...rows.map(r=>cols.map(k=>r[k]??'').join(','))].join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='RTI_'+symbol+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function showCapital(host){
 const form=node('form',null,'terminal-form');
 function field(label,value,type='number'){const l=node('label',label),v=node('input');v.type=type;v.value=value;v.required=true;l.append(v);form.append(l);return v}
 const symbol=field('標的代號','SPY','text'), start=field('開始日期','2016-01-01','date'),end=field('結束日期',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'date'),initial=field('期初本金','100000'),periodic=field('每期投入','10000'),signal=field('每次訊號投入','10000');
 for(const f of [initial,periodic,signal])f.min='0';
 const frequency=node('select');for(const [k,v] of [['weekly','每週'],['monthly','每月'],['quarterly','每季'],['semiannual','每半年'],['annual','每年']])frequency.add(new Option(v,k));frequency.value='monthly';const fl=node('label','投入頻率');fl.append(frequency);form.append(fl);
 const submit=node('button','執行比較','terminal-button primary');submit.type='submit';form.append(submit);const result=node('div');host.append(form,result);
 form.onsubmit=e=>{e.preventDefault();const code=cleanSymbol(symbol.value,symbol.value.match(/^\d/)?'tw':'us');const q=new URLSearchParams({start:start.value,end:end.value,initial:initial.value,periodic:periodic.value,signal:signal.value,frequency:frequency.value});notice(result,'正在比較投入策略…');get('/api/rti/'+urlSymbol(code)+'/capital?'+q,120000).then(data=>{
 if(!result.isConnected)return;const pct=v=>typeof v==='number'?move(v*100):'—';
 result.replaceChildren(node('p',data.symbol+' · '+data.start+' 至 '+data.end+' · '+data.days+' 個交易日','terminal-meta'),node('p',data.note,'terminal-meta'),table([['策略',x=>x.name],['累積投入',x=>quantity(x.invested)],['期末資產',x=>quantity(x.wealth)],['損益',x=>quantity(x.profit)],['總報酬',x=>pct(x.return)],['XIRR',x=>pct(x.xirr)],['最大回撤',x=>pct(x.maxDrawdown)],['投入次數',x=>x.purchaseCount]],data.strategies));
 for(const strategy of data.strategies){result.append(node('h2',strategy.name+' · 交易明細'),table([['交易日',x=>x.entry],['類型',x=>x.type],['價格',x=>quantity(x.price)],['投入金額',x=>quantity(x.amount)],['累計股數',x=>quantity(x.shares)],['平均成本',x=>quantity(x.avgCost)]],strategy.trades));}
 }).catch(error=>{if(result.isConnected)notice(result,error.message)})};
}
function showComparison(host){
 const form=node('form',null,'terminal-form');
 function field(label,value){const l=node('label',label),v=node('input');v.value=value;l.append(v);form.append(l);return v}
 const symbols=field('標的（最多 4 檔，逗號分隔）','SPY,QQQ');const weights=field('權重（逗號分隔；留空等權）','');
 const benchmark=node('select');for(const b of ['SPY','QQQ','SOXX'])benchmark.add(new Option(b,b));const b=node('label','基準');b.append(benchmark);form.append(b);
 const period=node('select');for(const [id,label] of [['1y','1 年'],['3y','3 年'],['5y','5 年'],['10y','10 年'],['all','全部']])period.add(new Option(label,id));period.value='10y';const p=node('label','期間');p.append(period);form.append(p);
 const rebalance=node('select');for(const [id,label] of [['none','不再平衡'],['quarterly','每季'],['annual','每年']])rebalance.add(new Option(label,id));const rr=node('label','再平衡');rr.append(rebalance);form.append(rr);
 const submit=node('button','比較','terminal-button primary');submit.type='submit';form.append(submit);const result=node('div');host.append(form,result);
 form.onsubmit=e=>{e.preventDefault();const q=new URLSearchParams({symbols:symbols.value,weights:weights.value,benchmark:benchmark.value,period:period.value,rebalancing:rebalance.value});notice(result,'讀取共同交易日資料…');get('/api/rti/compare?'+q,120000).then(data=>{
 if(!result.isConnected)return;result.replaceChildren(node('p','共同交易日 '+data.commonStart+' 至 '+data.commonEnd+' · '+data.commonDays+' 日 · 基準 '+data.benchmark,'terminal-meta'),node('h2','多資產績效與風險'),table([['標的',x=>x.symbol],['RTI',x=>quantity(x.rti)],...Object.entries({totalReturn:'總報酬',cagr:'年化報酬',volatility:'年化波動',maxDrawdown:'最大回撤',sharpe:'夏普比率',winRate:'日上漲比例',beta:'Beta',alpha:'Alpha'}).map(([k,label])=>[label,x=>typeof x.metrics[k]==='number'?(['totalReturn','cagr','volatility','maxDrawdown','winRate','alpha'].includes(k)?move(x.metrics[k]*100):quantity(x.metrics[k])):'—'])],data.assets),node('h2','相關係數'),table([['標的',x=>x.symbol],...data.symbols.map(s=>[s,x=>quantity(x.values[s])])],data.correlations),...data.notes.map(x=>node('p',x,'terminal-meta')));
 }).catch(error=>{if(result.isConnected)notice(result,error.message)})};
}
function route(){
 if(location.hash==='#content')return;
 if(location.hash===currentPage&&content.childElementCount)return;
 currentPage=location.hash;
 clearNews?.();clearNews=null;
 let [market,category,symbol]=location.hash.slice(1).split('/');
 if(legacy[market]){
  const redirect=legacy[market];
  [market,category]=redirect.split('/');
  history.replaceState(null,'','#'+redirect);
  currentPage=location.hash;
 }
 try{symbol=decodeURIComponent(symbol||'')}catch{symbol=''}
 for(const a of header.querySelectorAll('nav a')){
  if(a.hash==='#'+market)a.setAttribute('aria-current','page');
  else a.removeAttribute('aria-current');
 }
 content.replaceChildren();
 if(!['crypto','rti'].includes(market))showHome();
 else {
  if(!menus[market].some(item=>item[0]===category))category=menus[market][0][0];
  const host=frame(market,category);
  if(market==='rti'){if(category==='method')showMethod(host);else if(category==='backtest')showBacktest(host,symbol);else if(category==='capital')showCapital(host);else if(category==='compare')showComparison(host);else if(['signals','zones','resources'].includes(category))rtiResearch(host,category,symbol);else showRTI(host,symbol);}
  else if(category==='news')showNews(host,market);
  else if(category==='assets')showCryptoAssets(host);
  else if(category==='lookup')lookup(host,market,symbol);
  else if(category==='disclosures')showDisclosures(host);
  else marketBoard(host,market,category);
 }
 if(window.scrollY>0)window.scrollTo({top:0,behavior:'instant'});
}
mountTapes();
window.addEventListener('hashchange',route);
route();
})();

