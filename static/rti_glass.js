(() => {
  'use strict';
  const root = document.querySelector('#qtemp_root');
  const content = root.querySelector('#content');
  const top = root.querySelector('.top-menu');
  const nav = top.querySelector('nav');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const routes = [
    ['首頁', '#home', '⌂'], ['市值排行', '#crypto/rank', '◈'],
    ['加密資產總覽', '#crypto/assets', '▤'], ['幣種查詢', '#crypto/lookup', '⌕'],
    ['加密快訊', '#crypto/news', '≋'], ['行情與 RTI', '#rti/analysis', '∿'],
    ['訊號研究', '#rti/signals', '↗'], ['區間統計', '#rti/zones'],
    ['買賣策略', '#rti/backtest'], ['投入策略比較', '#rti/capital'],
    ['多資產比較', '#rti/compare'], ['研究資源', '#rti/resources'], ['指標說明', '#rti/method']
  ];
  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }
  function control(label, className, text = label) {
    const button = el('button', className, text);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    return button;
  }
  function transition(node, frames, options) {
    if (!motion.matches) return node.animate(frames, options);
  }

  const highlight = el('i', 'glass-nav-highlight');
  highlight.setAttribute('aria-hidden', 'true');
  nav.prepend(highlight);
  let lastX;
  let pillAnimation;
  function highlightRoute() {
    const part = location.hash.slice(1).split('/')[0];
    const path = ['crypto', 'rti'].includes(part) ? '#' + part : '#home';
    const active = [...nav.querySelectorAll('a')].find(link => link.hash === path);
    if (!active || !active.offsetWidth) return;
    nav.querySelectorAll('a').forEach(link => {
      if (link === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const x = active.offsetLeft;
    const width = active.offsetWidth;
    if (x === lastX && highlight.offsetWidth === width) return;
    const previous = highlight.getBoundingClientRect().left - nav.getBoundingClientRect().left - nav.clientLeft;
    pillAnimation?.cancel();
    highlight.style.width = width + 'px';
    highlight.style.transform = 'translateX(' + x + 'px)';
    if (lastX !== undefined && Math.abs(x - previous) > 2) {
      const direction = Math.sign(x - previous);
      pillAnimation = transition(highlight, [
        { transform: 'translateX(' + previous + 'px) scaleX(1)', offset: 0 },
        { transform: 'translateX(' + (x - direction * 9) + 'px) scaleX(1.28)', offset: .58 },
        { transform: 'translateX(' + (x + direction * 3) + 'px) scaleX(.94)', offset: .83 },
        { transform: 'translateX(' + x + 'px) scaleX(1)', offset: 1 }
      ], { duration: 450, easing: 'cubic-bezier(.24,.72,.27,1)' });
    }
    lastX = x;
  }

  const search = control('搜尋頁面', 'glass-search', '搜尋');
  search.append(el('kbd', '', /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K'));
  top.append(search);
  const dialog = el('dialog', 'glass-command');
  dialog.setAttribute('aria-label', '搜尋頁面');
  const field = el('input');
  field.type = 'search';
  field.placeholder = '搜尋頁面、功能或幣種代號';
  field.setAttribute('aria-label', field.placeholder);
  const close = control('關閉搜尋', 'glass-close', '×');
  const searchBar = el('div', 'glass-command-input');
  searchBar.append(field, close);
  const results = el('div', 'glass-command-results');
  dialog.append(searchBar, results);
  root.append(dialog);
  let index = 0;
  let matches = [];
  let openedFrom;
  function renderSearch() {
    const term = field.value.trim().toLowerCase();
    matches = routes.filter(([name, href]) => (name + ' ' + href).toLowerCase().includes(term));
    if (term && /^[a-z0-9]{2,12}(?:-usd)?$/i.test(term)) {
      const symbol = term.toUpperCase().replace(/-USD$/, '');
      matches = [...matches, ['查詢 ' + symbol + ' 行情', '#crypto/lookup/' + symbol + '-USD']];
    }
    index = 0;
    results.replaceChildren();
    for (const [name, href] of matches) {
      const link = el('a', 'glass-result');
      link.href = href;
      const pos = term ? name.toLowerCase().indexOf(term) : -1;
      if (pos < 0) link.textContent = name;
      else link.append(name.slice(0, pos), el('mark', '', name.slice(pos, pos + term.length)), name.slice(pos + term.length));
      link.addEventListener('click', () => dialog.close());
      results.append(link);
    }
    if (!matches.length) results.append(el('p', '', '找不到符合的頁面'));
    selectSearch(0);
  }
  function selectSearch(next) {
    if (!matches.length) return;
    index = (next + matches.length) % matches.length;
    [...results.children].forEach((link, i) => link.classList.toggle('is-selected', i === index));
    if (dialog.open) results.children[index].scrollIntoView({ block: 'nearest' });
  }
  function openSearch() {
    if (dialog.open) return;
    openedFrom = document.activeElement;
    field.value = '';
    renderSearch();
    dialog.showModal();
    field.focus();
  }
  search.onclick = openSearch;
  close.onclick = () => dialog.close();
  field.oninput = renderSearch;
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => openedFrom?.focus({ preventScroll: true }));
  field.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectSearch(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && matches.length) {
      event.preventDefault();
      results.children[index].click();
    }
  });

  const dock = el('nav', 'glass-dock');
  dock.setAttribute('aria-label', '快速導覽');
  const wide = control('全螢幕內容', 'glass-dock-item glass-dock-wide', '⛶');
  wide.dataset.label = '全螢幕內容';
  function setWide(enabled) {
    root.classList.toggle('glass-wide', enabled);
    wide.setAttribute('aria-pressed', String(enabled));
    wide.dataset.label = enabled ? '退出全螢幕內容' : '全螢幕內容';
    wide.setAttribute('aria-label', wide.dataset.label);
    if (!enabled) highlightRoute();
  }
  setWide(false);
  function toggleWide() {
    const enabled = !root.classList.contains('glass-wide');
    setWide(enabled);
    if (enabled) root.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
  }
  wide.onclick = toggleWide;
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && root.classList.contains('glass-wide')) setWide(false);
  });
  dock.append(wide);
  for (const [name, href, icon] of routes.filter(route => ['#home','#crypto/rank','#crypto/news','#rti/analysis','#rti/signals'].includes(route[1]))) {
    const link = el('a', 'glass-dock-item', icon);
    link.href = href;
    link.setAttribute('aria-label', name);
    link.dataset.label = name;
    dock.append(link);
  }
  const dockSearch = control('搜尋頁面', 'glass-dock-item', '⌕');
  dockSearch.dataset.label = '搜尋';
  dockSearch.onclick = openSearch;
  dock.append(dockSearch);
  root.append(dock);
  function dockState() {
    const path = location.hash || '#home';
    for (const link of dock.querySelectorAll('a')) {
      const marketDefault = path === '#crypto' ? '#crypto/rank' : path === '#rti' ? '#rti/analysis' : path;
      if (marketDefault === link.hash || marketDefault.startsWith(link.hash + '/')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else openSearch();
    } else if (event.key === 'Escape' && !dialog.open && root.classList.contains('glass-wide')) toggleWide();
  });

  content.addEventListener('pointermove', event => {
    if (motion.matches || event.pointerType === 'touch') return;
    const card = event.target.closest('.landing-card, .glass-module');
    if (!card || card.classList.contains('glass-module-active')) return;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty('--light-x', x * 100 + '%');
    card.style.setProperty('--light-y', y * 100 + '%');
    card.style.setProperty('--tilt-x', (0.5 - y) * 4 + 'deg');
    card.style.setProperty('--tilt-y', (x - 0.5) * 5 + 'deg');
    card.classList.add('glass-tracking');
  });
  content.addEventListener('pointerout', event => {
    const card = event.target.closest('.landing-card, .glass-module');
    if (card && !card.contains(event.relatedTarget)) card.classList.remove('glass-tracking');
  });

  function deck(grid, cards) {
    if (cards.length < 2) return;
    grid.classList.add('glass-deck');
    const strip = el('div', 'glass-strip');
    strip.setAttribute('aria-label', '切換模組');
    strip.setAttribute('role', 'group');
    strip.hidden = true;
    let active = null;
    const opens = new Map();
    const closers = new Map();
    function focusCard(card, source) {
      const from = source.getBoundingClientRect();
      active = card;
      grid.classList.toggle('glass-expanded', Boolean(card));
      strip.hidden = !card;
      for (const item of cards) {
        item.hidden = Boolean(card && item !== card);
        item.classList.remove('glass-tracking');
        item.classList.toggle('glass-module-active', item === card);
        opens.get(item).hidden = item === card;
        opens.get(item).setAttribute('aria-expanded', String(item === card));
        closers.get(item).hidden = item !== card;
      }
      for (const item of strip.children) item.setAttribute('aria-pressed', String(cards[Number(item.dataset.index)] === card));
      const target = card || source.closest('.glass-module');
      if (!target) return;
      const box = target.getBoundingClientRect();
      if (box.width && from.width) transition(target, [
        { translate: (from.left - box.left) + 'px ' + (from.top - box.top) + 'px', scale: (from.width / box.width) + ' ' + (from.height / box.height) },
        { translate: '0 0', scale: '1' }
      ], { duration: 390, easing: 'cubic-bezier(.2,.75,.26,1)' });
      (card ? closers.get(card) : opens.get(target)).focus({ preventScroll: true });
    }
    cards.forEach((card, i) => {
      card.classList.add('glass-module');
      const name = card.querySelector('h2,h3').textContent;
      const expand = control('展開' + name, 'glass-expand', '↗');
      const collapse = control('收合' + name, 'glass-expand', '×');
      opens.set(card, expand);
      closers.set(card, collapse);
      collapse.hidden = true;
      expand.setAttribute('aria-expanded', 'false');
      expand.onclick = () => focusCard(card, card);
      collapse.onclick = () => focusCard(null, card);
      card.addEventListener('click', event => {
        if (!active && !event.target.closest('a,button,input,select,textarea,label,svg') && !window.getSelection()?.toString()) focusCard(card, card);
      });
      card.prepend(expand, collapse);
      const preview = control('顯示' + name, 'glass-preview', name);
      preview.dataset.index = i;
      preview.onclick = () => focusCard(card, active);
      strip.append(preview);
    });
    grid.append(strip);
    grid.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) { event.stopPropagation(); focusCard(null, active); }
    });
  }

  function modules(host) {
    const children = [...host.children];
    const first = children.findIndex(child => child.matches('h2, .terminal-statistics'));
    if (first < 0) return;
    const grid = el('div', 'glass-data-deck');
    children[first].before(grid);
    let current;
    for (const child of children.slice(first)) {
      if (child.matches('h2')) {
        current = el('section', 'glass-data-panel');
        current.append(child);
        grid.append(current);
      } else if (child.matches('.terminal-statistics, .terminal-method') && child.querySelector('h2')) {
        current = child;
        grid.append(current);
      } else current?.append(child);
    }
    deck(grid, [...grid.children]);
  }

  function enhanceFilter(select) {
    if (select.dataset.glassFilter) return;
    select.dataset.glassFilter = 'true';
    const wrapper = el('div', 'glass-filter');
    const label = select.getAttribute('aria-label') || '篩選';
    const trigger = control(label, 'glass-filter-trigger');
    trigger.setAttribute('aria-expanded', 'false');
    const list = el('div', 'glass-filter-options');
    list.hidden = true;
    const sync = () => {
      trigger.textContent = (select.selectedOptions[0]?.textContent || label) + ' ⌄';
      [...list.children].forEach((item, i) => item.setAttribute('aria-pressed', String(i === select.selectedIndex)));
    };
    function toggle(show) {
      trigger.setAttribute('aria-expanded', String(show));
      list.classList.toggle('is-open', show);
      list.inert = !show;
      if (show) list.hidden = false;
      else if (motion.matches) list.hidden = true;
      else setTimeout(() => { if (!list.classList.contains('is-open')) list.hidden = true; }, 230);
    }
    select.before(wrapper);
    wrapper.append(select, trigger, list);
    select.hidden = true;
    for (const [i, option] of [...select.options].entries()) {
      const item = control(option.textContent, 'glass-filter-option');
      item.disabled = option.disabled;
      item.style.setProperty('--drop-index', i);
      item.onclick = () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        toggle(false);
        trigger.focus();
      };
      list.append(item);
    }
    trigger.onclick = () => toggle(trigger.getAttribute('aria-expanded') === 'false');
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) toggle(false); });
    wrapper.addEventListener('keydown', event => {
      if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
        event.stopPropagation(); toggle(false); trigger.focus();
      }
    });
    list.inert = true;
    select.addEventListener('change', sync);
    sync();
  }

  const counters = new WeakMap();
  function count(output, value) {
    const before = Number(output.textContent) || 0;
    counters.delete(output);
    if (motion.matches || !output.textContent || before === value) { output.textContent = value; return; }
    const token = {};
    counters.set(output, token);
    const start = performance.now();
    function update(now) {
      if (!output.isConnected || counters.get(output) !== token) return;
      const t = Math.min(1, (now - start) / 360);
      output.textContent = Math.round(before + (value - before) * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }
  window.rtiGlass = { modules, count };
  const observer = new MutationObserver(() => {
    const grid = content.querySelector('.landing-cards:not(.glass-deck)');
    if (grid) deck(grid, [...grid.querySelectorAll('.landing-card')]);
    for (const select of content.querySelectorAll('.terminal-actions select:not([data-glass-filter]), select.glass-select:not([data-glass-filter])')) enhanceFilter(select);
  });
  observer.observe(content, {childList: true, subtree: true});
  new ResizeObserver(highlightRoute).observe(nav);
  window.addEventListener('hashchange', () => requestAnimationFrame(() => { highlightRoute(); dockState(); }));
  requestAnimationFrame(() => { highlightRoute(); dockState(); });
})();
