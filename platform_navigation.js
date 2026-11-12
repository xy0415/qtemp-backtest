(()=>{
'use strict';
const root=document.getElementById('qtemp_root');
if(!root)return;
const routes=[
['overview','總覽','市場概覽','集中展示報價、QTemp 分數、歷史百分位與訊號熱力圖。'],
['chart','行情圖表','行情與技術圖表','已確認日 K、QTemp 指標、時間範圍與趨勢線整合。'],
['signals','訊號研究','QTemp 訊號研究','觀察歷史勝率、年度統計與逐筆訊號紀錄。'],
['scanner','市場掃描','多標的掃描','依 QTemp、近期訊號與高點回撤篩選觀察名單。'],
['strategy','策略回測','策略回測','設定 QTemp 進出門檻，研究資金曲線與風險。'],
['compare','標的比較','相對績效比較','以共同交易日期比較報酬、波動與最大回撤。'],
['watchlist','自選股','自選股觀察','在你的瀏覽器管理觀察清單及訊號提醒。'],
['resources','研究資源','研究資料與指標方法','查看 QTemp 公式、資料明細、TradingView 對照與匯出工具。']
];
const base=root.querySelector('.query');
const header=document.createElement('header');
header.className='qtopbar';
const brand=document.createElement('a');
brand.className='qbrand';brand.href='#overview';
brand.innerHTML='<span class="qbrand-mark" aria-hidden="true">◈</span><span>QTemp <small>RESEARCH</small></span>';
header.append(brand);
const nav=document.createElement('nav');nav.className='qtopnav';nav.setAttribute('aria-label','網站主導覽');
routes.forEach(([id,label])=>{
 const button=document.createElement('button');button.type='button';button.dataset.route=id;button.textContent=label;
 button.onclick=()=>go(id);nav.append(button);
});
header.append(nav);
const mobileNav=document.createElement('label');mobileNav.className='qroute-switch';
mobileNav.textContent='功能';
const mobileSelect=document.createElement('select');mobileSelect.setAttribute('aria-label','切換功能頁面');
routes.forEach(([id,label])=>mobileSelect.add(new Option(label,id)));
mobileSelect.onchange=()=>go(mobileSelect.value);
mobileNav.append(mobileSelect);header.append(mobileNav);
const status=document.createElement('span');status.className='qtopend';status.textContent='歷史資料研究平台';header.append(status);
base.before(header);
const hero=document.createElement('section');hero.className='qhero';
hero.innerHTML='<div><div class="qeyebrow">QUANTITATIVE MARKET INTELLIGENCE</div><h1>以歷史數據，<br><em>看清市場溫度。</em></h1><p>QTemp 將估值、趨勢與動能訊號整合於同一個研究工作台。探索股票和 ETF 的技術結構、回測結果與歷史分布，不以猜測代替數據。</p><div class="qactions"><button type="button" class="primary" data-go="chart">查看行情圖表</button><button type="button" data-go="signals">研究歷史訊號</button></div></div><div class="qpreview"><div class="qpreview-top"><strong>研究工作台</strong><span>QTemp · 日 K</span></div><div class="qpreview-value" data-preview-score>—</div><div style="color:#8fa7c4;font-size:12px;margin-top:4px">目前選定標的的最新 QTemp 分數</div><svg viewBox="0 0 380 145" role="img" aria-label="示意性數據曲線，非實際股價"><defs><linearGradient id="qlinefill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#387dda" stop-opacity=".36"/><stop offset="1" stop-color="#387dda" stop-opacity="0"/></linearGradient></defs><path d="M0 130 L0 94 29 101 55 76 87 83 117 56 145 67 181 30 209 48 236 41 266 59 299 31 324 38 351 18 380 24 L380 130Z" fill="url(#qlinefill)"/><path d="M0 94 29 101 55 76 87 83 117 56 145 67 181 30 209 48 236 41 266 59 299 31 324 38 351 18 380 24" fill="none" stroke="#70b4ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 125H380M0 76H380M0 27H380" stroke="#344b67" stroke-width="1" stroke-dasharray="3 6"/></svg><div class="qpreview-bottom"><span>示意線圖 · 非真實價格走勢</span><strong>資料驅動分析</strong></div></div>';
base.before(hero);
const shortcuts=document.createElement('div');shortcuts.className='qshortcut';
for(const [route,icon,title,description] of [
['chart','⌁','行情圖表','K 線與技術指標同步檢視'],
['signals','↗','訊號研究','歷史勝率與年度表現'],
['scanner','◎','市場掃描','同時比較多檔股票'],
['strategy','▥','策略回測','資金曲線與風險評估'],
['watchlist','◇','自選股','集中追蹤觀察標的'],
['resources','∑','研究資源','公式、來源與資料匯出']
]){
 const card=document.createElement('button');card.type='button';card.dataset.go=route;card.innerHTML='<b aria-hidden="true">'+icon+'</b><strong>'+title+'</strong><span>'+description+'</span>';shortcuts.append(card);
}
const results=root.querySelector('[data-q=results]');
results.insertAdjacentElement('afterend',shortcuts);
const intro=document.createElement('section');intro.className='qroute-intro';
intro.innerHTML='<div class="qcrumb"><button type="button" data-go="overview">首頁</button><span>／</span><span data-crumb="current">—</span></div><span class="qeyebrow">QTEMP WORKSPACE</span><h2></h2><p></p>';
hero.insertAdjacentElement('afterend',intro);
const resourceInfo=document.createElement('span');resourceInfo.className='qfeature-note';resourceInfo.textContent='資料基礎｜Yahoo Finance · 調整收盤價';
intro.append(resourceInfo);

const tabs=document.createElement('div');tabs.className='qsubnav';tabs.setAttribute('aria-label','研究子分頁');
results.querySelector('.tabs').before(tabs);
const footer=document.createElement('footer');footer.className='qdisclaimer';
footer.innerHTML='<span>© QTemp Research · 指標與歷史回測僅供研究參考，不構成投資建議。</span><span>Yahoo Finance 資料可能延遲 · 回測採 Adj Close 還原與確認日 K</span>';
root.append(footer);
let current='',subSignal='study',subResource='formula';
const originalTabs={chart:'chart',study:'study',annual:'annual',events:'events',details:'details',raw:'raw',audit:'compare'};
function originalTab(tab){
 const button=root.querySelector('[data-tab="'+tab+'"]');
 if(button)button.click();
}
function extraTab(id){
 const button=root.querySelector('[data-addon-tab="'+id+'"]');
 if(button)button.click();
}
function setSubnav(view){
 tabs.replaceChildren();tabs.className='qsubnav '+(view==='signals'?'qsignal-tabs':'qresource-tabs');
 let choices;
 if(view==='signals')choices=[['study','歷史勝率'],['annual','年度統計'],['events','訊號明細']];
 else if(view==='resources')choices=[['formula','指標計算公式'],['details','行情基本資料'],['raw','原始日線'],['audit','TradingView 對照']];
 else{tabs.hidden=true;return}
 tabs.hidden=false;
 choices.forEach(([key,label])=>{
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;
  const selected=view==='signals'?subSignal===key:subResource===key;
  btn.setAttribute('aria-selected',String(selected));
  btn.onclick=()=>{
   if(view==='signals'){subSignal=key;originalTab(key);}
   else{subResource=key; if(key!=='formula')originalTab(originalTabs[key]);}
   root.dataset.resource=subResource;
   setSubnav(view);
  };
  tabs.append(btn);
 });
}
function go(route,updateHash=true){
 if(!routes.some(r=>r[0]===route))route='overview';
 current=route;
 root.dataset.view=route;
 root.dataset.resource=subResource;
 nav.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-current',b.dataset.route===route?'page':'false'));
 const info=routes.find(r=>r[0]===route);
 mobileSelect.value=route;
 intro.querySelector('[data-crumb=current]').textContent=info[1];
 intro.querySelector('h2').textContent=info[2];intro.querySelector('p').textContent=info[3];
 setSubnav(route);
 if(route==='chart')originalTab('chart');
 if(route==='signals')originalTab(subSignal);
 if(route==='resources'){
  extraTab('4');
  if(subResource!=='formula')originalTab(originalTabs[subResource]);
 }
 const mapping={scanner:'0',strategy:'1',compare:'2',watchlist:'3'};
 if(mapping[route])extraTab(mapping[route]);
 if(updateHash&&location.hash!=='#'+route)history.pushState(null,'','#'+route);
 window.scrollTo({top:0,behavior:'instant'});
 if(route==='chart')requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
root.addEventListener('click',event=>{
 const btn=event.target.closest('[data-go]');if(btn)go(btn.dataset.go);
});
window.addEventListener('popstate',()=>go(location.hash.slice(1)||'overview',false));
window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==current)go(location.hash.slice(1)||'overview',false)});
const preview=hero.querySelector('[data-preview-score]'),score=root.querySelector('[data-q=score]');
if(score&&preview){
 const observer=new MutationObserver(()=>{preview.textContent=score.textContent?.trim()||'—'});
 observer.observe(score,{childList:true,characterData:true,subtree:true});
 preview.textContent=score.textContent||'—';
}
go(location.hash.slice(1)||'overview',false);
})();