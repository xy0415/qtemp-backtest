(()=>{'use strict';
const root=document.getElementById('qtemp_root');if(!root)return;
const shell=document.createElement('section');shell.className='addons';
shell.innerHTML='<div class="addons-panel" data-addon="1" hidden></div>'+
 '<div class="addons-panel" data-addon="2" hidden></div>'+
 '<div class="addons-panel" data-addon="3" hidden></div>'+
 '<div class="addons-panel" data-addon="4" hidden><h3>資料與匯出</h3><p>以目前分析標的的已確認 Yahoo Finance 日線與 QTemp 訊號為準。</p>'+
 '<div class="addons-export"><button type="button" id="extra-daily">日線 CSV</button>'+
 '<button type="button" id="extra-events">訊號 CSV</button>'+
 '<button type="button" id="extra-study">勝率 CSV</button>'+
 '<button type="button" id="extra-link">複製網址</button>'+
 '<button type="button" id="extra-print">列印／另存 PDF</button></div>'+
 '<p id="extra-export-out" role="status"></p></div>';
root.querySelector('[data-q="results"]').insertAdjacentElement('afterend',shell);
// Preserve navigation's existing addon selection contract without legacy UIs.
for(const id of ['1','2','3','4']){
 const tab=document.createElement('button');tab.type='button';
 tab.hidden=true;tab.dataset.addonTab=id;tab.setAttribute('aria-selected','false');
 tab.onclick=()=>{shell.querySelectorAll('[data-addon]').forEach(p=>p.hidden=p.dataset.addon!==id)};
 shell.prepend(tab);
}
const el=id=>document.getElementById(id);
async function request(method,args){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{
  const res=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({args}),signal:controller.signal});
  const result=await res.json();if(!res.ok||result.error)throw Error(result.error||'資料取得失敗');
  return result;
 }finally{clearTimeout(timer)}
}
const csv=rows=>'\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
function download(name,body){
 const url=URL.createObjectURL(new Blob([body],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportCsv(kind){
 const symbol=root.querySelector('[data-q="symbol"]').value.trim().toUpperCase();
 const out=el('extra-export-out');out.textContent='匯出資料中…';
 try{
  const data=await request('analyze',[symbol]);
  let rows;
  if(kind==='daily')rows=[data.daily.columns,...data.daily.rows];
  else if(kind==='events')rows=[data.events.columns,...data.events.rows];
  else rows=[['訊號','持有天數','有效樣本','方向勝率','平均報酬','方向報酬','平均MAE'],
   ...data.forwardStudy.rows.map(x=>[x.signal,x.days,x.count,x.winRate,x.avgReturn,x.avgDirectional,x.avgMAE])];
  download('QTemp_'+symbol+'_'+kind+'.csv',csv(rows));
  out.textContent='已下載 '+kind+' CSV';
 }catch(e){out.textContent='匯出失敗：'+e.message}
}
el('extra-daily').onclick=()=>exportCsv('daily');
el('extra-events').onclick=()=>exportCsv('events');
el('extra-study').onclick=()=>exportCsv('study');
el('extra-link').onclick=async()=>{
 const url=new URL(location.href);
 url.searchParams.set('symbol',root.querySelector('[data-q="symbol"]').value.trim().toUpperCase());
 try{await navigator.clipboard.writeText(url.toString());el('extra-export-out').textContent='已複製網址'}
 catch{el('extra-export-out').textContent=url.toString()}
};
el('extra-print').onclick=()=>window.print();
const shared=new URLSearchParams(location.search).get('symbol');
if(shared&&/^[A-Z0-9.^=_-]{1,30}$/i.test(shared)){
 root.querySelector('[data-q="symbol"]').value=shared.toUpperCase();
}
})();
