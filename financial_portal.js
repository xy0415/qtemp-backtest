(()=>{
'use strict';
const root=document.getElementById('qtemp_root');if(!root)return;
const intro=root.querySelector('.qroute-intro');if(!intro)return;
const portal=document.createElement('div');portal.className='fm-portal';portal.setAttribute('aria-label','金融市場研究入口');
intro.insertAdjacentElement('afterend',portal);
const main=['overview','markets','macro','sectors','stocks','news','quant'];
const featured=['^GSPC','^IXIC','^DJI','^SOX','^TWII','^N225'];
const groupOrder=['美股','半導體','台股','全球','風險','利率','商品','外匯','加密'];
let market=null,news=null,macro=null,selected='^SOX',period='3mo',requests={},loadedAt={},pending={};
let lastAutoCheck=0;
const link=(ticker)=>'https://finance.yahoo.com/quote/'+encodeURIComponent(ticker)+'/';
const clean=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
const sign=v=>v==null?'—':((v>0?'+':'')+clean(v)+'%');
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
 const titleEl=el('h2',title),p=el('p',sub||'');
 section.append(titleEl,p);return section;
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
  frame.append(svg('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#e6eaf5'}));
  frame.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',fill:'#74849d','font-size':12},clean(value)));
 }
 const path=cleanPoints.map((point,i)=>(i?'L':'M')+xx(i).toFixed(2)+' '+yy(+point[1]).toFixed(2)).join(' ');
 frame.append(svg('path',{d:path,stroke:'#6267de','stroke-width':2.6,fill:'none','stroke-linejoin':'round'}));
 for(let i=0;i<=4;i++){
  const pos=Math.round(i*(cleanPoints.length-1)/4),day=cleanPoints[pos][0];
  frame.append(svg('text',{x:xx(pos),y:H-16,'text-anchor':'middle',fill:'#70809a','font-size':12},day.slice(0,7)));
 }
 frame.append(svg('text',{x:(L+W-R)/2,y:H-1,'text-anchor':'middle',fill:'#566783','font-size':12},'日期（年－月）'));
 frame.append(svg('text',{transform:'translate(18 '+H/2+') rotate(-90)','text-anchor':'middle',fill:'#566783','font-size':12},axis));
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
 const open=el('a','查看來源 ↗','fm-chart-link');
 open.href=link(selected);open.target='_blank';open.rel='noopener noreferrer';
 tools.append(ticker,periodSelect,open);section.append(tools);
 const host=el('div',null,'fm-chart'),status=el('p','載入圖表中…','fm-meta');
 section.append(host,status);
 const load=async()=>{
  selected=ticker.value;period=periodSelect.value;open.href=link(selected);
  const entry=market?.items?.find(x=>x.ticker===selected);
  const requestId=selected+'/'+period;
  status.textContent='取得 '+selected+' 的已確認日線中…';
  try{
   const data=await get('/api/market/history/'+encodeURIComponent(selected)+'?period='+encodeURIComponent(period),
    'history_'+requestId,150000);
   if(ticker.value!==selected||periodSelect.value!==period)return;
   const axis=selected==='^TNX'?'殖利率（%）':
     selected==='TWD=X'?'台幣／美元':
     selected==='JPY=X'?'日圓／美元':
     ['GC=F','SI=F','CL=F','BTC-USD','ETH-USD','SOL-USD'].includes(selected)?'美元（USD）':
     ['^GSPC','^IXIC','^DJI','^NDX','^RUT','^SOX','^TWII','^N225','^HSI','^VIX','DX-Y.NYB'].includes(selected)?'指數點位':
     'ETF 收盤價格（USD）';
   plot(host,data.points,axis,selected);
   status.textContent='資料截至 '+labelDate(data.asOf)+' · '+data.source;
  }catch(e){host.replaceChildren(el('p','圖表資料暫時不可用。','fm-empty'));status.textContent='行情來源無法取得：'+e.message}
 };
 ticker.onchange=load;periodSelect.onchange=load;
 load();
 return section;
}
function sourceLink(title,url){
 const a=el('a',title,'fm-source-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function newsList(holder,items,limit){
 holder.replaceChildren();
 if(!items?.length){holder.append(el('p','官方新聞暫時無法取得；不會顯示推測標題。','fm-empty'));return}
 items.slice(0,limit).forEach(n=>{
  const row=el('article',null,'fm-news-item');
  const title=sourceLink(n.title,n.url);title.className='fm-news-title';
  row.append(title,el('small',n.source+' · '+(n.publishedUTC?stamp(n.publishedUTC):'未標示發布時間'),'fm-meta'));holder.append(row);
 });
}
function stockPrompt(){
 const section=panel('個股研究入口','搜尋代號後可查看 QTemp 走勢；企業基本面應以正式財報來源核對');
 const search=el('div',null,'fm-stock-search'),input=el('input');
 input.placeholder='AAPL、NVDA、MRVL、COHR、2330.TW';input.setAttribute('aria-label','輸入股票代號');
 const action=pill('開啟個股研究',()=>{const ticker=input.value.trim().toUpperCase();
  if(!/^[A-Z0-9.^=_-]{1,30}$/.test(ticker)){notice.textContent='請輸入有效股票代號';return}
  root.querySelector('[data-q="symbol"]').value=ticker;
  root.querySelector('[data-q="load"]')?.click();
  root.querySelector('[data-go="chart"]')?.click();
 });
 input.onkeydown=e=>{if(e.key==='Enter')action.click()};
 const notice=el('p','可搜尋台股、ETF、美股；台股可使用 2330.TW。','fm-meta');
 search.append(input,action);section.append(search,notice);
 return section;
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
function overview(){
 const frag=document.createDocumentFragment();
 const a=panel('全球主要指數','費城半導體 SOX 特別列入核心指數；各市場交易日不同');
 a.append(majorCards(featured.map(x=>market.items.find(y=>y.ticker===x)).filter(Boolean),
  ticker=>{location.hash='#markets';selected=ticker}));
 frag.append(a,chartSection(selected||'^SOX'));
 const two=el('div',null,'fm-two-col');
 const marketNote=panel('跨資產市場快覽','主要市場環境與風險觀察（延遲日線）');
 marketNote.append(majorCards(['^VIX','^TNX','GC=F','CL=F','BTC-USD','TWD=X']
  .map(x=>market.items.find(y=>y.ticker===x)).filter(Boolean),ticker=>{selected=ticker;location.hash='#markets'}));
 two.append(marketNote);
 const feed=panel('官方金融資訊','官方來源公告；不是涵蓋全部市場的新聞聚合');
 const newsHost=el('div');newsList(newsHost,news?.articles,6);feed.append(newsHost);
 feed.append(pill('查看更多新聞',()=>navigate('news')));two.append(feed);frag.append(two);
 const sector=panel('產業強弱','產業 ETF 日線漲跌幅，與 SOX 指數屬不同資料口徑');
 const items=market.items.filter(x=>x.category==='產業 ETF').sort((a,b)=>(b.changePct??-10000)-(a.changePct??-10000));
 const grid=el('div',null,'fm-sector-grid');
 items.slice(0,6).forEach(x=>grid.append(card(x,ticker=>{selected=ticker;navigate('sectors')})));
 sector.append(grid);sector.append(pill('完整產業比較',()=>navigate('sectors')));frag.append(sector);
 frag.append(stockPrompt());
 return frag;
}
function compactMarketList(tickers){
 const grid=el('div',null,'fm-market-rows');
 for(const ticker of tickers){
  const item=market.items.find(x=>x.ticker===ticker);
  if(!item)continue;
  const row=el('button',null,'fm-market-row'+(selected===ticker?' fm-market-row-selected':''));
  row.type='button';row.title='查看 '+item.name+' 的歷史走勢';
  const id=el('div',null,'fm-market-identity');
  id.append(el('strong',item.name),el('small',item.ticker));
  const price=el('div',item.value==null?'無資料':clean(item.value)+(item.unit==='%'?'%':''),'fm-market-last');
  const movement=item.changeBp==null?item.changePct:item.changeBp;
  const change=el('div',item.changeBp!=null?
    (item.changeBp>0?'+':'')+clean(item.changeBp)+' bp':sign(item.changePct),'fm-market-delta');
  if(movement>0)change.classList.add('fm-positive');
  if(movement<0)change.classList.add('fm-negative');
  const date=el('small',item.asOf?item.asOf:'來源無資料','fm-market-date');
  if(item.possiblyStale)date.classList.add('fm-market-lag');
  row.append(id,price,change,date);
  row.onclick=()=>chooseMarketTicker(ticker);
  grid.append(row);
 }
 return grid;
}
function chooseMarketTicker(ticker){
 selected=ticker;
 render().then(()=>{
  if(root.dataset.view!=='markets')return;
  const chart=portal.querySelector('.fm-market-chart-block');
  if(chart)chart.scrollIntoView({behavior:'smooth',block:'center'});
 });
}
function marketCategory(title,caption,tickers,wide=false){
 const box=panel(title,caption);
 box.classList.add('fm-market-category');
 if(wide)box.classList.add('fm-market-category-wide');
 box.append(compactMarketList(tickers));
 return box;
}
function markets(){
 const frag=document.createDocumentFragment();
 const lead=panel('全球股票指數','涵蓋美股大型與小型股、科技、費城半導體及亞洲主要指數');
 lead.classList.add('fm-market-lead');
 const indices=['^GSPC','^IXIC','^DJI','^NDX','^RUT','^SOX','^TWII','^N225','^HSI'];
 const grid=el('div',null,'fm-market-index-grid');
 indices.map(t=>market.items.find(x=>x.ticker===t)).filter(Boolean).forEach(item=>grid.append(card(item,chooseMarketTicker)));
 lead.append(grid);
 frag.append(lead);
 const categories=el('div',null,'fm-market-category-grid');
 categories.append(
  marketCategory('市場風險與利率','VIX 為指數點位；美國 10Y 以殖利率及 bp 顯示',
    ['^VIX','^TNX']),
  marketCategory('貴金屬與能源','商品期貨以 USD 報價；不是現貨價格',
    ['GC=F','SI=F','CL=F']),
  marketCategory('匯率與美元','USD/TWD、USD/JPY 為每美元對應的當地貨幣',
    ['DX-Y.NYB','TWD=X','JPY=X']),
  marketCategory('數位資產','以最後一個完整 UTC 日收盤價比較',
    ['BTC-USD','ETH-USD','SOL-USD'])
 );
 frag.append(categories);
 const etf=marketCategory('美股產業 ETF','橫跨科技、金融、能源、醫療及其他產業；SOXX 與 SOX 並非同一標的',
  ['SOXX','XLK','XLC','XLF','XLE','XLV','XLI','XLY','XLP','XLU'],true);
 frag.append(etf);
 const chart=chartSection(selected,period);
 chart.classList.add('fm-market-chart-block');
 frag.append(chart);
 return frag;
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
 const frag=document.createDocumentFragment();
 const s=panel('產業 ETF 相對表現','按最新可得交易日漲跌幅排序；不是產業所有股票的加權報酬');
 const items=market.items.filter(x=>x.category==='產業 ETF')
  .sort((a,b)=>(b.changePct??-Infinity)-(a.changePct??-Infinity));
 s.append(majorCards(items,ticker=>{selected=ticker;render()}));frag.append(s);
 const semiconductor=panel('半導體產業比較','SOX 指數和 SOXX ETF 獨立呈現，不能視為同一資產');
 semiconductor.append(majorCards(['^SOX','SOXX'].map(x=>market.items.find(y=>y.ticker===x)).filter(Boolean),
  ticker=>{selected=ticker;render()}));
 frag.append(semiconductor,chartSection(selected==='^SOX'||selected==='SOXX'?selected:'^SOX',period));return frag;
}
function stocks(){
 const frag=document.createDocumentFragment();frag.append(stockPrompt());
 const s=panel('個股研究與比較','使用既有金融研究工具；不在沒有財報資料時填入估算獲利指標');
 s.append(pill('多資產績效比較',()=>navigate('compare')),pill('自選股工作區',()=>navigate('watchlist')),
 sourceLink('SEC 公司申報原始資料','https://www.sec.gov/edgar/search/'));
 frag.append(s);return frag;
}
function newsPage(){
 const frag=document.createDocumentFragment();
 const s=panel('金融機構與監管官方公告','來源：Federal Reserve、SEC，文章以原文發布時間排序');
 const list=el('div');newsList(list,news?.articles,18);s.append(list);
 const row=el('div',null,'fm-source-row');
 row.append(sourceLink('Federal Reserve RSS','https://www.federalreserve.gov/feeds/press_all.xml'),
 sourceLink('SEC 公告 RSS','https://www.sec.gov/news/pressreleases.rss'));s.append(row);frag.append(s);return frag;
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
 if(!main.includes(page)){portal.hidden=true;return}
 portal.hidden=false;
 const samePage=portal.dataset.activePage===page;
 if(!force||!samePage||!portal.querySelector('.fm-panel'))
  portal.replaceChildren(el('p','載入市場資料中…','fm-loading'));
 portal.dataset.activePage=page;
 if(page==='quant'){portal.replaceChildren(quantHub());return}
 if(page==='stocks'){portal.replaceChildren(stocks());return}
 if(page==='news'){
  try{news=await get('/api/market/news','news',300000,force);if(root.dataset.view==='news')portal.replaceChildren(newsPage(),statusRow())}
  catch(e){portal.replaceChildren(el('p','官方新聞連線失敗，請稍後重新整理。','fm-empty'))}
  return;
 }
 try{
  market=await get('/api/market/overview','market',120000,force);
  if(page==='overview')news=await get('/api/market/news','news',300000,force).catch(()=>null);
  if(root.dataset.view!==page)return;
  const body=page==='overview'?overview():page==='markets'?markets():page==='macro'?macros():sectors();
  portal.replaceChildren(body,statusRow());
 }catch(e){if(root.dataset.view===page){
  if(force&&portal.querySelector('.fm-panel')){
   const notice=el('p','更新失敗：'+e.message+'。目前顯示上一次成功取得的資料，請核對卡片日期。','fm-empty');
   portal.prepend(notice);
  }else portal.replaceChildren(el('p','暫時無法取得金融市場資料：'+e.message,'fm-empty'),sourceLink('Yahoo Finance','https://finance.yahoo.com/'));
 }}
}
document.addEventListener('qtemp-route-change',()=>render());
function refreshWhenVisible(){
 if(document.hidden||!main.includes(root.dataset.view))return;
 const now=Date.now();
 if(now-lastAutoCheck<120000)return;
 lastAutoCheck=now;
 if(root.dataset.view==='news'){
  if(now-(loadedAt.news||0)>120000)render(true);
 }else if(!['quant','stocks'].includes(root.dataset.view)){
  if(now-(loadedAt.market||0)>120000)render(true);
 }
}
setInterval(refreshWhenVisible,120000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWhenVisible()});
window.addEventListener('focus',refreshWhenVisible);
render();
})();