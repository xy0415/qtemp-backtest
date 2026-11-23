"""Historical RTI signal study using completed daily bars and next-open entries."""
from datetime import datetime, timezone
import math

from rti import rti_snapshot


def backtest(symbol, start, end, initial, allocation, fee):
    if not (math.isfinite(initial) and 0 < initial <= 1e10 and math.isfinite(allocation) and 0 < allocation <= 100 and math.isfinite(fee) and 0 <= fee <= 5):
        raise ValueError('請確認本金、投入比例與交易成本')
    try:
        start = datetime.strptime(start, '%Y-%m-%d').date().isoformat()
        end = datetime.strptime(end, '%Y-%m-%d').date().isoformat()
    except ValueError:
        raise ValueError('日期格式必須為 YYYY-MM-DD')
    if start >= end:
        raise ValueError('結束日期必須晚於開始日期')
    data = rti_snapshot(symbol, 0, 0, False, int(datetime.now(timezone.utc).timestamp() // 180))
    rows = [r for r in data['rows'] if start <= r['day'] <= end]
    if len(rows) < 30:
        raise ValueError('所選區間不足 30 根有效日線')
    rate = fee / 100
    cash, shares = initial, 0.0
    base_shares = initial / (rows[0]['open'] * (1 + rate))
    transactions, curve = [], []
    peak, max_drawdown = initial, 0.0
    for r in rows:
        opening = r['open']
        action = r['entry'] if r['stage'] == 'formal' else None
        if action == 'buy' and cash > 1e-8:
            spent = cash * allocation / 100
            amount = spent / (opening * (1 + rate))
            shares += amount
            cash -= spent
        elif action == 'sell' and shares > 1e-12:
            amount = shares * allocation / 100
            shares -= amount
            cash += amount * opening * (1 - rate)
        else:
            action = None
        if action:
            transactions.append(dict(day=r['day'], action=action, price=opening, shares=amount, cash=cash, holdings=shares, equity=cash + shares * opening))
        equity = cash + shares * r['close']
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1)
        curve.append(dict(day=r['day'], value=equity, benchmark=base_shares * r['close']))
    years = max((datetime.fromisoformat(rows[-1]['day']) - datetime.fromisoformat(rows[0]['day'])).days / 365.25, 1 / 365.25)
    value = curve[-1]['value']
    bench = curve[-1]['benchmark']
    return dict(symbol=data['symbol'], start=rows[0]['day'], end=rows[-1]['day'], initial=initial,
                value=value, cash=cash, shares=shares, totalReturn=value / initial - 1,
                annualizedReturn=(value / initial) ** (1 / years) - 1, maxDrawdown=max_drawdown,
                benchmarkReturn=bench / initial - 1, transactions=list(reversed(transactions)), curve=curve[::max(1,len(curve)//500)] + ([curve[-1]] if (len(curve)-1) % max(1,len(curve)//500) else []),
                source=data['priceBasis'], stale=data['stale'],
                note='僅採正式分位的進場訊號；依原指標超冷／超熱條件消失後的下一根日線開盤執行。每次買入使用可用現金的指定比例，賣出使用持股的指定比例；交易成本於每次成交扣除。基準為首日開盤買入並持有。股票使用還原價格，可買零股；未計稅、滑價與流動性。')
