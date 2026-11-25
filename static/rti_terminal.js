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
const marketNames={...tapeNames,tw:'台股',us:'美股',rti:'RTI'};
const menus={
 tw:[['listed','上市收盤'],['otc','上櫃收盤'],['rank','市值排行'],['index','大盤指數'],['etf','台股 ETF'],['lookup','個股查詢'],['disclosures','公司重大訊息'],['news','台股快訊']],
 us:[['rank','市值排行'],['index','主要指數'],['etf','產業與 ETF'],['lookup','個股查詢'],['news','美股快訊']],
 crypto:[['assets','加密資產總覽'],['workbench','單幣研究'],['events','事件研究'],['overview','市場指標'],['sectors','板塊輪動'],['derivatives','衍生品監控'],['chain','鏈上與交易所'],['news','快訊與公告']],
 rti:[['analysis','行情與 RTI'],['signals','訊號研究'],['zones','區間統計'],['backtest','買賣策略'],['capital','投入策略比較'],['compare','多資產比較'],['resources','研究資源'],['method','指標說明'],['quality','資料品質']]
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
 return marketLink(market,market==='crypto'?'assets':'lookup',symbol);
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
 document.getElementById('qtemp_root').classList.add('landing-mode');
 const hero=node('section',null,'terminal-hero');
 const left=node('div',null,'hero-left');
 const copy=node('div',null,'hero-copy');
 const title=node('h1','RTI Market Terminal','hero-headline');
 const links=node('div',null,'hero-links');
 links.append(anchor('加密貨幣','#crypto','terminal-button primary'),anchor('台股','#tw','terminal-button'),anchor('美股','#us','terminal-button'),anchor('RTI 指標回測','#rti','terminal-button'));
 copy.append(title,links);left.append(copy);hero.append(left);content.append(hero);

 const sections=node('section',null,'landing-sections');sections.id='landing-sections';
 const intro=node('div',null,'landing-intro');
 intro.append(node('span','MARKET & RESEARCH','landing-label'),node('h2','網站功能'),node('p','選擇專區，查看市場資料與指標研究。'));
 const grid=node('div',null,'landing-cards');
 const card=(label,title,description,href,shortcuts,visual)=>{
  const article=node('article',null,'landing-card '+visual);
  const visualHost=node('div',null,'landing-card-visual');visualHost.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++)visualHost.append(node('i'));
  const body=node('div',null,'landing-card-body');
  body.append(node('span',label,'landing-label'),node('h3',title),node('p',description),anchor('進入專區',href,'landing-open'));
  const shortcutsRow=node('nav',null,'landing-shortcuts');shortcutsRow.setAttribute('aria-label',title+'快速入口');
  for(const [name,link] of shortcuts)shortcutsRow.append(anchor(name,link));
  article.append(visualHost,body,shortcutsRow);return article;
 };
 grid.append(card('CRYPTO','加密貨幣','市值排行、資產資料與繁體中文快訊。','#crypto',
  [['加密資產總覽','#crypto/assets'],['市場指標','#crypto/overview'],['快訊與公告','#crypto/news']],'landing-card-crypto'),
  card('RTI RESEARCH','RTI 指標回測','查看技術溫度、歷史訊號及策略研究。','#rti',
  [['訊號研究','#rti/signals'],['買賣策略','#rti/backtest']],'landing-card-rti'));
 sections.append(intro,grid);
 const foot=node('div',null,'landing-bottom');foot.append(node('strong','RTI Market Terminal'),node('span','加密貨幣・指標研究'));sections.append(foot);
 content.append(sections);
}
function frame(market,category){
 const wrapper=node('div',null,'terminal-layout');
 const sidebar=node('aside',null,'terminal-sidebar');
 const nav=node('nav');
 nav.setAttribute('aria-label',marketNames[market]+'子選單');
 sidebar.append(node('strong',marketNames[market]),nav);
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
function cryptoResource(key,params={}){
 return get('/api/market/crypto/resources/'+key+'?'+new URLSearchParams(params),300000);
}
function cryptoPanel(host,title,key,display,params={}){
 const panel=node('section',null,'terminal-statistics crypto-panel');
 const body=node('div');
 panel.append(node('h2',title),body);host.append(panel);
 function load(){
  notice(body,'載入資料…');
  Promise.all([cryptoResource(key,params),window.equationNews.prepareChinese()]).then(([result])=>{
   if(!body.isConnected)return;
   body.replaceChildren();
   display(body,result.data);
   body.append(timestamp(result));
  }).catch(error=>{if(body.isConnected)notice(body,error.message,load)});
 }
 load();return panel;
}
function textList(host,entries){
 host.append(table([['項目',x=>x[0]],['資料',x=>x[1]]],entries.filter(([,v])=>v!==undefined&&v!==null&&v!=='')));
}
function numerical(value,short=false){
 if(value==null||value==='')return '—';
 return quantity(Number(value),short);
}
function cryptoDate(value){
 if(!value)return '—';
 if(/^\d{10}$/.test(String(value)))return dateTime(new Date(Number(value)*1000).toISOString());
 return dateTime(String(value));
}
function asList(data,...keys){
 if(Array.isArray(data))return data;
 for(const key of keys)if(Array.isArray(data?.[key]))return data[key];
 return [];
}
function usdQuote(row){
 const quotes=row?.quote??row?.quotes;
 return Array.isArray(quotes)?quotes.find(q=>q.symbol==='USD'||q.convert_symbol==='USD'||q.id===2781||q.convert_id===2781)||{}:quotes?.USD||{};
}
function externalLink(url,label){
 try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))return null;
  const link=anchor(label,parsed.href,'terminal-button');link.target='_blank';link.rel='noopener noreferrer';return link;
 }catch{return null;}
}
function showCryptoAssets(host,symbol){
 const sorts=[['rank','排名'],['price','價格'],['change1h','1 小時漲跌'],['change24h','24 小時漲跌'],
  ['change7d','7 天漲跌'],['marketCap','市值'],['volume','24 小時成交額']];
 const header=node('div',null,'crypto-sort');
 header.setAttribute('role','group');header.setAttribute('aria-label','全市場排序');
 const form=node('form',null,'terminal-actions');
 const search=node('input');search.type='search';search.placeholder='篩選已載入資產';search.setAttribute('aria-label','搜尋加密資產');
 const submit=node('button','依完整代號查找','terminal-button');submit.type='submit';
 const filter=node('select',null,'glass-select');filter.setAttribute('aria-label','加密資產漲跌篩選');
 for(const [label,value] of [['全部資產','all'],['24H 上漲','up'],['24H 下跌','down']])filter.add(new Option(label,value));
 const count=node('output',null,'glass-count');
 const total=node('span','顯示筆數 ','terminal-meta');total.append(count);
 form.append(search,submit,filter,total);
 const state=node('p',null,'terminal-meta');state.setAttribute('role','status');
 const view=node('div'), details=node('div',null,'terminal-method'), result=node('div');
 details.hidden=true;
 const more=button('載入更多',()=>load(false),'terminal-button');more.hidden=true;
 const retry=button('重試',()=>load(rows.length===0),'terminal-button');retry.hidden=true;
 const actions=node('div',null,'terminal-actions');actions.append(more,retry);
 host.append(header,form,result,state,view,actions,details);
 let rows=[], page=0, provider='', sort='rank', order='desc', generation=0, lookupGeneration=0, hasMore=false;
 for(const [field,label] of sorts){
  const chip=button(label,()=>{
   order=sort===field?(order==='asc'?'desc':'asc'):'desc';
   sort=field;
   updateSort();load(true);
  },'terminal-button');
  chip.dataset.sort=field;header.append(chip);
 }
 function updateSort(){
  for(const chip of header.children){
   const selected=chip.dataset.sort===sort;
   const label=sorts.find(([key])=>key===chip.dataset.sort)[1];
   chip.setAttribute('aria-pressed',String(selected));
   chip.textContent=label+(selected?(sort==='rank'?(order==='desc'?' ↑':' ↓'):(order==='asc'?' ↑':' ↓')):'');
  }
 }
 function assetButton(x){return button(x.symbol+' · '+x.name,()=>detail(x),'terminal-link')}
 function render(){
  const query=search.value.trim().toLowerCase();
  const filtered=rows.filter(x=>(x.symbol+' '+x.name).toLowerCase().includes(query)
    && (filter.value==='all'||(filter.value==='up'?x.change24h>0:x.change24h<0)));
  if(window.rtiGlass)window.rtiGlass.count(count,filtered.length);else count.textContent=filtered.length;
  const entries=[['排名',x=>x.rank],['資產',assetButton],['價格 USD',x=>quantity(x.price)],
    ['1H',x=>move(x.change1h),x=>direction(x.change1h)],['24H',x=>move(x.change24h),x=>direction(x.change24h)],
    ['7D',x=>move(x.change7d),x=>direction(x.change7d)],['30D',x=>move(x.change30d),x=>direction(x.change30d)],
    ['市值 USD',x=>quantity(x.marketCap,true)],['24H 成交額 USD',x=>quantity(x.volume,true)]];
  view.replaceChildren(table(entries,filtered));
  const index={rank:0,price:2,change1h:3,change24h:4,change7d:5,marketCap:7,volume:8}[sort];
  view.querySelectorAll('th')[index]?.setAttribute('aria-sort',(sort==='rank'?order==='desc':order==='asc')?'ascending':'descending');
 }
 async function load(reset){
  const generationAtRequest=++generation;
  if(reset){rows=[];page=0;hasMore=false;provider='';render();}
  const query=new URLSearchParams({page:page+1,sort,order,provider});
  more.disabled=true;retry.hidden=true;
  state.textContent='載入第 '+(page+1)+' 批資產…';
  try{
   const data=await get('/api/market/crypto/assets?'+query,300000);
   if(!host.isConnected||generationAtRequest!==generation)return;
   if(!Array.isArray(data.items))throw Error('來源回傳的資產格式異常');
   const known=new Set(rows.map(x=>x.providerId));
   rows.push(...data.items.filter(x=>!known.has(x.providerId)));
   provider=data.source;page=data.page;hasMore=data.hasMore;
   state.textContent=provider+' · 已載入 '+rows.length+' 筆'+(data.checkedAt?' · 查詢 '+dateTime(data.checkedAt):'');
   render();
  }catch(error){
   if(!host.isConnected||generationAtRequest!==generation)return;
   state.textContent=error.message;retry.hidden=false;
  }finally{
   if(generationAtRequest===generation){more.hidden=!hasMore;more.disabled=false;}
  }
 }
 function detail(x){
  details.hidden=false;
  const title=node('h2',x.name+' / '+x.symbol);
  title.tabIndex=-1;
  details.replaceChildren(title,button('收合詳情',()=>{details.hidden=true},'terminal-button'));
  textList(details,[
   ['流通供給量',quantity(x.circulating,true)],['總供給量',quantity(x.totalSupply,true)],['最大供給量',quantity(x.maxSupply,true)],
   ['完全稀釋估值 USD',quantity(x.fullyDiluted,true)],['市值占比',move(x.dominance)],['成交額 24H 變化',move(x.volumeChange)],
   ['中央交易所成交額 USD',quantity(x.cexVolume,true)],['去中心化交易所成交額 USD',quantity(x.dexVolume,true)],
   ['總鎖倉量 USD',quantity(x.tvl,true)],['交易對數',x.marketPairs],['60 天漲跌',move(x.change60d)],['90 天漲跌',move(x.change90d)],
   ['區塊鏈',x.chain],['合約地址',x.address],['分類',window.equationNews.traditional((x.tags||[]).filter(Boolean).join('、'))],['更新時間',dateTime(x.lastUpdated)]]);
  const links=node('div',null,'terminal-actions');
  if(['BTC','ETH'].includes(x.symbol))links.append(anchor('單幣研究',marketLink('crypto','workbench',x.symbol),'terminal-button'));
  links.append(anchor('查看 RTI 行情',rtiLink(x.symbol+'-USD'),'terminal-button'),anchor('查看相關快訊',marketLink('crypto','news',x.symbol),'terminal-button'));
  details.append(links);
  if(Number.isInteger(x.providerId)){
   links.append(button('載入幣種檔案',()=>{
    if(details.querySelector('.crypto-profile'))return;
    cryptoPanel(details,'幣種檔案','info',(out,data)=>{
     const info=data[String(x.providerId)]??{};
     textList(out,[['名稱',info.name],['代號',info.symbol],['類型',info.category==='coin'?'原生幣':info.category==='token'?'代幣':null],['CMC 收錄時間',cryptoDate(info.date_added)],
      ['簡介',info.description?.match(/[\u3400-\u9fff]/)?window.equationNews.traditional(info.description):info.description]]);
     for(const [key,label] of [['website','官網'],['technical_doc','白皮書'],['explorer','區塊鏈瀏覽器'],['source_code','原始碼']]){
      const link=externalLink(info.urls?.[key]?.[0],label);if(link)out.append(link,' ');
     }
    },{id:x.providerId}).classList.add('crypto-profile');
   },'terminal-button'),button('載入近 30 日報價',()=>{
    if(details.querySelector('.crypto-history'))return;
    cryptoPanel(details,'近 30 日報價快照','quote-history',(out,data)=>{
     const record=data?.quotes?data:data?.[String(x.providerId)];
     out.append(table([['時間',r=>cryptoDate(r.timestamp)],['價格 USD',r=>numerical(usdQuote(r).price)],
      ['市值 USD',r=>numerical(usdQuote(r).market_cap,true)],['成交額 USD',r=>numerical(usdQuote(r).volume_24h,true)]],asList(record,'quotes').slice().reverse()));
    },{id:x.providerId}).classList.add('crypto-history');
   },'terminal-button'));
  }
  title.focus();
 }
 async function lookupAsset(raw){
  const code=raw.trim().toUpperCase().replace(/-USD$/,'');
  if(!/^[A-Z0-9$@-]{1,18}$/.test(code)){notice(result,'請輸入完整幣種代號，例如 BTC');return;}
  const id=++lookupGeneration;
  notice(result,'查找 '+code+'…');
  try{
   const {data}=await cryptoResource('asset',{address:code});
   if(!host.isConnected||id!==lookupGeneration)return;
   result.replaceChildren();
   if(!data.length){notice(result,'找不到符合的幣種');return;}
   if(data.length===1)detail(data[0]);
   else result.append(node('p','找到多個同代號資產，請選擇要查看的標的。'),...data.map(assetButton));
  }catch(error){if(host.isConnected&&id===lookupGeneration)notice(result,error.message,()=>lookupAsset(code));}
 }
 search.oninput=()=>{lookupGeneration++;result.replaceChildren();render()};
 form.onsubmit=event=>{event.preventDefault();lookupAsset(search.value)};
 filter.onchange=render;
 updateSort();load(true);
 if(symbol){search.value=symbol.replace(/-USD$/i,'');lookupAsset(search.value);}
}
const cryptoMetrics=[
 ['global','全市場概況'],['fear','恐懼與貪婪'],['altseason','山寨幣季節'],['cmc20','CMC 20'],['cmc100','CMC 100']
];
function metricValue(value){
 return value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
}
function metricPercent(value){
 return metricValue(value)===null?'—':numerical(value)+'%';
}
function metricDate(value){
 const time=/^\d{10}$/.test(String(value))?Number(value)*1000:Date.parse(value);
 return Number.isFinite(time)?new Date(time).toISOString().slice(0,10):'';
}
function metricCards(out,entries){
 const list=node('dl',null,'metric-cards');
 for(const [label,value] of entries){
  const card=node('div');
  card.append(node('dt',label),node('dd',value??'—'));
  list.append(card);
 }
 out.append(list);
}
function metricGauge(out,{value,label,kind,left,right}){
 const score=metricValue(value);
 if(score===null||score<0||score>100){notice(out,'來源目前未提供有效的指數值。');return;}
 const meter=node('div',null,'metric-gauge '+kind);
 meter.setAttribute('role','img');meter.setAttribute('aria-label',label+'，'+score+' 分，滿分 100');
 const arc=node('div',null,'metric-gauge-arc');
 const pin=node('span',null,'metric-gauge-pin');pin.style.setProperty('--angle',(score*1.8-90)+'deg');
 arc.append(pin);
 const reading=node('div',null,'metric-gauge-reading');
 const scoreLine=node('div',null,'metric-gauge-score');
 scoreLine.append(node('strong',String(score)),node('small',' / 100'));
 reading.append(scoreLine,node('span',label));
 arc.append(reading);
 const scale=node('div',null,'metric-gauge-scale');
 scale.append(node('span','0 · '+left),node('span',right+' · 100'));
 meter.append(arc,scale);out.append(meter);
}
function metricHistory(out,records,series,period='近 30 日'){
 const rows=records.filter(r=>r.day).sort((a,b)=>a.day.localeCompare(b.day));
 const bar=node('div',null,'terminal-actions metric-chart-controls');
 const chart=node('div',null,'terminal-chart metric-chart');
 function plot(index){
  const [label,key,format,bounds]=series[index];
  bar.querySelectorAll('button').forEach((chip,i)=>chip.setAttribute('aria-pressed',String(i===index)));
  drawSeries(chart,rows,{field:key,title:label+period+'走勢',valueFormat:format,bounds,compactDates:true});
 }
 if(series.length>1){
  series.forEach(([label],i)=>bar.append(button(label,()=>plot(i),'terminal-button')));
  out.append(bar);
 }
 out.append(chart);plot(0);
 const details=node('details',null,'metric-history-table');
 details.append(node('summary','查看歷史數據'),table(
  [['日期（UTC）',r=>r.day],...series.map(([label,key,format])=>[label,r=>format(r[key])])],
  rows.slice().reverse()));
 out.append(details);
}
function showCryptoDashboard(host,requested){
 const selected=cryptoMetrics.some(([key])=>key===requested)?requested:'global';
 const links=node('nav',null,'crypto-sort metric-nav');
 links.setAttribute('aria-label','市場指標分類');
 for(const [key,label] of cryptoMetrics){
  const link=anchor(label,'#crypto/overview?metric='+key,'terminal-button');
  if(key===selected)link.setAttribute('aria-current','page');
  links.append(link);
 }
 host.append(links);
 const usd=value=>metricValue(value)===null?'—':'US$ '+numerical(value,true);
 const points=value=>numerical(value);
 const mood=value=>({'extreme fear':'極度恐懼',fear:'恐懼',neutral:'中性',greed:'貪婪','extreme greed':'極度貪婪'}[String(value||'').trim().toLowerCase().replace(/[_-]+/g,' ')]);
 if(selected==='global'){
  cryptoPanel(host,'全市場概況','global',(out,d)=>{
   const q=usdQuote(d);
   metricCards(out,[['總市值',usd(q.total_market_cap)],['24H 成交額',usd(q.total_volume_24h)],['BTC 市占率',metricPercent(d.btc_dominance)],['ETH 市占率',metricPercent(d.eth_dominance)]]);
   const btc=metricValue(d.btc_dominance),eth=metricValue(d.eth_dominance);
   if(btc!==null&&eth!==null&&btc>=0&&eth>=0&&btc+eth<=100){
    const share=node('div',null,'metric-share');
    share.setAttribute('role','img');share.setAttribute('aria-label','BTC '+btc+'%，ETH '+eth+'%，其餘資產 '+numerical(100-btc-eth)+'%');
    for(const [name,value] of [['BTC',btc],['ETH',eth],['其他',100-btc-eth]]){
     const part=node('span',name+' '+numerical(value)+'%');
     part.style.flexBasis=value+'%';share.append(part);
    }
    out.append(share);
   }
   const details=node('details',null,'metric-history-table');details.append(node('summary','查看其他市場統計'));
   textList(details,[['山寨幣市值',usd(q.altcoin_market_cap)],['山寨幣 24H 成交額',usd(q.altcoin_volume_24h)],['活躍幣種',points(d.active_cryptocurrencies)],['活躍交易所',points(d.active_exchanges)],['活躍交易對',points(d.active_market_pairs)]]);
   out.append(details);
  });
  cryptoPanel(host,'近 30 日市場走勢','global-history',(out,d)=>metricHistory(out,asList(d,'quotes').map(x=>({
   day:metricDate(x.timestamp),marketCap:metricValue(usdQuote(x).total_market_cap),volume:metricValue(usdQuote(x).total_volume_24h),
   btc:metricValue(x.btc_dominance),eth:metricValue(x.eth_dominance)
  })),[['總市值','marketCap',usd],['24H 成交額','volume',usd],['BTC 市占率','btc',metricPercent],['ETH 市占率','eth',metricPercent]]));
 }else if(selected==='fear'){
  cryptoPanel(host,'恐懼與貪婪','fear',(out,d)=>{
   const label=mood(d.value_classification??d.valueClassification??d.classification)||'市場情緒';
   metricGauge(out,{value:d.value,label,kind:'metric-fear',left:'恐懼',right:'貪婪'});
   out.append(node('p','指數時間 '+cryptoDate(d.update_time||d.timestamp),'terminal-meta'));
  });
  cryptoPanel(host,'近 30 日市場情緒','fear-history',(out,d)=>metricHistory(out,asList(d,'data','points').map(x=>({
   day:metricDate(x.timestamp),value:metricValue(x.value)
  })),[['恐懼與貪婪','value',points,[0,100]]]));
 }else if(selected==='altseason'){
  cryptoPanel(host,'山寨幣季節','altseason',(out,d)=>{
   metricGauge(out,{value:d.altcoin_index,label:'山寨幣季節指數',kind:'metric-alt',left:'比特幣季節',right:'山寨幣季節'});
   metricCards(out,[['一年最高',points(d.yearly_high)],['一年最低',points(d.yearly_low)],['山寨幣市值',usd(d.altcoin_marketcap)]]);
  });
  cryptoPanel(host,'近 30 日山寨幣季節','altseason-history',(out,d)=>metricHistory(out,asList(d,'points','historical','data','altcoinSeasonIndex').map(x=>({
   day:metricDate(x.timestamp??x.time??x.snapshot_time),value:metricValue(x.altcoin_index??x.altcoinIndex??x.value)
  })),[['山寨幣季節指數','value',points,[0,100]]]));
 }else{
  const name=cryptoMetrics.find(([key])=>key===selected)[1];
  cryptoPanel(host,name,selected,(out,d)=>{
   const weights=asList(d,'constituents').slice().sort((a,b)=>b.weight-a.weight);
   metricCards(out,[['最新指數',points(d.value)],['24H 漲跌',d.value_24h_percentage_change==null?'—':move(Number(d.value_24h_percentage_change))],['成分幣數',String(weights.length)]]);
   const constituents=node('details',null,'metric-history-table');
   constituents.append(node('summary','查看成分幣與權重'),table([
    ['成分幣',r=>anchor(r.symbol+' · '+r.name,marketLink('crypto','assets',r.symbol))],
    ['權重',r=>{
     const cell=node('span',null,'metric-weight');const weight=metricValue(r.weight);
     cell.append(node('span',metricPercent(weight)));
     if(weight!==null){const bar=node('meter');bar.min=0;bar.max=100;bar.value=Math.max(0,Math.min(100,weight));bar.setAttribute('aria-label',r.symbol+' 指數權重');cell.append(bar);}
     return cell;
    }]
   ],weights));
   out.append(constituents);
  });
  cryptoPanel(host,name+' 歷史走勢',selected+'-history',(out,d)=>metricHistory(out,asList(d,'quotes','points','data').map(x=>({
   day:metricDate(x.update_time??x.timestamp??x.last_update),value:metricValue(x.value)
  })),[[name,'value',points]],'歷史'));
  host.append(externalLink('https://coinmarketcap.com/charts/'+selected+'/','在 CMC 查看'+name+'歷史圖'));
 }
 const sources=node('details',null,'terminal-method metric-history-table');
 sources.append(node('summary','資料來源與延伸資源'));
 const resources=node('div',null,'terminal-actions');
 resources.append(externalLink('https://coinmarketcap.com/api/documentation/pro-api-reference/','CMC 資料目錄'),
  externalLink('https://coinmarketcap.com/api/pricing/','CMC 資料方案'),
  externalLink('https://eqn.news/api-docs','方程式新聞 API'));
 sources.append(resources);host.append(sources);
}
const eventName={main:'主頻道快訊',binance:'幣安公告',korea:'韓國交易所公告',pricechange:'價格異動',oi:'OI 異動',major:'重大行情'};
const scripts=new Map();
function loadScript(url){
 if(scripts.has(url))return scripts.get(url);
 const task=new Promise((resolve,reject)=>{
  const script=node('script');script.src=url;
  const timer=setTimeout(()=>{script.remove();reject(Error('圖表載入逾時'));},7000);
  script.onload=()=>{clearTimeout(timer);resolve();};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('圖表載入失敗'));};
  document.head.append(script);
 }).catch(error=>{scripts.delete(url);throw error;});
 scripts.set(url,task);return task;
}
function eventTitle(row){
 return window.equationNews.traditional(row.title||'未提供標題');
}
function eventFilter(host,coin,withChannel,load){
 const tools=node('div',null,'terminal-actions');
 const assets=node('select');assets.setAttribute('aria-label','研究幣種');
 for(const id of ['BTC','ETH'])assets.add(new Option(id,id));
 assets.value=coin==='ETH'?'ETH':'BTC';tools.append(assets);
 const channel=node('select');channel.setAttribute('aria-label','事件類型');
 for(const [key,label] of Object.entries(eventName))channel.add(new Option(label,key));
 if(withChannel)tools.append(channel);
 host.append(tools);
 function change(){load(assets.value,channel.value)}
 assets.onchange=channel.onchange=change;
 change();
}
function eventLink(row){
 const link=externalLink(row.eventUrl||row.url,eventTitle(row));
 return link||eventTitle(row);
}
function eventResearchView(host,symbol){
 const output=node('div');
 host.append(node('p','以事件發布後第一根已收盤小時線為基準，比較 1 小時、24 小時及 7 天的報酬與同期 BTC。每類最多讀取最近 100 則事件。缺線或尚未到期的樣本不計。','terminal-meta'));
 let version=0;
 eventFilter(host,symbol,true,(coin,channel)=>{
  const request=++version;
  notice(output,'載入方程式事件與小時行情…');
  Promise.all([get('/api/market/crypto/events/'+coin+'?study=1&channel='+channel,300000),window.equationNews.prepareChinese()]).then(([data])=>{
   if(request!==version||!output.isConnected)return;
   const label={1:'1 小時',24:'24 小時',168:'7 天'};
   output.replaceChildren(node('h2',coin+' · '+eventName[channel]),node('p','方程式新聞 · '+data.priceSource+' · 行情截至 '+dateTime(data.coverage)+'（台北）','terminal-meta'),
    table([['期間',x=>label[x.hours]],['有效樣本',x=>x.samples],['報酬中位數',x=>move(x.median)],['超額報酬中位數',x=>x.excess==null?'—':format.format(x.excess)+' 個百分點'],
     ['上漲比例',x=>metricPercent(x.positive)],['最低報酬',x=>move(x.minimum)],['最高報酬',x=>move(x.maximum)]],data.stats));
   const rows=data.events.filter(x=>x.returns['24']!=null).map(x=>x.returns['24'].asset);
   if(rows.length){
    const distribution=node('section',null,'terminal-method');
    distribution.append(node('h2','24 小時報酬分布'));
    const buckets=[['低於 −5%',-Infinity,-5],['−5% 至 −1%',-5,-1],['−1% 至 1%',-1,1],['1% 至 5%',1,5],['5% 以上',5,Infinity]];
    distribution.append(table([['區間',x=>x[0]],['樣本',x=>x[1]],['占比',x=>{
     const bar=node('meter');bar.max=rows.length;bar.value=x[1];bar.setAttribute('aria-label',x[0]+' '+x[1]+' 筆');return bar;
    }]],buckets.map(([name,lo,hi])=>[name,rows.filter(v=>v>=lo&&v<hi).length])));
    output.append(distribution);
   }
   output.append(node('h2','事件明細'),table([['發布時間（台北）',x=>dateTime(x.time)],['事件',eventLink],
    ...[1,24,168].map(h=>[label[h],x=>move(x.returns[String(h)]?.asset)]),
    ['24 小時 BTC',x=>move(x.returns['24']?.btc)]],data.events));
  }).catch(error=>{if(request===version&&output.isConnected)notice(output,error.message)});
 });
 host.append(output);
}
function coinWorkbench(host,symbol){
 const panel=node('div');
 let version=0, dispose;
 eventFilter(host,symbol,true,(coin,channel)=>{
  const attempt=++version;
  dispose?.();dispose=null;
  notice(panel,'讀取已收盤日 K 與 RTI…');
  const history=get('/api/rti/'+coin+'-USD',120000);
  const events=Promise.all([get('/api/market/crypto/events/'+coin+'?channel='+channel,300000),window.equationNews.prepareChinese()]);
  Promise.allSettled([history,events]).then(async ([price,news])=>{
   if(attempt!==version||!panel.isConnected)return;
   if(price.status==='rejected'){notice(panel,price.reason.message);return;}
   const data=price.value;
   const rows=data.rows.slice(-365);
   const latest=rows.at(-1);
   if(!latest){notice(panel,'目前沒有可用的日線');return;}
   const timeline=news.status==='fulfilled'?news.value[0].events:[];
   const chart=node('div',null,'workbench-chart terminal-chart');
   const readout=node('p',null,'terminal-meta');
   const range=node('div',null,'terminal-actions');
   const sources=node('div',null,'terminal-actions');
   sources.append(anchor('回測 '+coin,'#rti/backtest/'+coin+'-USD','terminal-button'),anchor('事件研究','#crypto/events/'+coin,'terminal-button'));
   panel.replaceChildren(node('h2',coin+'／USD'),node('p',data.priceBasis+' · 日線截至 '+data.asOf+' UTC'+(data.stale?' · 上次成功資料':''),'terminal-meta'),range,chart,readout,sources);
   readout.textContent='收盤 '+quantity(latest.close)+' USD · RTI 技術溫度 '+quantity(latest.percentile);
   const byDay=new Map();
   for(const row of timeline){
    if(!byDay.has(row.day))byDay.set(row.day,[]);
    byDay.get(row.day).push(row);
   }
   const feed=node('div',null,'terminal-method');
   panel.append(feed);
   function showEvents(day){
    feed.replaceChildren(node('h2',day?day+' UTC 事件':'近期事件'));
    if(news.status==='rejected'){feed.append(node('p','方程式事件暫時無法取得。','terminal-meta'));return;}
    const items=day?(byDay.get(day)||[]):timeline.slice(0,10);
    if(!items.length){feed.append(node('p','這個 UTC 日期沒有載入的事件。','terminal-meta'));return;}
    for(const item of items){
     const entry=node('details');
     entry.append(node('summary',dateTime(item.time)+' · '+eventTitle(item)));
     for(const line of item.summary)entry.append(node('p',window.equationNews.traditional(line)));
     const link=externalLink(item.url,'來源原文');if(link)entry.append(link);
     feed.append(entry);
    }
   }
   showEvents();
   try{
    await loadScript('https://cdn.jsdelivr.net/npm/lightweight-charts@5.0.9/dist/lightweight-charts.standalone.production.js');
    if(attempt!==version||!chart.isConnected)return;
    const L=window.LightweightCharts;
    const chartApi=L.createChart(chart,{autoSize:true,height:460,layout:{background:{color:'#151515'},textColor:'#ddd',attributionLogo:true},grid:{vertLines:{color:'#242424'},horzLines:{color:'#242424'}}});
    dispose=()=>chartApi.remove();
    const candle=chartApi.addSeries(L.CandlestickSeries,{upColor:'#60c3ad',downColor:'#e67d84',borderVisible:false,wickUpColor:'#60c3ad',wickDownColor:'#e67d84'},0);
    const volume=chartApi.addSeries(L.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:''},0);
    volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
    const rti=chartApi.addSeries(L.LineSeries,{color:'#eac395',lineWidth:2},1);
    candle.setData(rows.map(x=>({time:x.day,open:x.open,high:x.high,low:x.low,close:x.close})));
    volume.setData(rows.filter(x=>Number.isFinite(x.volume)).map(x=>({time:x.day,value:x.volume,color:x.close>=x.open?'#60c3ad66':'#e67d8466'})));
    rti.setData(rows.map(x=>Number.isFinite(x.percentile)?{time:x.day,value:x.percentile}:{time:x.day}));
    const markers=rows.flatMap(x=>[
     ...(x.entry&&x.stage==='formal'?[{time:x.day,position:'belowBar',color:x.entry==='buy'?'#60c3ad':'#e67d84',shape:x.entry==='buy'?'arrowUp':'arrowDown',text:x.entry==='buy'?'買入':'賣出'}]:[]),
     ...(byDay.has(x.day)?[{time:x.day,position:'aboveBar',color:'#dadada',shape:'circle',text:String(byDay.get(x.day).length)}]:[])
    ]);
    L.createSeriesMarkers(candle,markers);
    chartApi.subscribeClick(({time})=>{
     if(typeof time==='string')showEvents(time);
     else if(time?.year)showEvents([time.year,String(time.month).padStart(2,'0'),String(time.day).padStart(2,'0')].join('-'));
    });
    const choose=(days,active)=>{
     for(const item of range.children)item.setAttribute('aria-pressed',String(item===active));
     chartApi.timeScale().setVisibleRange({from:rows.at(-Math.min(days,rows.length)).day,to:latest.day});
    };
    for(const days of [30,90,180,365]){
     const chip=button(days+' 日',()=>choose(days,chip),'terminal-button');range.append(chip);
    }
    choose(90,range.children[1]);
    chart.insertAdjacentElement('afterend',node('p','上圖 K 線與成交量 · 下圖 RTI 技術溫度 · 點日期查看事件','terminal-meta'));
    const attribution=externalLink('https://www.tradingview.com/','TradingView Lightweight Charts');
    if(attribution)sources.append(attribution);
   }catch{
    if(attempt!==version||!chart.isConnected)return;
    dispose?.();dispose=null;
    drawSeries(chart,rows.slice(-90),{title:coin+' 收盤價'});
    const oscillator=node('div',null,'terminal-chart');chart.after(oscillator);
    drawSeries(oscillator,rows.slice(-90),{field:'percentile',title:'RTI 技術溫度',temperature:true});
   }
  });
 });
 host.append(panel);
 const observer=new MutationObserver(()=>{
  if(!panel.isConnected){version++;dispose?.();observer.disconnect();}
 });
 observer.observe(content,{childList:true});
}
function officialClose(host,board){
 const area=node('div');host.append(area);
 function load(){
  notice(area,'讀取官方收盤資料…');
  get('/api/market/tw/close/'+board,300000).then(data=>{
   if(!area.isConnected)return;
   const field=node('input');field.type='search';field.placeholder='搜尋代號或名稱';field.setAttribute('aria-label','搜尋收盤行情');
   const view=node('div');const rows=data.items.slice().sort((a,b)=>(b.volume??-1)-(a.volume??-1));
   const update=()=>{
    const q=field.value.trim().toUpperCase();
    view.replaceChildren(table([['代號',x=>anchor(x.ticker,marketLink('tw','lookup',x.ticker))],['名稱',x=>x.name],['收盤（元）',x=>quantity(x.value)],['漲跌',x=>move(x.changePct),x=>direction(x.changePct)],['成交股數',x=>quantity(x.volume)],['交易日',x=>x.asOf]],rows.filter(x=>(x.ticker+' '+x.name).toUpperCase().includes(q)).slice(0,100)));
   };
   area.replaceChildren(node('p',data.source+' · 盤後資料 · 依成交股數顯示前 100 筆，搜尋涵蓋來源全部標的。','terminal-meta'),field,view);
   field.oninput=update;update();
  }).catch(error=>{if(area.isConnected)notice(area,error.message,load)});
 }
 load();
}
function dataQuality(host){
 const groups=[
  ['台股上市收盤','/api/market/tw/close/listed','臺灣證券交易所','官方盤後行情'],
  ['台股上櫃收盤','/api/market/tw/close/otc','證券櫃檯買賣中心','官方盤後行情'],
  ['美股市值榜','/api/market/rankings/us','Yahoo Finance／Nasdaq','報價延遲視來源'],
  ['加密行情','/api/market/rankings/crypto','CoinMarketCap 等','聚合行情'],
  ['方程式快訊','/api/market/crypto/events/BTC?channel=main','方程式新聞','事件發布時間'],
  ['RTI 日線','/api/rti/BTC-USD','Yahoo Finance','加密幣 UTC 已收盤日線']
 ];
 host.append(node('p','檢查目前資料可用性。資料時間與本站檢查時間分開顯示，來源沒提供時間時標為未提供。','terminal-meta'));
 const output=table([['項目',x=>x[0]],['來源',x=>x[2]],['口徑',x=>x[3]],['狀態',()=>node('span','待檢查')],['資料時間',()=>node('span','—')]],groups);
 host.append(output);
 const refresh=button('檢查資料來源',run,'terminal-button');host.append(refresh);
 const checked=node('p',null,'terminal-meta');host.append(checked);
 async function run(){
  refresh.disabled=true;
  const rows=[...output.querySelectorAll('tbody tr')];
  await Promise.all(groups.map(async (group,i)=>{
   const row=rows[i];
   row.cells[3].textContent='檢查中';row.cells[4].textContent='—';
   try{
    const data=await get(group[1],0);
    const item=data.items?.find(x=>x.asOf);
    const asOf=data.asOf||item?.asOf||data.events?.[0]?.time;
    const usable=data.items?.length??data.events?.length??data.rows?.length??0;
    row.cells[1].textContent=data.source||data.priceBasis||group[2];
    row.cells[3].textContent=!usable?'來源無資料':data.stale?'上次成功資料':'可用';
    row.cells[4].textContent=asOf?dateTime(asOf):'未提供';
   }catch{row.cells[3].textContent='暫時無法取得';}
  }));
  checked.textContent='檢查完成 '+dateTime(new Date().toISOString())+'（台北）';refresh.disabled=false;
 }
 run();
}

function showCryptoSectors(host){
 const detail=node('div');
 const panel=cryptoPanel(host,'板塊熱力圖','categories',(out,data)=>{
  const rows=asList(data,'categories').slice().sort((a,b)=>b.market_cap-a.market_cap);
  function open(row){
   detail.replaceChildren();
   cryptoPanel(detail,window.equationNews.traditional(row.name)+' · 成分幣','category',(body,d)=>{
    const coins=asList(d,'coins');
    const observed=coins.filter(x=>metricValue(usdQuote(x).percent_change_24h)!==null);
    const rising=observed.filter(x=>Number(usdQuote(x).percent_change_24h)>0).length;
    body.append(node('p','24H 上漲 '+rising+'／'+observed.length+'（有漲跌資料的已載入成分幣）','terminal-meta'),
     table([['幣種',x=>anchor(x.symbol+' · '+x.name,marketLink('crypto','assets',x.symbol))],['價格 USD',x=>numerical(usdQuote(x).price)],
      ['24H 漲跌',x=>move(metricValue(usdQuote(x).percent_change_24h)),x=>direction(usdQuote(x).percent_change_24h)],
      ['市值 USD',x=>numerical(usdQuote(x).market_cap,true)]],coins));
   },{id:row.id});
   detail.scrollIntoView({block:'nearest'});
  }
  const chart=node('div',null,'sector-heatmap');
  const sectors=rows.filter(row=>Number(row.market_cap)>0).slice(0,24);
  const color=value=>value>0?'#23574c':value<0?'#67373e':'#454545';
  function fallback(){
   chart.replaceChildren(...sectors.map(row=>{
    const tile=button(window.equationNews.traditional(row.name)+' '+move(row.avg_price_change),()=>open(row),'sector-tile');
    tile.style.background=color(row.avg_price_change);return tile;
   }));
  }
  fallback();
  out.append(node('p','顯示市值前 24 個板塊。圖塊面積代表市值，紅綠代表平均漲跌；板塊成分可能重疊。','terminal-meta'),chart);
  loadScript('https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js').then(()=>{
   if(!chart.isConnected||!sectors.length)return;
   chart.replaceChildren();
   chart.classList.add('sector-rendered');
   const tree=window.echarts.init(chart,null,{renderer:'canvas'});
   tree.setOption({aria:{enabled:true},tooltip:{formatter:({data:d})=>d.tooltip},series:[{type:'treemap',roam:false,nodeClick:false,breadcrumb:{show:false},
    label:{color:'#fff',overflow:'truncate'},itemStyle:{borderColor:'#141414',borderWidth:2,gapWidth:2},data:sectors.map((row,index)=>({
     index,name:window.equationNews.traditional(row.name)+'  '+move(row.avg_price_change),value:Number(row.market_cap),itemStyle:{color:color(row.avg_price_change)},
     tooltip:window.echarts.format.encodeHTML(window.equationNews.traditional(row.name)+' · '+quantity(row.market_cap,true)+' USD · '+move(row.avg_price_change))
    }))}]});
   tree.on('click',e=>{if(sectors[e.data?.index])open(sectors[e.data.index])});
   const resize=new ResizeObserver(()=>tree.resize());resize.observe(chart);
   const observer=new MutationObserver(()=>{if(!chart.isConnected){resize.disconnect();tree.dispose();observer.disconnect();}});
   observer.observe(content,{childList:true});
  }).catch(()=>{chart.classList.remove('sector-rendered');fallback();});
  const list=node('details',null,'metric-history-table');
  list.append(node('summary','查看板塊排名表'),table([['板塊',row=>button(window.equationNews.traditional(row.name),()=>open(row),'terminal-link')],['幣種數',x=>x.num_tokens],
   ['平均漲跌',x=>move(x.avg_price_change)],['市值 USD',x=>numerical(x.market_cap,true)],['市值變化',x=>move(x.market_cap_change)],
   ['24H 成交額 USD',x=>numerical(x.volume,true)],['成交額變化',x=>move(x.volume_change)]],rows));
  out.append(list);
 });
 panel.after(detail);
}
const precisePercent=new Intl.NumberFormat('zh-TW',{style:'percent',maximumFractionDigits:6,signDisplay:'exceptZero'});
function contractPercent(value){
 return value==null||!Number.isFinite(Number(value))?'—':precisePercent.format(Number(value));
}
function showCryptoDerivatives(host){
 const form=node('form',null,'terminal-form');
 const label=node('label','標的代號'), input=node('input');input.value='BTC';input.required=true;input.maxLength=18;label.append(input);
 const submit=node('button','查詢合約','terminal-button primary');submit.type='submit';form.append(label,submit);
 const output=node('div');host.append(form,output);
 async function load(){
  const code=input.value.trim().toUpperCase();
  notice(output,'查詢合約…');
  try{
   const result=await cryptoResource('asset',{address:code});
   if(!output.isConnected||input.value.trim().toUpperCase()!==code)return;
   const assets=result.data.filter(x=>Number.isInteger(x.providerId));
   output.replaceChildren();
   if(!assets.length){notice(output,'找不到符合的標的');return;}
   const detail=node('div');
   function contracts(asset){
    detail.replaceChildren();
    cryptoPanel(detail,asset.symbol+' · 永續與期貨','contracts',(out,d)=>{
     out.append(table([['交易所',x=>x.exchange?.exchange_name],['交易對',x=>x.market_pair_symbol],['類型',x=>({perpetual:'永續',futures:'期貨'}[x.category]||x.category)],
      ['價格 USD',x=>numerical(usdQuote(x).price)],['24H 成交額 USD',x=>numerical(usdQuote(x).volume_24h,true)],
      ['未平倉量',x=>numerical(usdQuote(x).open_interest,true)],['資金費率',x=>contractPercent(x.exchange_reported_quotes?.[0]?.funding_rate)],
      ['指數價 USD',x=>numerical(x.exchange_reported_quotes?.[0]?.index_price)],['基差',x=>contractPercent(x.exchange_reported_quotes?.[0]?.index_basis)]],asList(d,'market_pairs')));
    },{id:asset.providerId});
   }
   if(assets.length>1)output.append(...assets.map(x=>button(x.symbol+' · '+x.name,()=>contracts(x),'terminal-button')));
   output.append(detail);contracts(assets[0]);
  }catch(error){if(output.isConnected)notice(output,error.message,load);}
 }
 form.onsubmit=event=>{event.preventDefault();load()};load();
 cryptoPanel(host,'全市場爆倉統計','liquidations',(out,d)=>{
  const q=usdQuote(d);
  out.append(table([['區間',x=>x],['合計 USD',x=>numerical(q['total_liquidations_'+x],true)],
   ['多單 USD',x=>numerical(q['long_liquidations_'+x],true)],['空單 USD',x=>numerical(q['short_liquidations_'+x],true)]],['1h','4h','24h']));
 });
 for(const [title,key] of [['幣種爆倉排行','liquidation-coins'],['交易所爆倉排行','liquidation-exchanges']]){
  cryptoPanel(host,title,key,(out,d)=>{
   const rows=asList(d,'exchanges','cryptocurrencies','items','rankings');
   out.append(table([['標的',x=>x.exchange_name||x.crypto_name||x.name||x.symbol],
    ['24H 合計 USD',x=>numerical(usdQuote(x).total_liquidations_24h,true)],
    ['24H 多單 USD',x=>numerical(usdQuote(x).long_liquidations_24h,true)],
    ['24H 空單 USD',x=>numerical(usdQuote(x).short_liquidations_24h,true)]],rows));
  });
 }
 host.append(anchor('查看方程式 OI 異動','#crypto/news?channel=oi','terminal-button'));
}
function showCryptoChain(host){
 const columns=node('div',null,'crypto-grid');host.append(columns);
 const dex=node('section',null,'terminal-statistics crypto-panel'), exchanges=node('section',null,'terminal-statistics crypto-panel');
 columns.append(dex,exchanges);
 dex.append(node('h2','DEX 代幣與交易池'));
 const form=node('form',null,'terminal-form');
 const chain=node('select');chain.setAttribute('aria-label','區塊鏈');
 for(const [name,value] of [['Ethereum','ethereum'],['Solana','solana'],['BNB Chain','bsc'],['Base','base'],['Arbitrum','arbitrum'],['Polygon','polygon']])chain.add(new Option(name,value));
 const label=node('label','合約地址'),input=node('input');input.required=true;input.maxLength=72;label.append(input);
 const submit=node('button','查詢鏈上資料','terminal-button primary');submit.type='submit';form.append(chain,label,submit);
 const tokens=node('div');dex.append(form,tokens);
 form.onsubmit=event=>{
  event.preventDefault();tokens.replaceChildren();
  cryptoPanel(tokens,'代幣鏈上概況','dex-token',(out,d)=>{
   const stats=asList(d,'sts').find(x=>x.tp==='24h')||{};
   textList(out,[['代幣',d.sym+' · '+d.n],['價格 USD',numerical(d.p)],['市值 USD',numerical(d.mcap,true)],['FDV USD',numerical(d.fdv,true)],['流動性 USD',numerical(d.liqUsd,true)],
    ['持有人數',numerical(d.hld)],['24H 成交額 USD',numerical(stats.vu,true)],['24H Swap 次數',numerical(stats.txs)],
    ['24H 買入／賣出次數',numerical(stats.nb)+' / '+numerical(stats.ns)]]);
   out.append(table([['交易所',r=>r.exn],['交易對',r=>[r.t0?.sym,r.t1?.sym].filter(Boolean).join(' / ')],['流動性 USD',r=>numerical(r.liqUsd,true)],['24H 交易額 USD',r=>numerical(r.v24,true)]],asList(d,'pls')));
  },{platform:chain.value,address:input.value.trim()});
 };
 exchanges.append(node('h2','交易所公開錢包'),node('p','資料依交易所公開資訊提供，可能延遲或缺漏。','terminal-meta'));
 const exchange=node('select');exchange.setAttribute('aria-label','交易所');
 const payload=node('div');exchanges.append(exchange,payload);
 cryptoResource('exchange-list').then(result=>{
  if(!exchange.isConnected)return;
  exchange.add(new Option('選擇交易所',''));
  for(const row of asList(result.data))exchange.add(new Option(row.name,row.id));
 }).catch(error=>{if(payload.isConnected)notice(payload,error.message)});
 exchange.onchange=()=>{
  payload.replaceChildren();
  if(!exchange.value)return;
  cryptoPanel(payload,'錢包與幣種','exchange-assets',(out,data)=>out.append(table([
   ['幣種',x=>x.currency?.symbol],['鏈別',x=>x.platform?.name],['餘額',x=>numerical(x.balance,true)],
   ['錢包地址',x=>{const address=node('code',x.wallet_address);address.className='crypto-address';return address;}]],asList(data))),{id:exchange.value});
 };
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
 const slippage=field('單次滑價 %','0','number');slippage.min='0';slippage.max='5';slippage.step='0.01';
 const delay=field('成交延遲（日 K）','1','number');delay.min='1';delay.max='10';delay.step='1';
 const split=field('前後段切分日（選填）','','date');split.required=false;
 const audit=field('檢查未來資料與暖機','1','checkbox');
 const submit=node('button','執行回測','terminal-button primary');submit.type='submit';form.append(submit);
 const result=node('div');host.append(node('p','檢視 RTI 訊號在歷史期間的資金表現與交易紀錄，並與買入持有比較。','terminal-meta'),form,result);
 form.onsubmit=event=>{
  event.preventDefault();const selected=cleanSymbol(ticker.value,ticker.value.match(/^\d/) ? 'tw' : 'us');
  const params=new URLSearchParams({start:start.value,end:end.value,initial:initial.value,allocation:allocation.value,fee:fee.value,slippage:slippage.value,delay:delay.value,split:split.value,audit:audit.checked?'1':'0'});
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
     ['訊號日',x=>x.signalDay],['成交日',x=>x.day],['方向',x=>x.action==='buy'?'買入':'賣出'],['成交價格',x=>quantity(x.price)],['手續成本',x=>quantity(x.fee)],['成交數量',x=>quantity(x.shares)],
     ['剩餘現金',x=>quantity(x.cash)],['持有數量',x=>quantity(x.holdings)],['交易後資產',x=>quantity(x.equity)]
    ],data.transactions,'所選期間沒有可執行的正式訊號。'));
   drawSeries(graph,data.curve.map(x=>({day:x.day,close:x.value})),{title:'RTI 策略資產',divergences:[]});
   if(data.segments?.length)result.append(node('h2','前後段績效'),node('p','兩段分別以相同本金重跑。只有在未參考後段結果調整規則時，後段才可視為樣本外。','terminal-meta'),
    table([['區段',x=>x.name],['期間',x=>x.start+' 至 '+x.end],['策略報酬',x=>move(x.totalReturn*100)],['買入持有',x=>move(x.benchmarkReturn*100)],['最大回撤',x=>move(x.maxDrawdown*100)],['成交筆數',x=>x.trades]],data.segments));
   if(data.audit)result.append(node('h2','未來資料與暖機檢查'),node('p','抽查正式訊號日期，僅用該日及以前的資料重算，並對照縮短暖機後的分數。','terminal-meta'),
    table([['抽查日期',x=>x.day],['原始分數',x=>quantity(x.original)],['截斷重算',x=>quantity(x.replay)],['訊號與分數',x=>x.matches?'一致':'有差異'],['縮短暖機 K 棒',x=>x.warmupBars],['縮短後分數',x=>quantity(x.shorter)]],data.audit));
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
function showNews(host,market,symbol,channel){
 const traditionalMarkets=/債券|债券|外匯|外汇|currency|forex|\btreasury\b|\bbonds?\b/i;
 const taiwan=/台灣|臺灣|台湾|台股|臺股|台積電|台积电|聯發科|联发科|鴻海|鸿海|\bTAIWAN\b|\bTSMC\b|\bTAIEX\b/i;
 const text=story=>[story.zh,story.en].filter(Boolean).join(' ');
 const cryptoChannels=['all','main','tradfi','tfmoves','pricechange','oi','major','binance','korea','tier2','tier3','alpha','hl','cz','elon','earn'];
 if(market==='crypto'){
  clearNews=window.equationNews.mount(host,{allowedChannels:cryptoChannels,initialChannel:cryptoChannels.includes(channel)?channel:'main',initialCoin:symbol,
   storyFilter:item=>!traditionalMarkets.test(text(item))});
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
function drawSeries(host,rows,{field='close',title,temperature=false,divergences=[],valueFormat=quantity,bounds,compactDates=false}={}){
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
 const lower=bounds?.[0]??(temperature?-7:rawMin-margin);
 const upper=bounds?.[1]??(temperature?107:rawMax+margin);
 const width=1024,height=temperature?250:280;
 const left=compactDates?145:92,right=width-25,top=18,bottom=height-32;
 const x=i=>left+i*(right-left)/(rows.length-1);
 const y=value=>bottom-(value-lower)*(bottom-top)/(upper-lower);
 const chart=svg('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title});
 for(const step of temperature?[0,50,100]:Array.from({length:5},(_,i)=>lower+i*(upper-lower)/4)){
  chart.append(svg('line',{x1:left,x2:right,y1:y(step),y2:y(step),class:'chart-grid'}),
   svg('text',{x:left-7,y:y(step)+5,'text-anchor':'end'},valueFormat(step)));
 }
 const labelStep=Math.max(1,Math.floor((rows.length-1)/4));
 for(let index=0;index<rows.length;index+=labelStep){
  if(index!==0&&rows.length-index<labelStep*.35)break;
  chart.append(svg('text',{x:x(index),y:height-8,'text-anchor':'middle'},compactDates?rows[index].day.slice(5).replace('-','/'):rows[index].day));
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
  readout.textContent=[row.day,valueFormat(row[field]),signal].filter(Boolean).join(' · ');
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
 window.rtiGlass?.modules(host);
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
   selector.value='10';const panel=node('div',null,'rti-research-results');const header=node('div',null,'terminal-actions rti-research-controls');const count=node('output',null,'glass-count');const total=node('span','日線筆數 ','terminal-meta');total.append(count);header.append(node('strong',data.symbol),selector,total,button('匯出日線 CSV',()=>downloadRows(all,data.symbol),'terminal-button'));
   output.replaceChildren(header,node('p',[data.priceBasis,'資料日 '+data.asOf,data.stale?'上次成功資料':null].filter(Boolean).join(' · '),'terminal-meta'),panel);
   function update(){
    const years=Number(selector.value);const end=new Date(all.at(-1).day+'T00:00:00Z');end.setUTCFullYear(end.getUTCFullYear()-years);
    const rows=all.filter(r=>!years||r.day>=end.toISOString().slice(0,10));const formal=rows.filter(r=>r.stage==='formal'&&Number.isFinite(r.score));
    if(window.rtiGlass)window.rtiGlass.count(count,rows.length);else count.textContent=rows.length;
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
    window.rtiGlass?.modules(panel);
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
 document.getElementById('qtemp_root').classList.remove('landing-mode');
 clearNews?.();clearNews=null;
 let [market,category,symbol]=location.hash.slice(1).split('?')[0].split('/');
 const params=new URLSearchParams(location.hash.split('?')[1]||'');
 if(market==='crypto'&&['rank','lookup'].includes(category)){
  category='assets';history.replaceState(null,'','#crypto/assets'+(symbol?'/'+symbol:''));currentPage=location.hash;
 }
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
 const focusedMetric=document.activeElement?.closest('.metric-nav');
 content.replaceChildren();
 if(!Object.hasOwn(menus,market))showHome();
 else {
  if(!menus[market].some(item=>item[0]===category))category=menus[market][0][0];
  const host=frame(market,category);
  if(market==='rti'){if(category==='quality')dataQuality(host);else if(category==='method')showMethod(host);else if(category==='backtest')showBacktest(host,symbol);else if(category==='capital')showCapital(host);else if(category==='compare')showComparison(host);else if(['signals','zones','resources'].includes(category))rtiResearch(host,category,symbol);else showRTI(host,symbol);}
  else if(category==='news')showNews(host,market,symbol,params.get('channel'));
  else if(category==='assets')showCryptoAssets(host,symbol);
  else if(category==='workbench')coinWorkbench(host,symbol);
  else if(category==='events')eventResearchView(host,symbol);
  else if(market==='tw'&&['listed','otc'].includes(category))officialClose(host,category);
  else if(category==='overview')showCryptoDashboard(host,params.get('metric'));
  else if(category==='sectors')showCryptoSectors(host);
  else if(category==='derivatives')showCryptoDerivatives(host);
  else if(category==='chain')showCryptoChain(host);
  else if(category==='lookup')lookup(host,market,symbol);
  else if(category==='disclosures')showDisclosures(host);
  else marketBoard(host,market,category);
 }
 if(focusedMetric)content.querySelector('.metric-nav [aria-current]')?.focus({preventScroll:true});
 if(window.scrollY>0)window.scrollTo({top:0,behavior:'instant'});
}
mountTapes();
window.addEventListener('hashchange',route);
route();
})();


