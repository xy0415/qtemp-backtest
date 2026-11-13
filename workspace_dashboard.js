(()=>{'use strict';
const root=document.getElementById('qtemp_root');if(!root)return;
const hero=root.querySelector('.qhero'),results=root.querySelector('[data-q="results"]'),query=root.querySelector('.query');
if(!hero||!results||!query)return;
const section=document.createElement('section');
section.className='qa-dashboard';
section.innerHTML='<div class="qa-section-heading"><h3>研究總覽</h3><span class="qa-live" data-qa-market-state>等待行情資料</span></div>'+
'<div class="qa-metrics">'+
'<div class="qa-metric"><span>分析標的</span><strong data-qa-symbol>—</strong></div>'+
'<div class="qa-metric"><span>QTemp 分數</span><strong data-qa-score>—</strong></div>'+
'<div class="qa-metric"><span>歷史百分位</span><strong data-qa-percentile>—</strong></div>'+
'<div class="qa-metric"><span>最新狀態</span><strong data-qa-signal>—</strong><small data-qa-zone-detail>—</small></div>'+
'</div>'+
'<div class="qa-action-bar"><button data-qa-action="chart" type="button">行情圖表</button><button data-qa-action="signals" type="button">訊號研究</button><button data-qa-action="strategy" type="button">策略回測</button><button data-qa-action="watchlist" type="button">自選股</button></div>'+
'<div class="qa-monitor">'+
'<div class="qa-monitor-card"><h3>行情資料狀態</h3><div class="qa-monitor-rows"><span>資料來源</span><strong data-qa-source>Yahoo Finance</strong><span>最後收盤日</span><strong data-qa-close-day>—</strong><span>歷史資料</span><strong data-qa-range>—</strong><span>更新狀態</span><strong data-qa-cache>等待資料</strong></div><p class="qa-monitor-note">行情資料不等於即時成交報價，使用的還原日線以已收盤資料為準。</p></div>'+
'<div class="qa-monitor-card"><h3>系統檢查</h3><div class="qa-monitor-rows"><span>服務狀態</span><strong data-qa-service>檢查中</strong><span>API 錯誤</span><strong data-qa-errors>—</strong><span>最近異常</span><strong data-qa-last-error>—</strong><span>服務啟動</span><strong data-qa-uptime>—</strong></div><p class="qa-monitor-note" data-qa-service-note>僅監控本服務接收到的 API 請求，不代表外部 Yahoo Finance 的整體健康度。</p></div></div>';
query.insertAdjacentElement('afterend',section);
// The diagnostics are an overview footer section, below all research cards and charts.
const monitor=section.querySelector('.qa-monitor');
monitor.classList.add('qa-monitor-bottom');
const footer=root.querySelector('.qdisclaimer');
if(footer)footer.before(monitor);else root.append(monitor);
const $=q=>root.querySelector('[data-qa-'+q+']');
const text=(k,v)=>{const el=$(k);if(el)el.textContent=v==null?'—':String(v)};
const num=x=>x==null||!Number.isFinite(+x)?'—':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
const dateStatus=(d)=>{
 if(!d)return'—';
 const age=Math.floor((Date.now()-new Date(d+'T00:00:00Z').getTime())/864e5);
 return d+(age>5?' · 超過五天':'');
};
let lastSymbol='',lastEnd='',prevScore='',pending=false;
const zoneName=value=>value< -95?'抄底區':value< -75?'定投區間':value>95?'高估值區間':value===95?'95 臨界值':value>75?'趨勢極強':'中性區間';
let lastAnalysis=null;
const sourceMap={yahoo_live:'Yahoo 最新擷取',verified_cache:'已驗證短期快取',stale_backup:'舊版歷史備援，可能過時'};
function refreshOverview(){
 const symbol=root.querySelector('[data-q="symbol"]')?.value?.trim()||'—';
 const score=root.querySelector('[data-q="score"]')?.textContent.trim();
 const title=root.querySelector('[data-q="title"]')?.textContent.trim()||symbol;
 const closeText=root.querySelector('[data-q="close-time"]')?.textContent||'';
 const d=closeText.match(/\d{4}-\d\d-\d\d/)?.[0];
 if(!score||!d)return;
 text('symbol',title.split(/\s+/).slice(0,2).join(' '));
 text('score',score);
 text('percentile',root.querySelector('[data-q="dist-rank"]')?.textContent?.trim()||'—');
 const scoreValue=Number(score);
 if(Number.isFinite(scoreValue)){
  text('signal',zoneName(scoreValue));
  const signal=lastAnalysis?.analytics?.latestSignal;
  if(scoreValue< -95 && signal?.day===d && lastAnalysis?.end===d){
   const raw=lastAnalysis?.rawLatestClose;
   text('zone-detail','當日已確認 '+signal.type+'｜抄底參考價 '+num(raw??signal.price)+(raw==null?'（還原收盤）':'（實際收盤價）'));
  }else if(scoreValue< -95){
   text('zone-detail','目前屬抄底區；今日未確認新的抄底訊號');
  }else{
   text('zone-detail','最新已確認日 K：'+d);
  }
 }else{text('signal','—');text('zone-detail','等待有效 QTemp 分數')}
 text('close-day',dateStatus(d));
 text('range',root.querySelector('[data-q="status"]')?.textContent?.split(' · ')[0]||'—');
 lastSymbol=symbol;lastEnd=d;prevScore=score;
 const status=root.querySelector('[data-q="status"]')?.textContent||'';
 const stale=status.includes('歷史備份')||status.includes('過時');
 text('cache',stale?'歷史備援，可能過時':status.includes('快取')?'已驗證短期快取':'已確認收盤資料');
 const badge=$('market-state');badge.textContent=stale?'歷史備份資料':'已確認日線 · '+d;badge.dataset.state=stale?'warn':'ok';
}
async function health(){
 if(document.hidden||pending)return;
 pending=true;
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch('/api/diagnostics',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const r=await response.json();
   text('service','正常運作');
   text('errors',r.errors+' 次 / '+r.requests+' 次 API 請求');
   text('last-error',r.lastError||'沒有已記錄的異常');
   text('uptime',Math.floor(r.uptimeSeconds/60)+' 分鐘');
   $('service-note').textContent='診斷更新 '+r.checkedAt+' UTC · 僅統計目前服務程序啟動後的請求';
  }finally{clearTimeout(timer)}
 }catch(error){
  text('service','狀態未確認');
  text('last-error','監控查詢失敗：'+error.message);
 }finally{pending=false}
}
section.querySelectorAll('[data-qa-action]').forEach(button=>button.onclick=()=>{
 const route=button.dataset.qaAction;
 const target=root.querySelector('[data-route="'+route+'"]');
 if(target)target.click();else location.hash='#'+route;
});
const observer=new MutationObserver(()=>{if(root.dataset.view==='overview')refreshOverview()});
for(const key of ['score','title','close-time','dist-rank','latest-signal','status']){
 const el=root.querySelector('[data-q="'+key+'"]');
 if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
}
const liveObserve=new MutationObserver(()=>{
 const isOverview=root.dataset.view==='overview';
 if(isOverview){refreshOverview();health()}
});
liveObserve.observe(root,{attributes:true,attributeFilter:['data-view']});
const hoverTargets=[hero,...root.querySelectorAll('.qshortcut button')];
let raf=0,ref=null,coord=null;
hoverTargets.forEach(el=>el.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 ref=el;coord={x:e.clientX,y:e.clientY};
 if(raf)return;
 raf=requestAnimationFrame(()=>{
  if(ref&&coord){const rect=ref.getBoundingClientRect();
   ref.style.setProperty('--glass-x',coord.x-rect.left+'px');
   ref.style.setProperty('--glass-y',coord.y-rect.top+'px');
  }
  raf=0;
 });
},{passive:true}));
const chartTools=root.querySelector('[data-q="charttools"]');
const interaction=chartTools?.querySelector('.chart-interactions');
if(chartTools&&interaction){
 const toggle=document.createElement('button');toggle.type='button';
 toggle.className='qa-mobile-chart-toggle';toggle.setAttribute('aria-expanded','false');
 toggle.textContent='顯示更多圖表設定 ▾';
 const controls=chartTools.querySelector('.signal-legend');
 if(controls)controls.before(toggle);else chartTools.prepend(toggle);
 const setCollapsed=isCollapsed=>{
  interaction.dataset.mobileCollapsed=String(isCollapsed);
  toggle.setAttribute('aria-expanded',String(!isCollapsed));
  toggle.textContent=isCollapsed?'顯示更多圖表設定 ▾':'收合圖表設定 ▴';
 };
 setCollapsed(true);
 toggle.onclick=()=>setCollapsed(interaction.dataset.mobileCollapsed!=='true');
}
root.addEventListener('qtemp-analysis-ready',event=>{
 lastAnalysis=event.detail?.data||null;
 refreshOverview();
});
refreshOverview();health();
setInterval(()=>{if(root.dataset.view==='overview')health()},60000);
})();