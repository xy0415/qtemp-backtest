"""Market-cap rankings, separately cached so a provider outage stays in its own market."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from threading import Lock
from time import monotonic
from urllib.request import Request, urlopen

import yfinance as yf
from financial_market import _clean, _utc

MARKETS = ('tw', 'us', 'crypto')
_cache = {}
_guards = {market: Lock() for market in MARKETS}
TW_NAMES = dict(zip(
    ('2330','2454','2317','2308','3711','1303','2881','2882','2412','2891','2383','2303','2382','2886','2884','3017'),
    ('台積電','聯發科','鴻海','台達電','日月光投控','南亞','富邦金','國泰金','中華電','中信金','台光電','聯電','廣達','兆豐金','玉山金','奇鋐'),
))


def _stamp(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat() if epoch else None


def _equities(market):
    exchanges = ['NMS', 'NYQ', 'ASE', 'NGM', 'NCM', 'BTS'] if market == 'us' else ['TAI', 'TWO']
    available = set().union(*yf.EquityQuery('eq', ['region', market]).valid_values['exchange'].values())
    exchanges = [exchange for exchange in exchanges if exchange in available]
    region = yf.EquityQuery('eq', ['region', market])
    query = yf.EquityQuery('and', [region, yf.EquityQuery('is-in', ['exchange', *exchanges])]) if exchanges else region
    result = yf.screen(query, size=30, sortField='intradaymarketcap', sortAsc=False)
    values = []
    currency = 'TWD' if market == 'tw' else 'USD'
    issuers = set()
    for item in result.get('quotes', []):
        ticker = item.get('symbol')
        cap = _clean(item.get('marketCap'))
        if not ticker or not cap or cap <= 0 or item.get('currency') != currency:
            continue
        if market == 'tw' and not ticker.endswith(('.TW', '.TWO')):
            continue
        if market == 'us' and item.get('exchange') not in {'NMS','NYQ','ASE','NGM','NCM','BTS'}:
            continue
        name = item.get('longName') or item.get('shortName') or ticker
        issuer = {'GOOG':'GOOGL','BRK-A':'BRK-B','BF-A':'BF-B','FOX':'FOXA','NWS':'NWSA'}.get(ticker, ticker)
        if issuer in issuers:
            continue
        issuers.add(issuer)
        values.append(dict(ticker=ticker, name=TW_NAMES.get(ticker.split('.')[0], name), marketCap=cap,
                           currency=currency, value=_clean(item.get('regularMarketPrice')),
                           changePct=_clean(item.get('regularMarketChangePercent')),
                           volume=_clean(item.get('regularMarketVolume')),
                           asOf=_stamp(item.get('regularMarketTime')),
                           exchange=item.get('fullExchangeName') or item.get('exchange'),
                           state=item.get('marketState')))
    return 'Yahoo Finance', values


def _json(url, headers=None):
    request = Request(url, headers={'Accept':'application/json','User-Agent':'MarketTerminal/1.0', **(headers or {})})
    with urlopen(request, timeout=8) as response:
        return json.load(response)


def _cmc(key):
    address = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=10&sort=market_cap&convert=USD'
    rows = _json(address, {'X-CMC_PRO_API_KEY': key}).get('data', [])
    result = []
    for row in rows:
        quote = row.get('quote', {}).get('USD', {})
        result.append(dict(ticker=row['symbol'], name=row['name'], marketCap=_clean(quote.get('market_cap')),
                           value=_clean(quote.get('price')), changePct=_clean(quote.get('percent_change_24h')),
                           volume=_clean(quote.get('volume_24h')), asOf=quote.get('last_updated'), currency='USD',
                           providerId=str(row['id']), slug=row.get('slug')))
    return result


def _numeric(value):
    try:
        return float(str(value).replace(',', '').replace('$', '').replace('%', '').strip())
    except (ValueError, TypeError):
        return None


def _twse_equities():
    """Official listed stocks; cap is close times issued ordinary shares, not intraday."""
    companies = _json('https://openapi.twse.com.tw/v1/opendata/t187ap03_L')
    prices = _json('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    by_code = {str(item.get('公司代號')): item for item in companies}
    rows = []
    for price in prices:
        code = str(price.get('Code', ''))
        company = by_code.get(code)
        if not company or len(code) != 4 or not code.isdigit():
            continue
        close = _numeric(price.get('ClosingPrice'))
        shares = _numeric(company.get('已發行普通股數或TDR原股發行股數'))
        change = _numeric(price.get('Change'))
        if not close or not shares or close <= 0 or shares <= 0:
            continue
        previous = close - change if change is not None else None
        day = str(price.get('Date') or '')
        if len(day)==8 and day.isdigit():
            asof = day[:4]+'-'+day[4:6]+'-'+day[6:]
        elif len(day)==7 and day.isdigit():
            asof = str(int(day[:3])+1911)+'-'+day[3:5]+'-'+day[5:]
        else:
            asof = None
        rows.append(dict(ticker=code+'.TW', name=company.get('公司簡稱') or price.get('Name'),
                         marketCap=close*shares, value=close, changePct=(change/previous*100 if previous and previous>0 else None),
                         volume=_numeric(price.get('TradeVolume')), currency='TWD', asOf=asof))
    return '臺灣證交所 · 上市股票 · 收盤估算市值（未含上櫃）', rows


def _nasdaq_equities():
    """Nasdaq-listed US securities screener; preserve provider price timestamp semantics."""
    address = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true'
    data = _json(address, {'User-Agent':'Mozilla/5.0 (compatible; MarketResearch/1.0)',
                           'Origin':'https://www.nasdaq.com', 'Referer':'https://www.nasdaq.com/'})
    payload = data.get('data') or {}
    table = payload.get('table') or payload
    rows=[]
    for row in table.get('rows') or []:
        ticker=str(row.get('symbol') or '').upper()
        cap=_numeric(row.get('marketCap'))
        value=_numeric(row.get('lastsale'))
        if not ticker or not cap or not value:
            continue
        rows.append(dict(ticker=ticker, name=row.get('name') or ticker, marketCap=cap,
                         value=value, changePct=_numeric(row.get('pctchange')),
                         volume=_numeric(row.get('volume')), asOf=None, currency='USD'))
    return 'Nasdaq 股票篩選資料 · 報價時間請以來源為準', rows


def _equity_with_fallback(market):
    try:
        source, rows = _equities(market)
        if len(rows) >= 10:
            return source, rows
    except Exception:
        pass
    return _twse_equities() if market == 'tw' else _nasdaq_equities()

def _crypto():
    key = os.environ.get('COINMARKETCAP_API_KEY')
    if key:
        try:
            data = _cmc(key)
            if len(data) == 10 and all(row.get('marketCap') for row in data):
                return 'CoinMarketCap', data
        except Exception:
            pass
    address = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false'
    try:
        rows = _json(address)
        if not isinstance(rows,list) or len(rows)<10:
            raise ValueError('Incomplete rankings')
        return 'CoinGecko', [
            dict(ticker=row['symbol'].upper(), name=row['name'], marketCap=_clean(row.get('market_cap')),
                 value=_clean(row.get('current_price')), changePct=_clean(row.get('price_change_percentage_24h')),
                 volume=_clean(row.get('total_volume')), asOf=row.get('last_updated'), currency='USD',
                 providerId=row['id']) for row in rows
        ]
    except Exception:
        rows = _json('https://api.coinpaprika.com/v1/tickers?quotes=USD')
        return 'CoinPaprika', [
            dict(ticker=row['symbol'], name=row['name'], marketCap=_clean(row['quotes']['USD'].get('market_cap')),
                 value=_clean(row['quotes']['USD'].get('price')),
                 changePct=_clean(row['quotes']['USD'].get('percent_change_24h')),
                 volume=_clean(row['quotes']['USD'].get('volume_24h')), asOf=row.get('last_updated'),
                 currency='USD', providerId=row['id']) for row in rows[:10]
        ]


def rankings(market):
    with _guards[market]:
        prior = _cache.get(market)
        if prior and monotonic() < prior[0]:
            return prior[1]
        try:
            source, values = _crypto() if market == 'crypto' else _equity_with_fallback(market)
            values = sorted((row for row in values if row['marketCap'] and row['marketCap'] > 0),
                            key=lambda row: row['marketCap'], reverse=True)[:10]
            if len(values) < 10:
                raise ValueError('Incomplete rankings')
            result = dict(items=[dict(row,rank=i) for i,row in enumerate(values,1)],
                          source=source, checkedAt=_utc(), stale=False)
            _cache[market] = (monotonic() + (300 if market=='crypto' else 180), result)
            return result
        except Exception:
            if prior and prior[1].get('items'):
                result = dict(prior[1],stale=True)
            else:
                result = dict(items=[], source=None, checkedAt=None, error='市值排名來源暫時無法取得')
            _cache[market] = (monotonic() + 30,result)
            return result


def market_segment(market, category):
    from financial_market import INDEXES, US_ETFS, TW_STOCKS, SECTORS, _cache_get, _entry
    if category == 'index':
        selected = {'^TWII'} if market == 'tw' else {'^GSPC','^IXIC','^DJI','^SOX','^NDX','^RUT','^VIX'}
        entries = [row for row in INDEXES if row[0] in selected]
    else:
        entries = [row for row in TW_STOCKS if row[-1] == 'ETF'] if market == 'tw' else US_ETFS + SECTORS
    def load():
        with ThreadPoolExecutor(max_workers=6) as pool:
            return dict(items=list(pool.map(_entry, entries)), source='Yahoo Finance · 已確認收盤日線')
    return _cache_get(('terminal-segment',market,category),180,load)


def taiwan_disclosures():
    from datetime import timedelta
    from financial_market import _cache_get
    from zoneinfo import ZoneInfo

    feeds = (
        ('證交所','https://openapi.twse.com.tw/v1/opendata/t187ap04_L','公司代號','公司名稱'),
        ('櫃買中心','https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O','SecuritiesCompanyCode','CompanyName'),
    )

    def read(feed):
        source,url,code_key,name_key=feed
        try:
            rows=_json(url)
        except Exception:
            return []
        result=[]
        for row in rows if isinstance(rows,list) else []:
            title=' '.join((row.get('主旨') or row.get('主旨 ') or '').split())
            code=row.get(code_key)
            if not title or not code or any(word in title for word in ('公司債','債券','外匯')):
                continue
            date=str(row.get('發言日期',''))
            clock=str(row.get('發言時間','')).zfill(6)
            try:
                stamp=datetime.strptime(str(int(date[:-4])+1911)+date[-4:]+clock,'%Y%m%d%H%M%S')
                stamp=stamp.replace(tzinfo=ZoneInfo('Asia/Taipei'))
                if stamp > datetime.now(tz=stamp.tzinfo)+timedelta(minutes=5):
                    continue
                timestamp=stamp.isoformat()
            except ValueError:
                timestamp=None
            result.append(dict(source=source,symbol=code,name=row.get(name_key),title=title,asOf=timestamp))
        return result

    def load():
        with ThreadPoolExecutor(max_workers=2) as pool:
            rows=[row for group in pool.map(read,feeds) for row in group]
        return dict(items=sorted(rows,key=lambda row:row['asOf'] or '',reverse=True)[:30],source='證交所／櫃買中心 OpenAPI')
    return _cache_get(('taiwan-disclosures',),180,load)

