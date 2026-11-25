"""Public equity snapshots and timestamp-aligned crypto event returns."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from statistics import median
from time import monotonic
from urllib.parse import urlencode

import yfinance as yf
from market_rankings import _json, _numeric

EQUITY_FEEDS = {
    'listed': ('臺灣證券交易所', 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
               'Code', 'Name', 'ClosingPrice', 'TradeVolume', '.TW'),
    'otc': ('證券櫃檯買賣中心', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
            'SecuritiesCompanyCode', 'CompanyName', 'Close', 'TradingShares', '.TWO'),
}
EVENT_CHANNELS = {'main', 'binance', 'korea', 'pricechange', 'oi', 'major'}
RESEARCH_COINS = {'BTC', 'ETH'}


def _date(value):
    value = str(value or '').strip().replace('/', '').replace('-', '')
    if len(value) == 7 and value.isdecimal():
        value = str(int(value[:3]) + 1911) + value[3:]
    try:
        return datetime.strptime(value, '%Y%m%d').date().isoformat()
    except ValueError:
        return None


@lru_cache(maxsize=8)
def taiwan_close(board, slot):
    source, url, code_key, name_key, close_key, volume_key, suffix = EQUITY_FEEDS[board]
    items = []
    for row in _json(url):
        code = str(row.get(code_key, '')).strip()
        close = _numeric(row.get(close_key))
        if not code.isalnum() or close is None or close <= 0:
            continue
        change = _numeric(row.get('Change'))
        previous = close - change if change is not None else None
        items.append(dict(ticker=code+suffix, name=row.get(name_key) or row.get('Name') or code,
                          value=close, asOf=_date(row.get('Date')), currency='TWD',
                          changePct=100*change/previous if previous and previous > 0 else None,
                          volume=_numeric(row.get(volume_key))))
    if not items:
        raise ValueError('官方來源未回傳有效收盤資料')
    return dict(source=source, items=items, checkedAt=datetime.now(timezone.utc).isoformat())


@lru_cache(maxsize=40)
def news_events(coin, channel, slot):
    before = None
    stories = {}
    for _ in range(2):
        params = dict(channel=channel, coin=coin, limit=50)
        if before:
            params['before'] = before
        payload = _json('https://api.eqn.news/public/v1/news?' + urlencode(params))
        for story in payload['items']:
            stamp = story.get('time')
            if not stamp:
                continue
            try:
                moment = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                if moment.tzinfo is None:
                    continue
                day = moment.astimezone(timezone.utc).date().isoformat()
            except (ValueError, TypeError):
                continue
            overview = (story.get('ai') or {}).get('summary') or {}
            summary = [point.get('zh') or point.get('en') for point in overview.get('points', [])
                       if isinstance(point, dict)]
            stories[story.get('no') or (stamp, story.get('url'))] = dict(
                time=stamp, day=day, title=(story.get('zh') or story.get('en') or '').split('\n', 1)[0],
                source=story.get('source'), url=story.get('source_url') or story.get('url'),
                eventUrl=story.get('url'), summary=[x for x in summary if x], kind=story.get('channels', []))
        next_cursor = payload.get('next_cursor')
        if not next_cursor or next_cursor == before:
            break
        before = next_cursor
    return sorted(stories.values(), key=lambda row: row['time'], reverse=True)


@lru_cache(maxsize=8)
def hourly_closes(coin, slot):
    frame = yf.Ticker(coin + '-USD').history(period='1mo', interval='1h', auto_adjust=False,
                                            timeout=12, raise_errors=True)
    now = datetime.now(timezone.utc).timestamp()
    return {int(stamp.timestamp()) + 3600: float(close) for stamp, close in frame['Close'].items()
            if stamp.timestamp() + 3600 <= now and 0 < float(close) < float('inf')}


def event_research(coin, channel):
    slot = int(monotonic() // 300)
    with ThreadPoolExecutor(max_workers=3) as pool:
        events = pool.submit(news_events, coin, channel, slot)
        target = pool.submit(hourly_closes, coin, slot)
        benchmark = target if coin == 'BTC' else pool.submit(hourly_closes, 'BTC', slot)
        target, benchmark, events = target.result(), benchmark.result(), events.result()
    horizons = (1, 24, 168)
    rows = []
    for event in events:
        moment = datetime.fromisoformat(event['time'].replace('Z', '+00:00')).timestamp()
        baseline = (int(moment) // 3600 + 1) * 3600
        returns = {}
        for window in horizons:
            end = baseline + window * 3600
            if baseline not in target or end not in target or baseline not in benchmark or end not in benchmark:
                returns[str(window)] = None
                continue
            absolute = (target[end] / target[baseline] - 1) * 100
            btc = (benchmark[end] / benchmark[baseline] - 1) * 100
            returns[str(window)] = dict(asset=absolute, btc=btc, excess=absolute-btc)
        rows.append(dict(event, returns=returns, baseline=datetime.fromtimestamp(baseline, timezone.utc).isoformat()))
    stats = []
    for window in horizons:
        samples = [r['returns'][str(window)] for r in rows if r['returns'][str(window)] is not None]
        returns = [r['asset'] for r in samples]
        stats.append(dict(hours=window, samples=len(samples), median=median(returns) if returns else None,
                          excess=median(r['excess'] for r in samples) if samples else None,
                          positive=100*sum(x > 0 for x in returns)/len(returns) if returns else None,
                          minimum=min(returns, default=None), maximum=max(returns, default=None)))
    return dict(events=rows, stats=stats, priceSource='Yahoo Finance · 已收盤 1 小時 USD K 線',
                coverage=datetime.fromtimestamp(max(target), timezone.utc).isoformat() if target else None)
