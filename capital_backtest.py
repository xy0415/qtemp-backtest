"""Long-horizon buy-and-hold capital contribution study for QTemp.

Three distinct, non-rebalanced strategies: signal, periodic DCA, lump sum.
All contributions are external cash flows, not investment profits.
"""
from bisect import bisect_left
from datetime import datetime, timezone
import math

import numpy as np
import pandas as pd

from research_features import snapshot, symbols


def _money(value, name, allow_zero=True):
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name}必須是數字")
    if not math.isfinite(n) or n < 0 or n > 1e10 or (not allow_zero and n == 0):
        raise ValueError(f"{name}必須介於{'大於 0 且不超過' if not allow_zero else '0 至'} 100 億之間")
    return n


def _xirr(flows, terminal_date, terminal_value):
    """Actual-date money weighted annual return, with robust bracket search."""
    cashflows = [(pd.Timestamp(date), -float(amount)) for date, amount in flows if amount > 0]
    cashflows.append((pd.Timestamp(terminal_date), float(terminal_value)))
    if not cashflows or len(cashflows) < 2 or sum(-x[1] for x in cashflows[:-1]) <= 0:
        return None
    first = cashflows[0][0]
    days = np.array([(date-first).days/365.25 for date, _ in cashflows], dtype=float)
    amounts = np.array([amount for _, amount in cashflows], dtype=float)
    def npv(rate):
        return float(np.sum(amounts / np.power(1.0 + rate, days)))
    lo, hi = -.9999, 1.0
    if npv(lo) < 0:  # unlikely with terminal positive, but protect bracket
        return None
    for _ in range(24):
        if npv(hi) <= 0:
            break
        hi = 2 * hi + 1
        if hi > 1e7:
            return None
    if npv(hi) > 0:
        return None
    for _ in range(90):
        mid=(lo+hi)/2
        if npv(mid)>0:
            lo=mid
        else:
            hi=mid
    return float((lo+hi)/2)


def _schedule(start, end, mode, timing):
    """One whole installment in each calendar period, including partial final period."""
    if mode == "weekly":
        step=lambda i: start+pd.Timedelta(weeks=i)
    elif mode == "monthly":
        step=lambda i: start+pd.DateOffset(months=i)
    elif mode == "quarterly":
        step=lambda i: start+pd.DateOffset(months=3*i)
    elif mode == "semiannual":
        step=lambda i: start+pd.DateOffset(months=6*i)
    elif mode == "annual":
        step=lambda i: start+pd.DateOffset(years=i)
    else:
        raise ValueError("不支援的投資頻率")
    dates=[]
    for k in range(3000):
        period_start=step(k)
        if period_start>end:
            break
        period_last=step(k+1)-pd.Timedelta(days=1)
        due=period_start if timing=="begin" else min(period_last,end)
        dates.append(due)
    return sorted(set(dates))


def capital_comparison(symbol, start, end, initial, periodic_amount, frequency,
                       signal_amount, timing="end", lump_mode="match_dca"):
    symbol = symbols(str(symbol), 1)[0]
    try:
        requested_start = pd.Timestamp(start).normalize()
        requested_end = pd.Timestamp(end).normalize()
        if requested_start.tzinfo is not None or requested_end.tzinfo is not None:
            raise ValueError()
    except Exception:
        raise ValueError("開始與結束日期必須為 YYYY-MM-DD")
    if requested_end <= requested_start:
        raise ValueError("結束日期必須晚於開始日期")
    if requested_end > pd.Timestamp.now(tz="Asia/Taipei").tz_localize(None).normalize():
        raise ValueError("結束日期不可超過今天")
    if requested_end.year-requested_start.year > 45:
        raise ValueError("回測期間最多45年")
    if lump_mode not in ("match_dca", "initial_only"):
        raise ValueError("單筆投入模式設定不正確")
    if timing not in ("begin","end"):
        raise ValueError("投資時點應為期初或期末")
    ia = _money(initial, "期初金額")
    per_period = _money(periodic_amount, "每期定額金額")
    signal_cash = _money(signal_amount, "每次訊號投入金額")
    if ia <= 0 and per_period <= 0 and signal_cash <= 0:
        raise ValueError("至少要有一種投入資金")

    actual, full, values, events = snapshot(symbol, int(datetime.now(timezone.utc).timestamp() // 900))
    frame = full[(full.index >= requested_start) & (full.index <= requested_end)].copy()
    if len(frame) < 60:
        raise ValueError("所選期間有效交易日不足60日，或超過該標的可取得的歷史範圍")

    available_start=frame.index[0]
    available_end=frame.index[-1]
    # Do not silently treat data from a much later listing year as if the requested
    # portfolio had existed since the entered start date.
    if (available_start - requested_start).days > 14:
        raise ValueError("此標的資料從 "+available_start.date().isoformat()+" 開始，請調整回測開始日期")

    dates = frame.index
    opens=frame.Open.to_numpy(dtype=float)
    closes=frame.Close.to_numpy(dtype=float)
    if not (np.isfinite(opens).all() and np.isfinite(closes).all() and (opens>0).all() and (closes>0).all()):
        raise ValueError("調整後價格缺少有效開收盤資訊")

    # Build deposit schedule without look-ahead; calendar due dates roll to
    # the first available trading session on or after the due date.
    schedule = _schedule(requested_start, available_end, str(frequency), str(timing))
    periodic = {}
    for due in schedule:
        # 期初於該期首個可交易日開盤買進；期末於最後交易日收盤買進。
        if timing == "begin":
            ix=dates.searchsorted(due)
        else:
            ix=dates.searchsorted(due, side="right")-1
        if 0 <= ix < len(dates):
            periodic[ix]=periodic.get(ix, 0.) + per_period

    signal_deposits={}
    signal_confirmed={}
    selected=events.loc[
        events["類型"].eq("低估值") &
        (~events["暫算"].astype(bool))
    ].drop_duplicates(["類型","確認日"])
    # Use global confirmed-bar position and following session open.
    for position in selected["確認位置"].to_numpy(dtype=int):
        entry=position+1
        if entry>=len(full):
            continue
        target=full.index[entry]
        if target < available_start or target > available_end:
            continue
        ix=dates.searchsorted(target)
        if ix<len(dates) and dates[ix]==target:
            signal_deposits[ix]=signal_deposits.get(ix,0.)+signal_cash
            signal_confirmed[ix]=full.index[position].strftime("%Y-%m-%d")

    initial_deposits={0:ia} if ia else {}
    lump_budget=ia + sum(periodic.values()) if lump_mode == "match_dca" else ia
    lump_deposits={0:lump_budget} if lump_budget else {}
    strategies=[
        ("QTemp 低估值", {**initial_deposits}, "qtemp"),
        ("定期定額", {**initial_deposits}, "dca"),
        ("單筆投入", {**lump_deposits}, "lump")
    ]
    merged=[]
    for label, base, kind in strategies:
        deposits=dict(base)
        source=signal_deposits if kind=="qtemp" else periodic if kind=="dca" else {}
        for k, cash in source.items():
            deposits[k]=deposits.get(k,0.)+cash
        shares=0.
        invested=0.
        invested_curve=[]
        wealth=[]
        profit_ratio=[]
        nav_index=[]
        flows=[]
        max_drawdown=0.
        nav=1.
        peak=1.
        daily=[]
        purchase_count=0
        trades=[]
        cost_basis=0.
        for i,(date,op,cl) in enumerate(zip(dates,opens,closes)):
            deposit=deposits.get(i,0.)
            prior=wealth[-1] if wealth else 0.
            if deposit>0:
                invested+=deposit
                flows.append((date,deposit))
                initial_purchase=base.get(i,0.)
                extra_purchase=source.get(i,0.)
                purchases=[]
                if initial_purchase>0:
                    purchases.append(("期初投入", None, initial_purchase, op))
                if extra_purchase>0:
                    execution_price=cl if kind=="dca" and timing=="end" else op
                    purchases.append((
                        "低估值" if kind=="qtemp" else "定期定額",
                        signal_confirmed.get(i) if kind=="qtemp" else None,
                        extra_purchase, execution_price
                    ))
                for label_buy, confirm_day, amount, execution_price in purchases:
                    added=amount/execution_price
                    shares+=added
                    cost_basis+=amount
                    purchase_count+=1
                    trades.append({
                        "type":label_buy,
                        "confirmation":confirm_day,
                        "entry":date.strftime("%Y-%m-%d"),
                        "price":float(execution_price),
                        "amount":float(amount),
                        "addedShares":float(added),
                        "shares":float(shares),
                        "costBasis":float(cost_basis),
                        "avgCost":float(cost_basis/shares),
                        "purchaseDayValue":float(shares*cl)
                    })
            end_value=shares*cl
            wealth.append(float(end_value))
            invested_curve.append(float(invested))
            profit_ratio.append(float(end_value/invested-1) if invested>0 else None)
            # Exclude additions from the return; deposits occur at the day's open.
            adjusted_base=prior+deposit
            period_return=(end_value-adjusted_base)/adjusted_base if adjusted_base>0 else 0.
            if i>0:
                daily.append(float(period_return))
                nav*=1.+period_return
                peak=max(peak,nav)
                max_drawdown=min(max_drawdown,nav/peak-1)
            nav_index.append(float(nav))
        final=wealth[-1]
        for trade in trades:
            trade["lotEndValue"]=float(trade["addedShares"]*closes[-1])
            trade["positionEndValue"]=float(final)
        profit=final-invested
        datespan=max(1,(dates[-1]-dates[0]).days)/365.25
        std=float(np.std(daily,ddof=1)) if len(daily)>=2 else 0.
        annual_vol=std*math.sqrt(252) if std>0 else None
        sharpe=(float(np.mean(daily))*math.sqrt(252)/std) if std>0 else None
        irr=_xirr(flows, dates[-1], final)
        if kind=="lump":
            cagr=(float((final/invested)**(1/datespan)-1)
                  if invested>0 and final>0 else None)
        else:
            cagr=None
        step=max(1,len(dates)//550)
        points=[[dates[i].strftime("%Y-%m-%d"),round(wealth[i],4),
                 round(invested_curve[i],4),
                 None if profit_ratio[i] is None else round(profit_ratio[i],7)]
                for i in sorted(set(list(range(0,len(dates),step))+[len(dates)-1]))]
        merged.append({
            "id":kind,"name":label,
            "invested":float(invested),"wealth":float(final),"profit":float(profit),
            "return":float(profit/invested) if invested else None,
            "xirr":irr,"cagr":cagr,"maxDrawdown":float(max_drawdown),
            "volatility":annual_vol,"sharpeZeroRf":sharpe,
            "purchaseCount":purchase_count,"extraCount":max(0,purchase_count-(1 if ia else 0)),
            "points":points,
            "trades":trades[:2500],
            "tradesTruncated":len(trades)>2500
        })
    return {
        "symbol":actual,"requestedStart":requested_start.date().isoformat(),
        "requestedEnd":requested_end.date().isoformat(),
        "start":dates[0].strftime("%Y-%m-%d"),"end":dates[-1].strftime("%Y-%m-%d"),
        "days":len(dates),"frequency":frequency,"timing":timing,
        "periodicAmount":per_period,"signalAmount":signal_cash,
        "initialAmount":ia,"lumpMode":lump_mode,"lumpBudget":lump_budget,"strategies":merged,
        "note":"期初投入金額 IA 在三策略皆於首個交易日開盤買入；QTemp 策略僅於已確認「低估值」訊號的下一個交易日開盤追加指定金額，從不賣出；定投依設定頻率每期投入指定金額，含首尾不足一期的完整單期金額；期初於首個交易日開盤買進，期末於該期最後交易日收盤買進；單筆策略預設於期初一次投入與定期定額整段期間相同的計畫總本金（屬期初已知未來定投計畫的假設），也可改為僅投入 IA；後續不追加資金。所有策略按 Yahoo Adj Close 比例還原 OHLC，允許小數股。總報酬率=期末資產/累積投入−1；年化 XIRR 依實際資金流日期；最大回撤與年化波動使用排除新增入金的日報酬近似值。不同策略投入本金不同，資產總額不宜直接視為績效高低；不計交易手續費、稅、滑價、無風險利率及交易限制。"
    }
