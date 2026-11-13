(()=>{'use strict';
const root=document.getElementById('qtemp_root'),panel=root?.querySelector('[data-addon="3"]');
if(!panel)return;
panel.innerHTML='<div class="qa-workspace"><div class="qa-section-heading"><h3>自選股工作區</h3><span class="qa-live" data-watch-state>瀏覽器本機保存</span></div>'+
'<div class="qa-watch-controls">'+
'<label>股票代號<input id="qa-watch-symbol" maxlength="30" placeholder="AAPL / 2330.TW" autocomplete="off"></label>'+
'<label>清單分組<input id="qa-watch-group" maxlength="24" placeholder="例如：半導體" value="一般觀察"></label>'+
'<label>研究備註<input id="qa-watch-note" maxlength="180" placeholder="進場條件、關注重點"></label>'+
'<button type="button" class="primary" id="qa-watch-add">加入自選股</button></div>'+
'<div class="qa-watch-toolbar">'+
'<label>分組 <select id="qa-watch-filter"></select></label>'+
'<label>排序 <select id="qa-watch-sort"><option value="manual">自訂順序</option><option value="symbol">代號 A–Z</option><option value="updated">最近更新</option><option value="score">QTemp 分數</option></select></label>'+
'<input id="qa-watch-search" type="search" placeholder="搜尋標的或備註" aria-label="搜尋自選股">'+
'<button type="button" id="qa-watch-check">更新可見標的（最多6檔）</button>'+
'<button type="button" id="qa-watch-notify">啟用瀏覽器通知</button>'+
'<button type="button" id="qa-watch-export">匯出 JSON</button>'+
'<label class="qa-watch-import">匯入 JSON <input id="qa-watch-import" type="file" accept=".json,application/json" hidden></label></div>'+
'<p class="qa-watch-message" id="qa-watch-message">資料保存在目前瀏覽器，不會同步至其他裝置。行情檢查最多每次六檔，避免大量請求。</p>'+
'<div class="qa-watch-table" id="qa-watch-table"></div></div>';
const $=id=>document.getElementById(id);
const KEY='qtemp_watchspace_v2',LEGACY='qtemp_watchlist_v1';
const symbolOK=s=>/^[A-Z0-9.^=_-]{1,30}$/.test(s);
const tidy=s=>String(s??'').trim().slice(0,180);
let items=[],quotes=new Map(),busy=false;
try{
 const saved=JSON.parse(localStorage.getItem(KEY)||'null');
 if(Array.isArray(saved))items=saved.filter(x=>x&&symbolOK(x.symbol)).slice(0,60).map((x,i)=>({
  symbol:x.symbol,group:tidy(x.group).slice(0,24)||'一般觀察',note:tidy(x.note),
  created:Number(x.created)||Date.now(),updated:Number(x.updated)||Date.now(),order:i
 }));
 else{
  const legacy=JSON.parse(localStorage.getItem(LEGACY)||'[]');
  items=(Array.isArray(legacy)?legacy:[]).filter(symbolOK).slice(0,6).map((symbol,i)=>({
   symbol,group:'一般觀察',note:'',created:Date.now(),updated:Date.now(),order:i
  }));
 }
}catch{items=[]}
const message=s=>$('qa-watch-message').textContent=s;
const normalize=()=>items.forEach((x,i)=>x.order=i);
function persist(){normalize();try{localStorage.setItem(KEY,JSON.stringify(items))}catch{message('瀏覽器儲存失敗，請確認可用空間與隱私設定。')}}
function groups(){
 const current=$('qa-watch-filter').value||'all',groupSet=[...new Set(items.map(x=>x.group))].sort();
 const select=$('qa-watch-filter');select.replaceChildren();
 [['all','全部分組'],...groupSet.map(g=>[g,g])].forEach(([value,label])=>select.add(new Option(label,value)));
 if(groupSet.includes(current)||current==='all')select.value=current;
}
function viewItems(){
 const group=$('qa-watch-filter').value;
 const query=$('qa-watch-search').value.trim().toLowerCase();
 const result=items.filter(x=>(group==='all'||x.group===group)&&
  (x.symbol.toLowerCase().includes(query)||x.note.toLowerCase().includes(query)||x.group.toLowerCase().includes(query)));
 if($('qa-watch-sort').value==='symbol')result.sort((a,b)=>a.symbol.localeCompare(b.symbol));
 if($('qa-watch-sort').value==='updated')result.sort((a,b)=>b.updated-a.updated);
 if($('qa-watch-sort').value==='score')result.sort((a,b)=>{
  const aScore=quotes.get(a.symbol)?.score,bScore=quotes.get(b.symbol)?.score;
  return (aScore??1000)-(bScore??1000);
 });
 return result;
}
function el(tag,txt,cls){
 const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;
 if(cls)n.className=cls;return n;
}
function render(){
 groups();
 const target=$('qa-watch-table');target.replaceChildren();
 const display=viewItems();
 if(!display.length){target.append(el('div','沒有符合條件的自選股。','qa-watch-empty'));return}
 const table=document.createElement('table'),th=table.createTHead().insertRow();
 ['代號','分組','研究備註','QTemp','最近訊號','確認日期','操作'].forEach(x=>th.append(el('th',x)));
 const tbody=table.createTBody();
 for(const item of display){
  const tr=tbody.insertRow(),quote=quotes.get(item.symbol);
  const sym=tr.insertCell(),goto=el('button',item.symbol);
  goto.type='button';goto.onclick=()=>{
   root.querySelector('[data-q="symbol"]').value=item.symbol;
   const load=root.querySelector('[data-q="load"]');load?.click();
   root.querySelector('[data-route="chart"]')?.click();
  };
  sym.append(goto);
  const group=tr.insertCell(),groupInput=el('input');groupInput.value=item.group;groupInput.maxLength=24;groupInput.setAttribute('aria-label',item.symbol+' 分組');
  groupInput.onchange=()=>{item.group=tidy(groupInput.value).slice(0,24)||'一般觀察';item.updated=Date.now();persist();render()};
  group.append(groupInput);
  const note=tr.insertCell(),noteInput=el('input');noteInput.value=item.note;noteInput.maxLength=180;noteInput.setAttribute('aria-label',item.symbol+' 研究備註');
  noteInput.onchange=()=>{item.note=tidy(noteInput.value);item.updated=Date.now();persist()};
  note.append(noteInput);
  const score=tr.insertCell();score.textContent=quote?.error?'無法取得':quote?.score==null?'—':Number(quote.score).toFixed(2);
  if(Number.isFinite(quote?.score))score.style.color=quote.score<=-70?'#4e68dc':quote.score>=70?'#d0637d':'#53657f';
  tr.insertCell().textContent=quote?.error?'資料失敗':quote?.signal||'—';
  tr.insertCell().textContent=quote?.signalDate||'—';
  const action=tr.insertCell();
  for(const [label,op] of [['↑',-1],['↓',1]]){
   const btn=el('button',label);btn.type='button';btn.title=label==='↑'?'上移':'下移';
   btn.onclick=()=>{const old=items.indexOf(item),next=old+op;if(next<0||next>=items.length)return;
    [items[old],items[next]]=[items[next],items[old]];persist();render()};
   action.append(btn);
  }
  const remove=el('button','移除');remove.type='button';
  remove.onclick=()=>{items=items.filter(x=>x!==item);persist();render()};
  action.append(remove);
 }
 target.append(table);
}
$('qa-watch-add').onclick=()=>{
 const symbol=$('qa-watch-symbol').value.trim().toUpperCase();
 if(!symbolOK(symbol)){message('股票代號格式不正確。');return}
 if(items.some(x=>x.symbol===symbol)){message('清單已存在 '+symbol);return}
 if(items.length>=60){message('最多保存 60 檔自選股。');return}
 items.push({symbol,group:tidy($('qa-watch-group').value).slice(0,24)||'一般觀察',note:tidy($('qa-watch-note').value),created:Date.now(),updated:Date.now(),order:items.length});
 $('qa-watch-symbol').value='';$('qa-watch-note').value='';
 persist();render();message('已加入 '+symbol);
};
$('qa-watch-filter').onchange=render;
$('qa-watch-sort').onchange=render;
$('qa-watch-search').oninput=render;
$('qa-watch-notify').onclick=async()=>{
 if(!('Notification' in window)){message('目前瀏覽器不支援通知');return}
 const granted=await Notification.requestPermission();
 message(granted==='granted'?'瀏覽器通知已授權（僅在開啟網站時生效）':'瀏覽器通知未授權');
};
$('qa-watch-check').onclick=async()=>{
 if(busy)return;
 const chosen=viewItems().slice(0,6);
 if(!chosen.length){message('目前沒有可檢查的股票。');return}
 busy=true;$('qa-watch-check').disabled=true;
 message('正在查詢 '+chosen.map(x=>x.symbol).join('、')+' …');
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),100000);
 try{
  const resp=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({args:[chosen.map(x=>x.symbol).join(',')]}),signal:abort.signal});
  const result=await resp.json();if(!resp.ok||result.error)throw Error(result.error||'回傳資料異常');
  for(const r of result.items){
   quotes.set(r.symbol,r);
  }
  render();
  const failures=result.items.filter(x=>x.error);
  message('查詢完成 '+result.items.length+' 檔'+(failures.length?'；資料不可用：'+failures.map(x=>x.symbol).join('、'):'')+'。數值使用最新已確認收盤日 K，並非即時報價。');
  if('Notification' in window&&Notification.permission==='granted'){
   for(const r of result.items){
    if(r.error||r.score>-90||!r.end)continue;
    const key='qtemp_watch_alert_'+r.symbol,seen=localStorage.getItem(key);
    if(seen===r.end)continue;
    new Notification('QTemp 低估值觀察 '+r.symbol,{body:'已確認日 K '+r.end+' · QTemp '+Number(r.score).toFixed(2)});
    try{localStorage.setItem(key,r.end)}catch{}
   }
  }
 }catch(error){message('檢查失敗：'+(error.name==='AbortError'?'請求逾時':error.message))}
 finally{clearTimeout(timeout);busy=false;$('qa-watch-check').disabled=false}
};
$('qa-watch-export').onclick=()=>{
 const blob=new Blob([JSON.stringify({format:'QTemp-watchspace-v2',exportedAt:new Date().toISOString(),items},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='qtemp-watchlist.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('qa-watch-import').onchange=async()=>{
 const file=$('qa-watch-import').files[0];if(!file)return;
 if(file.size>150000){message('匯入檔超過 150 KB');return}
 try{
  const parsed=JSON.parse(await file.text()),incoming=parsed.items;
  if(parsed.format!=='QTemp-watchspace-v2'||!Array.isArray(incoming))throw Error('不支援的 JSON 格式');
  const safe=incoming.filter(x=>x&&symbolOK(x.symbol)).slice(0,60).map(x=>({
   symbol:x.symbol,group:tidy(x.group).slice(0,24)||'一般觀察',note:tidy(x.note),created:Date.now(),updated:Date.now()
  }));
  const unique=new Map(safe.map(x=>[x.symbol,x]));items=[...unique.values()];persist();render();message('已匯入 '+items.length+' 檔。');
 }catch(error){message('匯入失敗：'+error.message)}
 finally{$('qa-watch-import').value=''}
};
render();
})();