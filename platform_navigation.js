(()=>{
'use strict';
const root=document.getElementById('qtemp_root');
if(!root)return;
const routes=[
['overview','市場總覽','全球金融市場總覽',''],
['markets','金融市場','金融市場','全球股指、利率、商品、外匯與數位資產'],
['macro','總體經濟','總體經濟','利率、美元與官方經濟數據入口'],
['sectors','產業研究','產業研究','產業 ETF 日線表現與半導體比較'],
['stocks','個股分析','個股分析','台美股與 ETF 搜尋'],
['news','金融快訊','金融快訊',''],
['quant','量化研究','量化研究','QTemp 指標、訊號研究、策略回測與多資產比較。'],
['watchlist','自選股','自選股觀察','在瀏覽器管理觀察清單與訊號提醒。'],
['chart','QTemp 圖表','行情與技術圖表','已確認日 K、QTemp 指標、時間範圍與趨勢線整合。'],
['signals','訊號研究','QTemp 訊號研究','歷史勝率、區間統計、事件路徑、日曆與年度統計。'],
['zones','區間統計','QTemp 區間統計','歷史分數分布、熱力圖及目前所在位置。'],
['strategy','策略回測','策略回測','比較 QTemp、定投與單筆投入的資金流和風險。'],
['compare','多資產比較','相對績效比較','長期績效、回撤、相關性、基準與投資組合。'],
['resources','研究資源','研究資料與指標方法','QTemp 公式、資料明細、TradingView 對照與匯出。']
];
const mainRoutes=['overview','markets','macro','sectors','stocks','news','quant','watchlist'];
const quantRoutes=['chart','signals','zones','strategy','compare','resources'];
const base=root.querySelector('.query');
const header=document.createElement('header');
header.className='qtopbar';
const brand=document.createElement('a');
brand.className='qbrand';brand.href='#overview';
brand.innerHTML='<span class="qbrand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>QTemp Analytics</span>';
header.append(brand);
const nav=document.createElement('nav');nav.className='qtopnav';nav.setAttribute('aria-label','網站主導覽');
routes.filter(r=>mainRoutes.includes(r[0])).forEach(([id,label])=>{
 const button=document.createElement('button');button.type='button';button.dataset.route=id;button.textContent=label;
 button.onclick=()=>{if(id==='quant')subSignal='study';go(id)};nav.append(button);
});
header.append(nav);
const mobileNav=document.createElement('label');mobileNav.className='qroute-switch';
mobileNav.textContent='功能';
const mobileSelect=document.createElement('select');mobileSelect.setAttribute('aria-label','切換功能頁面');
routes.filter(r=>mainRoutes.includes(r[0])).forEach(([id,label])=>mobileSelect.add(new Option(label,id)));
mobileSelect.onchange=()=>{go(mobileSelect.value)};
mobileNav.append(mobileSelect);header.append(mobileNav);
const help=document.createElement('button');
help.type='button';help.className='qtopend qhelp-link';help.dataset.go='resources';
help.textContent='資料與說明';header.append(help);
base.before(header);
const hero=document.createElement('section');hero.className='qhero';
hero.innerHTML='<div class="qhero-content"><h1>全球金融<br><em>市場總覽</em></h1><p class="qhero-desc">全球股市、數位資產與跨市場異動</p><div class="qactions"><button type="button" class="primary" data-go="markets">查看全球行情</button><button type="button" data-go="news">瀏覽金融快訊</button></div><div class="qhero-quote-strip" aria-label="主要市場收盤行情"></div></div><section class="qhero-wire" aria-label="最新市場快訊"></section>';
base.before(hero);
const shortcuts=document.createElement('div');shortcuts.className='qshortcut';
for(const [route,icon,title,description] of [
['markets','⌁','金融市場','全球行情與主要指數'],
['macro','↗','總體經濟','利率、通膨與美元研究'],
['quant','▥','量化研究','QTemp 與策略回測'],
['watchlist','◇','自選股','集中追蹤觀察標的'],
['sectors','⊞','產業研究','半導體與產業強弱']
]){
 const card=document.createElement('button');card.type='button';card.dataset.go=route;card.innerHTML='<b aria-hidden="true">'+icon+'</b><strong>'+title+'</strong><span>'+description+'</span>';shortcuts.append(card);
}
const results=root.querySelector('[data-q=results]');
results.insertAdjacentElement('afterend',shortcuts);
const intro=document.createElement('section');intro.className='qroute-intro';
intro.innerHTML='<div class="qcrumb"><button type="button" data-go="overview">首頁</button><span>／</span><span data-crumb="current">—</span></div><h2></h2><p></p>';
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
 nav.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-current',b.dataset.route===(quantRoutes.includes(route)?'quant':route)?'page':'false'));
 const info=routes.find(r=>r[0]===route);
 mobileSelect.value=quantRoutes.includes(route)?'quant':route;
 intro.querySelector('[data-crumb=current]').textContent=info[1];
 intro.querySelector('h2').textContent=info[2];intro.querySelector('p').textContent=info[3];
 intro.querySelector('p').hidden=!info[3];
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
 document.dispatchEvent(new CustomEvent('qtemp-route-change',{detail:{route}}));
 // Market analysis is loaded only when the selected route needs symbol-level history.
 if(['chart','signals','resources'].includes(route) && results.hidden){
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