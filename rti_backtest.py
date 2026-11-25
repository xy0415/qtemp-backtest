"""RTI backtests using completed daily bars and explicit execution assumptions."""
from datetime import date, datetime, timezone
from time import monotonic

import pandas as pd
from rti import calculate, rti_snapshot


def _day(value):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError) as error:
        raise ValueError('日期格式必須為 YYYY-MM-DD') from error


def _run(rows, initial, allocation, fee, slippage, delay):
    cash, shares = initial, 0.0
    base_shares = initial / (rows[0]['open'] * (1 + slippage) * (1 + fee))
    transactions, curve = [], []
    peak, max_drawdown = initial, 0.0
    for index, row in enumerate(rows):
        opening = row['open']
        signal = rows[index-delay] if index >= delay else None
        action = signal['entry'] if signal and signal['stage'] == 'formal' else None
        if action == 'buy' and cash > 1e-8:
            price = opening * (1 + slippage)
            spent = cash * allocation
            amount = spent / (price * (1 + fee))
            shares += amount
            cash -= spent
        elif action == 'sell' and shares > 1e-12:
            price = opening * (1 - slippage)
            amount = shares * allocation
            shares -= amount
            cash += amount * price * (1 - fee)
        else:
            action = None
        if action:
            transactions.append(dict(day=row['day'], signalDay=signal['day'], action=action,
                                     price=price, open=opening, fee=price*amount*fee, shares=amount,
                                     cash=cash, holdings=shares, equity=cash+shares*opening))
        equity = cash + shares * row['close']
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1)
        curve.append(dict(day=row['day'], value=equity, benchmark=base_shares * row['close']))
    value = curve[-1]['value']
    years = max((date.fromisoformat(rows[-1]['day'])-date.fromisoformat(rows[0]['day'])).days, 1)/365.25
    return dict(start=rows[0]['day'], end=rows[-1]['day'], value=value, cash=cash, shares=shares,
                totalReturn=value/initial-1, annualizedReturn=(value/initial)**(1/years)-1,
                maxDrawdown=max_drawdown, benchmarkReturn=curve[-1]['benchmark']/initial-1,
                trades=len(transactions), transactions=transactions[::-1], curve=curve)


def _audit(data, start, end):
    rows = data['rows']
    eligible = [i for i, r in enumerate(rows) if start <= r['day'] <= end and r['stage'] == 'formal']
    if not eligible:
        return []
    fields = ('open', 'high', 'low', 'close', 'volume')
    frame = pd.DataFrame([{field.title(): row[field] for field in fields} for row in rows],
                         index=pd.DatetimeIndex([r['day'] for r in rows]))
    results = []
    for i in sorted({eligible[len(eligible)//4], eligible[len(eligible)//2], eligible[-1]}):
        expected = rows[i]
        options = (data['rankLength'], data['minimum'])
        prefix = frame.iloc[:i+1]
        replay = calculate(prefix, *options)[0][-1]
        warm = calculate(prefix.tail(max(365, data['rankLength']*2)), *options)[0][-1]
        original = expected['score']
        results.append(dict(day=expected['day'], original=original, replay=replay['score'],
                            matches=all(expected[k] == replay[k] for k in ('score','stage','entry')),
                            shorter=warm['score'] if warm['stage']=='formal' else None,
                            warmupBars=min(len(prefix), max(365, data['rankLength']*2))))
    return results


def backtest(symbol, start, end, initial, allocation, fee, slippage=0, delay=1, split=None, audit=False):
    if not (0 < initial <= 1e10 and 0 < allocation <= 100 and 0 <= fee <= 5 and 0 <= slippage <= 5 and 1 <= delay <= 10):
        raise ValueError('請確認本金、投入比例、交易成本、滑價與延遲')
    start, end = _day(start), _day(end)
    if start >= end:
        raise ValueError('結束日期必須晚於開始日期')
    data = rti_snapshot(symbol, 0, 0, False, int(monotonic() // 180))
    rows = [r for r in data['rows'] if start <= r['day'] <= end]
    if len(rows) < 30:
        raise ValueError('所選區間不足 30 根有效日線')
    settings = (initial, allocation/100, fee/100, slippage/100, delay)
    result = _run(rows, *settings)
    segments = []
    if split:
        split = _day(split)
        before, after = [r for r in rows if r['day'] < split], [r for r in rows if r['day'] >= split]
        if min(len(before),len(after)) < 15:
            raise ValueError('切分日前後各需至少 15 根有效日線')
        for name, segment in (('前段',before),('後段',after)):
            stats = _run(segment,*settings)
            segments.append(dict(name=name, **{k:stats[k] for k in ('start','end','totalReturn','maxDrawdown','benchmarkReturn','trades')}))
    curve = result['curve']
    step = max(1, len(curve)//500)
    result['curve'] = curve[::step] + ([curve[-1]] if (len(curve)-1) % step else [])
    return dict(result, symbol=data['symbol'], initial=initial, source=data['priceBasis'],
                stale=data['stale'], segments=segments, audit=_audit(data,start,end) if audit else None,
                note=f'正式訊號於收盤確認後第 {delay} 根開盤成交。買入上調、賣出下調 {slippage:g}% 滑價，每次成交扣除 {fee:g}% 成本。基準以首日開盤買入並持有，買入同樣計入滑價與成本。資產以每日收盤價估值。')
