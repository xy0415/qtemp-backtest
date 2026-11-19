(() => {
'use strict';
const endpoint = 'https://api.eqn.news/public/v1';
const channelLabels = {
  all:'全部快訊', main:'加密快訊', tradfi:'傳統金融', tfmoves:'美股異動',
  binance:'幣安公告', korea:'韓國交易所', tier2:'二線交易所上新', tier3:'三線交易所上新',
  alpha:'Binance Alpha', hl:'Hyperliquid', pricechange:'價格異動', oi:'未平倉量異動',
  major:'大幅波動', cz:'CZ 與何一', earn:'理財提醒'
};
const channelGroups = [
  ['市場新聞',['main','tradfi']],
  ['市場異動',['tfmoves','pricechange','oi','major']],
  ['交易所公告',['binance','korea','tier2','tier3','alpha','hl','earn']],
  ['人物追蹤',['cz']]
];
const locale = {zh:'中文',en:'English',ko:'한국어',tr:'Türkçe',ru:'Русский'};
const time = new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const day = new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
const number = new Intl.NumberFormat('zh-TW',{maximumFractionDigits:10});
const etags = new Map();
let retryUntil = 0;
let channelRequest;

function node(tag, value, className) {
  const element = document.createElement(tag);
  if(value != null) element.textContent = String(value);
  if(className) element.className = className;
  return element;
}
function button(value, action, className = 'eq-button') {
  const element = node('button',value,className);
  element.type = 'button';
  element.onclick = action;
  return element;
}
function safeUrl(value) {
  if(typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function link(value, href) {
  const url = safeUrl(href);
  if(!url) return null;
  const element = node('a',value,'eq-link');
  element.href = url;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}
function dateTime(value, formatter) {
  const date = new Date(value);
  return value && Number.isFinite(+date) ? formatter.format(date) : '—';
}
async function request(path, params = {}, signal) {
  const url = new URL(endpoint + path);
  Object.entries(params).forEach(([key,value]) => { if(value) url.searchParams.set(key,value); });
  if(Date.now() < retryUntil) throw Error('來源正在限制請求頻率');
  const cached = etags.get(url.href);
  const response = await fetch(url,{
    signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    headers:cached?.tag ? {'If-None-Match':cached.tag} : undefined
  });
  if(response.status === 304 && cached) return cached.data;
  if(response.status === 429){
    const retry = response.headers.get('Retry-After');
    const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
    retryUntil = Date.now() + Math.max(1000,Number.isFinite(delay) ? delay : 10000);
  }
  if(!response.ok) throw Error(response.status === 404 ? '找不到這則快訊' : '來源暫時無法回應');
  const data = await response.json();
  if(etags.size >= 100) etags.delete(etags.keys().next().value);
  etags.set(url.href,{tag:response.headers.get('ETag'),data});
  return data;
}
function getChannels() {
  if(!channelRequest) channelRequest = request('/channels').then(data => {
    if(!Array.isArray(data.channels)) throw Error('頻道格式異常');
    return data.channels;
  }).catch(error => { channelRequest = null; throw error; });
  return channelRequest;
}
function storyText(story,lang) {
  return [lang,'zh','en','ko','tr','ru'].map(code => story[code]).find(value => typeof value === 'string' && value.trim()) || '';
}
function excerpt(story,lang) {
  return storyText(story,lang).trim().split('\n')[0].replace(/^\s*\*\s*/,'') || '快訊 #' + story.no;
}
const signalLabels = {
  symbol:'標的',name:'名稱',binance_announcement:'幣安公告',raw:'來源欄位',catalog_name:'公告分類',catalog_id:'分類編號',body_chars:'全文字數',
  important:'重要公告',topic:'主題',publishDate:'來源發布時間',exchange:'交易所',market:'市場',direction:'方向',signal:'事件類型',rule:'觸發規則',
  window:'觀察區間',session:'交易時段',pct:'變動幅度',price_pct:'價格變動率',price_eff_pct:'有效價格變動',
  price_24h_pct:'24 小時漲跌',price:'事件價格',ref_price:'參考價格',baseline_price:'基準價格',
  oi:'未平倉量',baseline_oi:'基準未平倉量',oi_pct:'未平倉量變動',oi_usd:'未平倉名目金額',
  oi_mc_ratio:'未平倉量／市值',funding_rate_pct:'資金費率',funding_interval_h:'資金費率週期',
  funding_next_ts:'下次資金費率結算',usd_volume:'美元成交量',vol_24h_usd:'24 小時美元成交量',
  market_cap:'市值',mc:'參考市值',sector:'產業',tier:'標的分類',index_pct:'指數變動',threshold:'觸發門檻',
  threshold_oi_pct:'未平倉量門檻',threshold_price_pct:'價格變動門檻',liquidity_rank:'流動性排名',
  group:'分類',kind_rule:'市場類型',leveraged_etf:'槓桿 ETF',quadrant:'量價型態',base:'基礎資產',members:'同組標的',symbols:'相關標的'
};
const pctFields = new Set(['pct','threshold','index_pct']);
const usdFields = new Set(['oi_usd','usd_volume','vol_24h_usd','market_cap','mc']);
function formatField(key,value) {
  if(typeof value === 'boolean') return value ? '是' : '否';
  if(typeof value !== 'number') {
    const labels = {direction:{up:'上漲',down:'下跌'},market:{perp:'永續合約',spot:'現貨'},
      kind_rule:{crypto:'數位資產'},session:{reg:'正常交易時段',pre:'盤前',post:'盤後'}};
    return labels[key]?.[value] || String(value);
  }
  if(key === 'oi_mc_ratio') return number.format(Number((value * 100).toFixed(4))) + '%';
  if(key === 'window') return value % 60 ? value + ' 秒' : value / 60 + ' 分鐘';
  if(['funding_next_ts','publishDate'].includes(key)) return dateTime(value,day) + ' ' + dateTime(value,time);
  if(key === 'funding_interval_h') return number.format(value) + ' 小時';
  if(key.endsWith('_pct') || pctFields.has(key)) return (value > 0 ? '+' : '') + number.format(Number(value.toFixed(4))) + '%';
  if(usdFields.has(key)) return 'US$' + number.format(Number(value.toFixed(2)));
  return number.format(value);
}
function fieldValue(key,value) {
  const href = link(value,value);
  if(href) return href;
  if(Array.isArray(value)) {
    const list = node('ul',null,'eq-values');
    for(const entry of value) if(entry != null) {
      const row = node('li');
      row.append(fieldValue(key,entry));
      list.append(row);
    }
    return list;
  }
  if(value && typeof value === 'object') return fields(value);
  return document.createTextNode(formatField(key,value));
}
function fields(data) {
  const grid = node('dl',null,'eq-fields');
  const entries = Object.entries(data).filter(([key,value]) =>
    key !== 'i18n' && key !== 'body' && value != null && value !== '' && (!Array.isArray(value) || value.length));
  entries.sort(([left],[right]) => Number(right in signalLabels) - Number(left in signalLabels));
  for(const [key,value] of entries) {
    const cell = node('div');
    cell.append(node('dt',signalLabels[key] || key));
    const content = node('dd');
    content.append(fieldValue(key,value));
    cell.append(content);
    grid.append(cell);
  }
  return grid;
}

function showStory(host,story,feedLang) {
  const dialog = node('dialog',null,'eq-dialog');
  const bar = node('div',null,'eq-dialog-bar');
  const close = button('關閉',() => dialog.close());
  close.autofocus = true;
  bar.append(node('strong','快訊 #' + story.no),close);
  const content = node('div',null,'eq-article');
  const requestControl = new AbortController();
  dialog.setAttribute('aria-label','快訊 #'+story.no);
  dialog.append(bar,content);
  host.append(dialog);
  dialog.addEventListener('close',() => {requestControl.abort();dialog.remove();},{once:true});
  dialog.showModal();
  let retryTimer;
  const onClose = () => clearTimeout(retryTimer);
  dialog.addEventListener('close',onClose,{once:true});
  let lang = feedLang;

  function render(item) {
    content.replaceChildren();
    const translations = node('div',null,'eq-languages');
    for(const [id,label] of Object.entries(locale)) {
      if(!item[id]) continue;
      const choice = button(label,() => {lang=id;render(item);translations.querySelector('[aria-pressed=true]')?.focus();});
      choice.setAttribute('aria-pressed',String(id === lang));
      translations.append(choice);
    }
    const heading = node('h2',excerpt(item,lang));
    const metadata = node('div',null,'eq-story-meta');
    metadata.append(node('span',dateTime(item.time,day) + ' ' + dateTime(item.time,time) + ' 台北'),
      node('span',item.source),...((item.channels || []).map(key => node('span',channelLabels[key] || key))),
      ...((item.coins || []).map(coin => node('span',coin,'eq-token'))));
    content.append(metadata,heading);
    if(translations.childElementCount > 1) content.append(translations);
    const text = storyText(item,lang);
    const remainder = text.trim().split('\n').slice(1).join('\n').trim();
    if(remainder) content.append(node('p',remainder,'eq-story-text'));
    const announcement = item.data?.binance_announcement?.raw;
    const body = item.body || announcement?.body;
    if(body && body !== text) {
      const section = node('section');
      section.append(node('h3','公告全文'));
      const localized = typeof body === 'object' ? body[lang] ?? body.zh ?? body.en ?? body : body;
      section.append(typeof localized === 'string' ? node('p',localized,'eq-story-text') : fields(localized));
      section.className='eq-full-body';
      content.append(section);
    }
    const assetLinks = node('div',null,'eq-story-links');
    for(const [label,url] of [['EquationNews',item.url],['來源原文',item.source_url],
      ...(Array.isArray(item.telegram) ? item.telegram : []).map((url,index) => ['Telegram '+(index+1),url])]) {
      const anchor = link(label,url);
      if(anchor) assetLinks.append(anchor);
    }
    if(assetLinks.childElementCount) content.append(assetLinks);
    const images = node('div',null,'eq-images');
    if(Array.isArray(item.images)) item.images.forEach((image,index) => {
      const url = safeUrl(typeof image === 'string' ? image : image?.url);
      if(!url) return;
      const anchor = link('圖片 '+(index+1),url);
      const figure = node('img');
      figure.src = url;
      figure.alt = '快訊附圖 '+(index+1);
      figure.loading = 'lazy';
      figure.referrerPolicy = 'no-referrer';
      anchor.replaceChildren(figure);
      images.append(anchor);
    });
    if(images.childElementCount) content.append(images);
    if(item.data && typeof item.data === 'object') {
      const section = node('section',null,'eq-data');
      const metrics = fields(item.data);
      if(metrics.childElementCount) {
        section.append(node('h3','事件數據'),metrics);
        content.append(section);
      }
    }
    if(!item.ai) return;
    const analysis = node('section',null,'eq-ai');
    const {summary,overview} = item.ai;
    const aiLang = lang === 'en' ? 'en' : 'zh';
    if(summary?.points?.length) {
      analysis.append(node('h3','AI 公告摘要'));
      if(summary.type) analysis.append(node('p','公告分類 · ' + summary.type,'eq-muted'));
      const list = node('ul');
      summary.points.forEach(point => {
        const text = typeof point === 'string' ? point : point?.[aiLang] || point?.en || point?.zh;
        if(text) list.append(node('li',text));
      });
      analysis.append(list);
    }
    if(overview) {
      analysis.append(node('h3','AI 資訊總覽'));
      const briefing = overview[aiLang] || overview.zh || overview.en;
      if(overview.status === 'pending') analysis.append(node('p','來源正在整理資訊，頁面會自動檢查更新。'));
      if(overview.updated_at) analysis.append(node('p','更新 '+dateTime(overview.updated_at,day)+' '+dateTime(overview.updated_at,time),'eq-muted'));
      for(const paragraph of briefing?.paragraphs || []) {
        analysis.append(node('p',paragraph.text));
        if(paragraph.sources?.length) {
          const sources = node('div',null,'eq-story-links');
          for(const source of paragraph.sources) {
            const label = typeof source === 'string' ? source : source?.name || source?.title || source?.url;
            if(label) sources.append(link(label,typeof source === 'string' ? source : source.url) || node('span',label,'eq-muted'));
          }
          analysis.append(sources);
        }
      }
      if(briefing?.changes) {
        analysis.append(node('h4','更新內容'),fieldValue('changes',briefing.changes));
      }
    }
    if(analysis.childElementCount) {
      analysis.append(node('p','以上由 EquationNews 的 AI 產生，請以原始資料為準。','eq-muted'));
      const next = content.querySelector('.eq-full-body, .eq-data');
      if(next) next.before(analysis);
      else content.append(analysis);
    }
  }
  async function load() {
    try {
      const item = await request('/news/'+encodeURIComponent(story.no),{},requestControl.signal);
      if(!dialog.open) return;
      render(item);
      if(item.ai?.overview?.status === 'pending') retryTimer = setTimeout(load,60000);
    } catch(error) {
      if(!dialog.open) return;
      const notice = node('div',null,'eq-story-links');
      notice.append(node('span','詳細資料暫時無法取得','eq-muted'),button('重試',() => {notice.remove();load();}));
      content.append(notice);
    }
  }
  render(story);
  load();
}

function mount(host,{preview=false,official=null}={}) {
  let channel = 'all';
  let lang = 'zh';
  let coin = '';
  let query = '';
  let items = [];
  let cursor = null;
  let control;
  let generation = 0;
  let polling;
  let socket;
  let heartbeat;
  let reconnect;
  let lastHeartbeat;
  let reconnectDelay = 1000;
  let disposed = false;
  let lastLoaded;
  let userPaged = false;
  let busy = false;
  let refreshPending = false;
  let lastAutomatic = 0;
  let channelList = [];
  let sources = [];
  let source = '';
  const heading = node('div',null,'eq-header');
  const title = node('h2',preview ? '最新市場快訊' : '快訊中心');
  const status = node('span','連線中','eq-status');
  status.setAttribute('role','status');
  heading.append(title,status);
  const categories = node('div',null,'eq-categories');
  const layout = node('div',null,'eq-feed-layout');
  const main = node('div',null,'eq-main');
  const list = node('div',null,'eq-list');
  const actions = node('div',null,'eq-actions');
  const detailHost = node('div');
  const updateButton = button('更新快訊',() => load());
  const moreButton = button('載入較早快訊',() => load({append:true}));
  const notice = node('p','讀取 EquationNews 快訊…','eq-message');
  notice.setAttribute('role','status');
  let sourceSelect;
  let channelSelect;
  let coinInput;
  let searchable;
  if(!preview) {
    const controls = node('form',null,'eq-controls');
    const search = node('input');
    search.type = 'search';
    search.placeholder = '搜尋近 30 天快訊';
    search.setAttribute('aria-label','快訊關鍵字');
    search.maxLength = 100;
    searchable = search;
    coinInput = node('input');
    coinInput.placeholder = '幣種代號';
    coinInput.setAttribute('aria-label','幣種代號');
    coinInput.maxLength = 24;
    sourceSelect = node('select');
    sourceSelect.setAttribute('aria-label','篩選已載入的新聞來源');
    sourceSelect.onchange = () => { source = sourceSelect.value; paint(); };
    const language = node('select');
    language.setAttribute('aria-label','快訊語言');
    language.append(new Option('中文','zh'),new Option('English','en'));
    language.onchange = () => { lang = language.value; paint(); paintSources(); };
    const submit = node('button','搜尋','eq-submit');
    const reset = button('清除',() => {
      query = coin = source = '';
      search.value = coinInput.value = '';
      resetFeed();
    });
    controls.onsubmit = event => {
      event.preventDefault();
      query = search.value.trim();
      coin = coinInput.value.trim().toUpperCase();
      coinInput.value = coin;
      source = '';
      resetFeed();
    };
    controls.append(search,coinInput,submit,reset,sourceSelect,language);
    main.append(controls);
  }
  main.append(list,notice,actions);
  layout.append(main);
  if(!preview) {
    categories.setAttribute('aria-label','快訊頻道');
    layout.prepend(categories);
    channelSelect = node('select',null,'eq-mobile-channels');
    channelSelect.setAttribute('aria-label','快訊頻道');
    channelSelect.onchange = () => selectChannel(channelSelect.value);
  }
  const footer = node('div',null,'eq-footer');
  const subscriptions = node('div',null,'eq-story-links');
  const sourceTime = node('span','EquationNews · 台北時間','eq-muted');
  footer.append(sourceTime,subscriptions);
  host.classList.add('eq-feed');
  host.replaceChildren(heading,...(channelSelect ? [channelSelect] : []),layout,footer,detailHost);
  if(preview) {
    const all = node('a','全部市場快訊','eq-link');
    all.href = '#news';
    actions.append(all);
  } else actions.append(moreButton,updateButton);

  function categoryButton(key,label) {
    const option = button(label,() => selectChannel(key),'eq-channel');
    option.dataset.channel = key;
    option.setAttribute('aria-pressed',String(key === channel));
    return option;
  }
  function selectChannel(key) {
    channel = key;
    source = '';
    categories.querySelectorAll('button').forEach(option =>
      option.setAttribute('aria-pressed',String(option.dataset.channel === key)));
    if(channelSelect) channelSelect.value = key;
    paintSources();
    resetFeed();
  }
  function paintChannels() {
    if(preview) return;
    categories.replaceChildren(categoryButton('all',channelLabels.all));
    channelSelect.replaceChildren(new Option(channelLabels.all,'all'));
    const listed = new Set();
    const remote = new Map(channelList.map(item => [item.key,item]));
    for(const [title,keys] of [...channelGroups,['其他頻道',channelList.map(item => item.key)]]) {
      const group = node('div',null,'eq-channel-group');
      const heading = node('h3',title);
      const options = node('optgroup');
      options.label = title;
      group.append(heading);
      for(const key of keys) {
        if(listed.has(key) || key === 'all') continue;
        listed.add(key);
        const info = remote.get(key);
        const label = channelLabels[key] || info?.name_zh || info?.name_en || key;
        group.append(categoryButton(key,label));
        options.append(new Option(label,key));
      }
      if(options.childElementCount) {
        categories.append(group);
        channelSelect.append(options);
      }
    }
    if(official) {
      categories.append(categoryButton('official','機關公告'));
      channelSelect.append(new Option('機關公告','official'));
    }
    channelSelect.value = channel;
  }
  function paintSources() {
    subscriptions.replaceChildren();
    if(!preview && channel !== 'official') {
      const rss = new URL('https://api.eqn.news/public/rss');
      rss.searchParams.set('ch',channel);
      rss.searchParams.set('lang',lang);
      subscriptions.append(link('RSS 訂閱',rss.href));
      const telegram = link('Telegram 頻道',channelList.find(item => item.key === channel)?.telegram);
      if(telegram) subscriptions.append(telegram);
    }
    const provider = channel === 'official' ? 'Federal Reserve、SEC' : 'EquationNews';
    sourceTime.textContent = provider + ' · 台北時間' + (lastLoaded ? ' · 檢查 ' + dateTime(lastLoaded,time) : '');
  }
  function paint() {
    list.replaceChildren();
    if(sourceSelect) {
      if(items.length) sources = [...new Set(items.map(item => item.source).filter(Boolean))].sort();
      sourceSelect.replaceChildren(new Option('全部已載入來源',''),...sources.map(name => new Option(name,name)));
      sourceSelect.value = source;
      sourceSelect.hidden = channel === 'official';
    }
    let date;
    const visible = source ? items.filter(item => item.source === source) : items;
    for(const item of visible) {
      const localDay = dateTime(item.time,day);
      const localTime = dateTime(item.time,time);
      if(!preview && localDay !== date) {
        date = localDay;
        list.append(node('h3',date,'eq-day'));
      }
      const row = node('article',null,'eq-row');
      const details = node('div',null,'eq-row-content');
      const category = (item.channels || []).find(key => key === channel) || item.channels?.at(-1);
      const metadata = node('div',null,'eq-row-meta');
      for(const value of [item.source,channelLabels[category] || category]) {
        if(value) metadata.append(node('span',value));
      }
      if(!preview) for(const token of item.coins || []) {
        const filter = button(token,() => {
          coin = token;
          coinInput.value = token;
          source = '';
          resetFeed();
        },'eq-token');
        filter.setAttribute('aria-label','篩選 '+token);
        metadata.append(filter);
      }
      const open = channel === 'official' ? link(excerpt(item,lang),item.url) :
        button(excerpt(item,lang),() => showStory(detailHost,item,lang),'eq-story-title');
      if(!open) continue;
      details.append(metadata,open);
      if(!preview && item.ai?.summary?.points?.length){
        const point = item.ai.summary.points[0];
        const text = typeof point === 'string' ? point : point[lang] || point.zh || point.en;
        if(text) details.append(node('p',text,'eq-row-summary'));
      }
      const local = node('time',preview ? localDay.slice(5)+' '+localTime.slice(0,5) : localTime);
      if(item.time) local.dateTime = item.time;
      row.append(local,details);
      list.append(row);
    }
    moreButton.hidden = !cursor || channel === 'official';
    updateButton.disabled = busy;
    notice.hidden = visible.length > 0;
    if(!visible.length) notice.textContent = busy ? '載入快訊…' : '此條件目前沒有快訊';
  }
  function resetFeed() {
    generation++;
    control?.abort();
    control = null;
    items = [];
    sources = [];
    cursor = null;
    userPaged = false;
    lastLoaded = null;
    busy = false;
    refreshPending = false;
    paintSources();
    if(searchable) {
      searchable.disabled = channel === 'official';
      coinInput.disabled = channel === 'official';
      searchable.form.querySelectorAll('button').forEach(button => {button.disabled = channel === 'official';});
    }
    status.textContent = '載入中';
    delete status.dataset.mode;
    load();
  }
  function connectionStatus() {
    status.textContent = socket?.readyState === WebSocket.OPEN && ['all','main'].includes(channel)
      ? '主頻道即時推送' : '定時更新';
    status.dataset.mode = 'connected';
  }
  async function load({append=false,automatic=false}={}) {
    if(disposed || (append && !cursor) || (automatic && Date.now()-lastAutomatic<1000)) return;
    if(busy) {
      if(automatic) refreshPending = true;
      return;
    }
    lastAutomatic = Date.now();
    const revision = generation;
    const activeChannel = channel;
    const next = append ? cursor : null;
    control = new AbortController();
    busy = true;
    if(!automatic || !items.length) paint();
    moreButton.disabled = true;
    updateButton.disabled = true;
    try {
      let data;
      if(activeChannel === 'official') {
        const officialData = await official();
        data = {items:officialData.articles.map(item => ({
          no:item.url,time:item.publishedUTC,source:item.source,en:item.title,url:item.url
        }))};
        if(!data.items.length && officialData.status !== 'ok') throw Error('機關公告來源暫時無法使用');
      } else data = await request('/news',{
        channel:activeChannel,coin,query,limit:preview ? 7 : 25,before:next
      },control.signal);
      if(disposed || revision !== generation) return;
      if(!Array.isArray(data.items)) throw Error('快訊格式異常');
      const freshIds = new Set(data.items.map(item => item.no));
      const combined = append ? [...items,...data.items] :
        userPaged ? [...data.items,...items.filter(item => !freshIds.has(item.no))] : data.items;
      const merged = [...new Map(combined.map(item => [item.no,item])).values()];
      const nextItems = merged.slice(0, preview ? 7 : undefined);
      const changed = append || !automatic || JSON.stringify(nextItems) !== JSON.stringify(items);
      items = nextItems;
      if(append || !userPaged) cursor = data.next_cursor && data.next_cursor !== next ? data.next_cursor : null;
      if(append) userPaged = true;
      lastLoaded = new Date().toISOString();
      busy = false;
      if(changed || !items.length || status.dataset.mode === 'error') paint();
      connectionStatus();
      if(activeChannel === 'official') status.textContent = '機關 RSS';
      paintSources();
    } catch(error) {
      if(disposed || revision !== generation) return;
      status.textContent = items.length ? '更新失敗 · 上次資料' : '暫時無法連線';
      status.dataset.mode = 'error';
      notice.hidden = false;
      notice.replaceChildren(node('span',items.length ? '目前顯示上次成功載入的快訊。' : '暫時無法取得快訊。'),
        button('重試',() => load({append})));
    } finally {
      if(!disposed && revision === generation) {
        busy = false;
        moreButton.disabled = updateButton.disabled = false;
        if(refreshPending) {
          refreshPending = false;
          if(!document.hidden && activeChannel !== 'official') load({automatic:true});
        }
      }
    }
  }
  function disconnect() {
    clearInterval(heartbeat);
    clearTimeout(reconnect);
    if(socket) {
      socket.onclose = socket.onopen = socket.onmessage = null;
      socket.close();
      socket = null;
    }
  }
  function connect() {
    if(disposed || document.hidden || typeof WebSocket === 'undefined') return;
    socket = new WebSocket('wss://api.eqn.news/public/ws');
    socket.onopen = () => {
      reconnectDelay = 1000;
      lastHeartbeat = Date.now();
      if(lastLoaded && status.dataset.mode !== 'error') connectionStatus();
      if(['all','main'].includes(channel)) load({automatic:true});
      heartbeat = setInterval(() => {
        if(Date.now() - lastHeartbeat > 65000) socket.close();
        else if(socket?.readyState === WebSocket.OPEN) socket.send('ping');
      },30000);
    };
    socket.onmessage = ({data}) => {
      if(data === 'pong') {lastHeartbeat = Date.now(); return;}
      if(!['all','main'].includes(channel) || document.hidden) return;
      // The stream carries headlines without REST IDs or a complete channel payload.
      // Refresh REST for a consistent searchable record and detail link.
      load({automatic:true});
    };
    socket.onclose = ({code}) => {
      clearInterval(heartbeat);
      socket = null;
      if(lastLoaded && status.dataset.mode !== 'error') connectionStatus();
      if(disposed || document.hidden) return;
      if(code === 1008 || code === 1013) reconnectDelay = 30000;
      reconnect = setTimeout(connect,reconnectDelay + Math.random()*350);
      reconnectDelay = Math.min(reconnectDelay*2,30000);
    };
  }
  function visibility() {
    if(document.hidden) {disconnect();return;}
    if(!socket) connect();
    if(channel !== 'official') load({automatic:true});
  }
  paintChannels();
  paintSources();
  if(!preview) getChannels().then(result => {
    if(disposed) return;
    channelList = result;
    paintChannels();
    paintSources();
  }).catch(() => {});
  load();
  connect();
  polling = setInterval(() => {
    if(!document.hidden && channel !== 'official') load({automatic:true});
  },20000);
  document.addEventListener('visibilitychange',visibility);
  return () => {
    disposed = true;
    control?.abort();
    detailHost.querySelector('dialog[open]')?.close();
    clearInterval(polling);
    disconnect();
    document.removeEventListener('visibilitychange',visibility);
  };
}
window.equationNews = {mount};
})();
