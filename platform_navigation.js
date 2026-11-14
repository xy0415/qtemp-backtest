(()=>{
'use strict';
const root=document.getElementById('qtemp_root');
if(!root)return;
const routes=[
['overview','總覽','市場概覽','集中展示報價、QTemp 分數、歷史百分位與訊號熱力圖。'],
['chart','行情圖表','行情與技術圖表','已確認日 K、QTemp 指標、時間範圍與趨勢線整合。'],
['signals','訊號研究','QTemp 訊號研究','觀察歷史勝率、年度統計與逐筆訊號紀錄。'],
['zones','區間統計','QTemp 區間統計','分析歷史分數分布、年度區間熱力圖與目前所在位置。'],
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
brand.innerHTML='<span class="qbrand-mark" aria-hidden="true"><img src="/favicon.svg?v=2" alt="" width="35" height="35"></span><span>QTemp Analytics</span>';
header.append(brand);
const nav=document.createElement('nav');nav.className='qtopnav';nav.setAttribute('aria-label','網站主導覽');
routes.filter(r=>!['zones','resources'].includes(r[0])).forEach(([id,label])=>{
 const button=document.createElement('button');button.type='button';button.dataset.route=id;button.textContent=label;
 button.onclick=()=>{if(id==='signals' && root.dataset.view==='zones')subSignal='study';go(id)};nav.append(button);
});
header.append(nav);
const mobileNav=document.createElement('label');mobileNav.className='qroute-switch';
mobileNav.textContent='功能';
const mobileSelect=document.createElement('select');mobileSelect.setAttribute('aria-label','切換功能頁面');
routes.filter(r=>!['zones','resources'].includes(r[0])).forEach(([id,label])=>mobileSelect.add(new Option(label,id)));
mobileSelect.onchange=()=>{if(mobileSelect.value==='signals'&&root.dataset.view==='zones')subSignal='study';go(mobileSelect.value)};
mobileNav.append(mobileSelect);header.append(mobileNav);
const help=document.createElement('button');
help.type='button';help.className='qtopend qhelp-link';help.dataset.go='resources';
help.textContent='資料與說明';header.append(help);
base.before(header);
const hero=document.createElement('section');hero.className='qhero';
hero.innerHTML='<div class="qhero-content"><span class="qeyebrow">QTEMP ANALYTICS</span><h1>QTemp Analytics</h1><div class="qactions"><button type="button" class="primary" data-go="chart">行情圖表</button><button type="button" data-go="signals">訊號研究</button></div></div><div class="qpreview"><div class="qpreview-top"><strong>QTemp 指標</strong><span>最近收盤資料</span></div><div class="qpreview-value" data-preview-score>—</div><div class="qpreview-bottom"><span>最新已確認日 K 的分數</span></div></div>';
base.before(hero);
const shortcuts=document.createElement('div');shortcuts.className='qshortcut';
for(const [route,icon,title,description] of [
['chart','⌁','行情圖表','K 線與技術指標同步檢視'],
['signals','↗','訊號研究','歷史勝率與年度表現'],
['strategy','▥','策略回測','資金曲線與風險評估'],
['watchlist','◇','自選股','集中追蹤觀察標的'],
['compare','⊞','多資產分析','資產風險與績效比較']
]){
 const card=document.createElement('button');card.type='button';card.dataset.go=route;card.innerHTML='<b aria-hidden="true">'+icon+'</b><strong>'+title+'</strong><span>'+description+'</span>';shortcuts.append(card);
}
const results=root.querySelector('[data-q=results]');
results.insertAdjacentElement('afterend',shortcuts);
const intro=document.createElement('section');intro.className='qroute-intro';
intro.innerHTML='<div class="qcrumb"><button type="button" data-go="overview">首頁</button><span>／</span><span data-crumb="current">—</span></div><span class="qeyebrow">QTEMP WORKSPACE</span><h2></h2><p></p>';
hero.insertAdjacentElement('afterend',intro);


const tabs=document.createElement('div');tabs.className='qsubnav';tabs.setAttribute('aria-label','研究子分頁');
intro.after(tabs);
const footer=document.createElement('footer');footer.className='qdisclaimer';
footer.innerHTML='<span>© QTemp Analytics · 指標與歷史回測僅供研究參考，不構成投資建議。</span><span>Yahoo Finance 資料可能延遲 · 回測採 Adj Close 還原與確認日 K</span>';
root.append(footer);
const footerHelp=document.createElement('button');footerHelp.type='button';footerHelp.dataset.go='resources';footerHelp.textContent='資料、公式與匯出';footer.append(footerHelp);
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
 if(view==='signals')choices=[['study','歷史勝率'],['zones','區間統計'],['event','事件研究'],['calendar','訊號日曆'],['annual','年度統計'],['events','訊號明細']];
 else if(view==='resources')choices=[['formula','指標公式'],['quality','資料品質'],['details','基本資料'],['raw','日線資料'],['audit','TradingView 對照'],['export','匯出與分享']];
 else{tabs.hidden=true;return}
 tabs.hidden=false;
 choices.forEach(([key,label])=>{
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;
  const selected=view==='signals'?subSignal===key:subResource===key;
  btn.setAttribute('aria-selected',String(selected));
  btn.onclick=()=>{
   if(view==='signals'){
     subSignal=key;
     if(key==='zones'){go('zones');return;}
     if(root.dataset.view==='zones'){go('signals');return;}
     if(!['event','calendar'].includes(key))originalTab(key);
   } else {
     subResource=key;
     if(!['formula','export','quality'].includes(key))originalTab(originalTabs[key]);
   }
   root.dataset.resource=subResource;
   root.dataset.insight=['event','calendar','quality'].includes(key)?key:'';
   document.dispatchEvent(new CustomEvent('qtemp-insight-show',{detail:{tab:root.dataset.insight}}));
   setSubnav(view);
  };
  tabs.append(btn);
 });
}
function go(route,updateHash=true){
 if(route==='scanner')route='strategy';
 if(route==='zones')subSignal='zones';
 if(!routes.some(r=>r[0]===route))route='overview';
 current=route;
 root.dataset.view=route;
 root.dataset.resource=subResource;
 nav.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-current',b.dataset.route===(route==='zones'?'signals':route)?'page':'false'));
 const info=routes.find(r=>r[0]===route);
 mobileSelect.value=route==='zones'?'signals':route;
 intro.querySelector('[data-crumb=current]').textContent=info[1];
 intro.querySelector('h2').textContent=info[2];intro.querySelector('p').textContent=info[3];
 setSubnav(route==='zones'?'signals':route);
 const insight=route==='signals' && ['event','calendar'].includes(subSignal)?subSignal:
   route==='resources' && subResource==='quality'?'quality':'';
 root.dataset.insight=insight;
 document.dispatchEvent(new CustomEvent('qtemp-insight-show',{detail:{tab:insight}}));
 if(route==='chart')originalTab('chart');
 if(route==='signals' && !['event','calendar','zones'].includes(subSignal))originalTab(subSignal);
 if(route==='resources'){
  extraTab('4');
  if(!['formula','export','quality'].includes(subResource))originalTab(originalTabs[subResource]);
 }
 const mapping={strategy:'1',compare:'2',watchlist:'3'};
 if(mapping[route])extraTab(mapping[route]);
 document.dispatchEvent(new CustomEvent('qtemp-zones-show',{detail:{active:route==='zones'}}));
 // Market analysis is loaded only when the selected route needs symbol-level history.
 if(['overview','chart','signals','resources'].includes(route) && results.hidden){
   const load=root.querySelector('[data-q="load"]');
   if(load&&!load.disabled)load.click();
 }
 if(updateHash&&location.hash!=='#'+route)history.pushState(null,'','#'+route);
 window.scrollTo({top:0,behavior:'auto'});
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