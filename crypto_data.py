"""Paginated crypto listings and curated CoinMarketCap datasets."""
from datetime import datetime, timezone
from functools import lru_cache
from time import monotonic
from urllib.error import HTTPError
from urllib.parse import urlencode
import math
import os
import re

from market_rankings import _json

SORTS = {
    'rank': 'market_cap', 'marketCap': 'market_cap_strict', 'price': 'price',
    'change1h': 'percent_change_1h', 'change24h': 'percent_change_24h',
    'change7d': 'percent_change_7d', 'volume': 'volume_24h',
}
PAGE_SIZE = 100


def _number(value):
    try:
        value = float(value)
    except (ValueError, TypeError):
        return None
    return value if math.isfinite(value) else None


def _cmc_request(path, params=None, *, public=False):
    key = os.environ.get('COINMARKETCAP_API_KEY')
    suffix = '?' + urlencode(params) if params else ''
    base = 'https://pro-api.coinmarketcap.com'
    if key:
        try:
            return _json(base + path + suffix, {'X-CMC_PRO_API_KEY': key})
        except HTTPError as error:
            if not public or error.code not in (401, 403, 429):
                raise
    if public:
        return _json(base + '/public-api' + path + suffix)
    raise ValueError('此資料需要 CoinMarketCap 金鑰')


def _quote(row):
    quotes = row.get('quote') or row.get('quotes') or {}
    if isinstance(quotes, dict):
        return quotes.get('USD') or {}
    return next((entry for entry in quotes if entry.get('symbol') == 'USD' or entry.get('convert_symbol') == 'USD'), {})


def _asset(row):
    q = _quote(row)
    platform = row.get('platform') or {}
    return dict(rank=row.get('cmc_rank'), symbol=row.get('symbol'), name=row.get('name'),
                price=_number(q.get('price')), marketCap=_number(q.get('market_cap')),
                volume=_number(q.get('volume_24h')), change1h=_number(q.get('percent_change_1h')),
                change24h=_number(q.get('percent_change_24h')), change7d=_number(q.get('percent_change_7d')),
                change30d=_number(q.get('percent_change_30d')), change60d=_number(q.get('percent_change_60d')),
                change90d=_number(q.get('percent_change_90d')), circulating=_number(row.get('circulating_supply')),
                totalSupply=_number(row.get('total_supply')), maxSupply=_number(row.get('max_supply')),
                fullyDiluted=_number(q.get('fully_diluted_market_cap')), dominance=_number(q.get('market_cap_dominance')),
                volumeChange=_number(q.get('volume_change_24h')), cexVolume=_number(q.get('cex_volume_24h')),
                dexVolume=_number(q.get('dex_volume_24h')), tvl=_number(q.get('tvl')),
                marketPairs=row.get('num_market_pairs'), lastUpdated=q.get('last_updated') or row.get('last_updated'),
                chain=platform.get('name'), address=platform.get('token_address'),
                tags=[tag.get('name') or tag.get('slug') for tag in (row.get('tags') or []) if isinstance(tag, dict)]
                     + [tag for tag in (row.get('tags') or []) if isinstance(tag, str)],
                providerId=row.get('id'))


def _gecko(page, sort, order):
    fields = {'rank': 'market_cap', 'marketCap': 'market_cap', 'volume': 'volume'}
    if sort not in fields:
        raise ValueError('備援資料源不提供此全市場排序')
    query = urlencode(dict(vs_currency='usd', order=fields[sort] + '_' + order,
                           per_page=PAGE_SIZE, page=page, sparkline='false',
                           price_change_percentage='1h,24h,7d,30d'))
    rows = _json('https://api.coingecko.com/api/v3/coins/markets?' + query)
    if not isinstance(rows, list):
        raise ValueError('CoinGecko 無可用資料')
    return [dict(rank=r.get('market_cap_rank'), symbol=(r.get('symbol') or '').upper(), name=r.get('name'),
                 price=_number(r.get('current_price')), marketCap=_number(r.get('market_cap')),
                 volume=_number(r.get('total_volume')), change1h=_number(r.get('price_change_percentage_1h_in_currency')),
                 change24h=_number(r.get('price_change_percentage_24h_in_currency')),
                 change7d=_number(r.get('price_change_percentage_7d_in_currency')),
                 change30d=_number(r.get('price_change_percentage_30d_in_currency')),
                 circulating=_number(r.get('circulating_supply')), totalSupply=_number(r.get('total_supply')),
                 maxSupply=_number(r.get('max_supply')), fullyDiluted=_number(r.get('fully_diluted_valuation')),
                 lastUpdated=r.get('last_updated'), providerId=r.get('id')) for r in rows]


@lru_cache(maxsize=128)
def _market(slot, page, sort, order, provider):
    params = dict(start=(page - 1) * PAGE_SIZE + 1, limit=PAGE_SIZE, sort=SORTS[sort], sort_dir=order, convert='USD')
    try:
        if provider == 'CoinGecko':
            items, source = _gecko(page, sort, order), 'CoinGecko'
        else:
            try:
                data = _cmc_request('/v3/cryptocurrency/listings/latest', params, public=True)['data']
            except Exception:
                data = _cmc_request('/v1/cryptocurrency/listings/latest', params)['data']
            items, source = [_asset(row) for row in data], 'CoinMarketCap'
    except Exception:
        if provider:
            raise
        items, source = _gecko(page, sort, order), 'CoinGecko'
    return dict(items=items, source=source, page=page, hasMore=len(items) == PAGE_SIZE,
                checkedAt=datetime.now(timezone.utc).isoformat())


def crypto_market(page=1, sort='rank', order='desc', provider=''):
    if page < 1 or sort not in SORTS or order not in ('asc', 'desc') or provider not in ('', 'CoinGecko', 'CoinMarketCap'):
        raise ValueError('無效的資產分頁或排序')
    return _market(int(monotonic() // 300), page, sort, order, provider)


RESOURCES = {
    'global': ('/v1/global-metrics/quotes/latest', True, {}),
    'global-history': ('/v1/global-metrics/quotes/historical', False, {'count': 31, 'interval': 'daily'}),
    'fear': ('/v3/fear-and-greed/latest', True, {}),
    'fear-history': ('/v3/fear-and-greed/historical', True, {'limit': 30}),
    'altseason': ('/v1/altcoin-season-index/latest', True, {}),
    'altseason-history': ('/v1/altcoin-season-index/historical', True, {'timeframe': '30d'}),
    'cmc20': ('/v3/index/cmc20-latest', True, {}),
    'cmc100': ('/v3/index/cmc100-latest', True, {}),
    'cmc20-history': ('/v3/index/cmc20-historical', True, {'count': 30, 'interval': 'daily'}),
    'cmc100-history': ('/v3/index/cmc100-historical', True, {'count': 30, 'interval': 'daily'}),
    'categories': ('/v1/cryptocurrency/categories', True, {'limit': 100}),
    'category': ('/v1/cryptocurrency/category', True, {'limit': 100}),
    'asset': ('/v3/cryptocurrency/quotes/latest', True, {'convert': 'USD'}),
    'info': ('/v2/cryptocurrency/info', True, {}),
    'quote-history': ('/v3/cryptocurrency/quotes/historical', False, {'count': 30, 'interval': 'daily', 'convert': 'USD'}),
    'contracts': ('/v5/cryptocurrency/derivatives/market-pairs/list/latest', False, {'limit': 25}),
    'liquidations': ('/v5/derivatives/liquidations/quotes/latest', False, {}),
    'liquidation-coins': ('/v5/derivatives/liquidations/cryptocurrency/list/latest', False, {'limit': 20}),
    'liquidation-exchanges': ('/v5/derivatives/liquidations/exchange/list/latest', False, {'limit': 20}),
    'exchange-list': ('/v1/exchange/map', False, {'limit': 200}),
    'exchange-assets': ('/v1/exchange/assets', False, {}),
    'dex-token': ('/v1/dex/token', True, {}),
}


@lru_cache(maxsize=192)
def _resource(slot, name, asset_id, platform, address):
    path, public, defaults = RESOURCES[name]
    params = defaults.copy()
    if asset_id:
        params['crypto_id' if name == 'contracts' else 'id'] = asset_id
    if name == 'asset':
        params['symbol'] = address
    if name == 'dex-token':
        params.update(platform=platform, address=address)
    response = _cmc_request(path, params, public=public)
    if 'data' not in response:
        raise ValueError('資料來源未回傳內容')
    data = response['data']
    if name == 'asset':
        if isinstance(data, dict):
            candidates = data.get(address)
            if candidates is None:
                candidates = [row for row in data.values() if isinstance(row, dict)
                              and str(row.get('symbol')).upper() == address]
        else:
            candidates = data
        if isinstance(candidates, dict):
            candidates = [candidates]
        data = [_asset(item) for item in (candidates or [])]
    return dict(data=data, source='CoinMarketCap',
                checkedAt=response.get('status', {}).get('timestamp'))


def crypto_resource(name, asset_id='', platform='', address=''):
    if name not in RESOURCES:
        raise KeyError(name)
    if name in ('category', 'info', 'quote-history', 'contracts', 'exchange-assets'):
        pattern = r'[a-f0-9]{24}' if name == 'category' else r'[1-9][0-9]{0,11}'
        if not re.fullmatch(pattern, asset_id):
            raise ValueError('無效的資料識別碼')
    else:
        asset_id = ''
    if name == 'dex-token':
        if not re.fullmatch(r'[a-z0-9-]{2,25}', platform) or not re.fullmatch(r'[A-Za-z0-9]{20,72}', address):
            raise ValueError('請輸入有效的鏈別與合約地址')
    elif name == 'asset':
        platform = ''
        address = address.upper()
        if not re.fullmatch(r'[A-Z0-9$@-]{1,18}', address):
            raise ValueError('請輸入完整的幣種代號')
    else:
        platform, address = '', ''
    return _resource(int(monotonic() // 300), name, asset_id, platform, address)
