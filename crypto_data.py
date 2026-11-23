"""CoinMarketCap market overview with explicit source and provider fallback."""
from datetime import datetime, timezone
from functools import lru_cache
from time import monotonic
import os
from market_rankings import _json
from financial_market import _clean


def _cmc():
    key = os.environ.get('COINMARKETCAP_API_KEY')
    if not key:
        raise ValueError('CoinMarketCap 未設定')
    header = {'X-CMC_PRO_API_KEY': key}
    response = _json('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=100&sort=market_cap&convert=USD', header)
    rows = response.get('data', [])
    if not rows:
        raise ValueError('CoinMarketCap 沒有回傳排行')
    items = []
    for row in rows:
        q = row.get('quote', {}).get('USD', {})
        items.append(dict(rank=row.get('cmc_rank'), symbol=row.get('symbol'), name=row.get('name'),
                          price=_clean(q.get('price')), marketCap=_clean(q.get('market_cap')),
                          volume=_clean(q.get('volume_24h')), change1h=_clean(q.get('percent_change_1h')),
                          change24h=_clean(q.get('percent_change_24h')), change7d=_clean(q.get('percent_change_7d')),
                          change30d=_clean(q.get('percent_change_30d')), circulating=_clean(row.get('circulating_supply')),
                          totalSupply=_clean(row.get('total_supply')), maxSupply=_clean(row.get('max_supply')),
                          fullyDiluted=_clean(q.get('fully_diluted_market_cap')), dominance=_clean(q.get('market_cap_dominance')),
                          volumeChange=_clean(q.get('volume_change_24h')), lastUpdated=q.get('last_updated'),
                          tags=row.get('tags') or [], providerId=row.get('id')))
    return items


def _gecko():
    rows = _json('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C30d')
    if not isinstance(rows, list) or not rows:
        raise ValueError('CoinGecko 無可用資料')
    return [dict(rank=r.get('market_cap_rank'), symbol=(r.get('symbol') or '').upper(), name=r.get('name'),
                 price=_clean(r.get('current_price')), marketCap=_clean(r.get('market_cap')),
                 volume=_clean(r.get('total_volume')), change1h=_clean(r.get('price_change_percentage_1h_in_currency')),
                 change24h=_clean(r.get('price_change_percentage_24h_in_currency')),
                 change7d=_clean(r.get('price_change_percentage_7d_in_currency')),
                 change30d=_clean(r.get('price_change_percentage_30d_in_currency')),
                 circulating=_clean(r.get('circulating_supply')), totalSupply=_clean(r.get('total_supply')),
                 maxSupply=_clean(r.get('max_supply')), fullyDiluted=_clean(r.get('fully_diluted_valuation')),
                 lastUpdated=r.get('last_updated'), providerId=r.get('id')) for r in rows]


@lru_cache(maxsize=2)
def _market(slot):
    try:
        items, source = _cmc(), 'CoinMarketCap'
    except Exception:
        items, source = _gecko(), 'CoinGecko'
    return dict(items=items, source=source, checkedAt=datetime.now(timezone.utc).isoformat(),
                note='依市值排序；不同供應商的供給量、估值與更新頻率可能不同。')


def crypto_market():
    return _market(int(monotonic() // 300))
