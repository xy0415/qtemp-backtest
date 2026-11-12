"""Additional QTemp research endpoints. Preserve qtemp_core's calculation unchanged."""
import math
import re
from functools import lru_cache
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from qtemp_core import load_market, apply_price_basis, qtemp, SIGNALS


def symbols(text, limit=5):
    raw = [t.strip().upper() for t in re.split(r"[,，;；\s]+", text) if t.strip()]
    unique = list(dict.fromkeys(raw))
    if not unique or len(unique) > limit:
        raise ValueError(f"請輸入 1 至 {limit} 檔股票代號，使用逗號分隔。")
    if any(not re.fullmatch(r"[A-Z0-9.^=_-]{1,30}", t) for t in unique):
        raise ValueError("股票代號格式不正確。")
    return unique


@lru_cache(maxsize=60)
def snapshot(symbol, slot):
    actual, raw, meta, zone = load_market(symbol)
    adj = apply_price_basis(raw)
    v, events = qtemp(adj, tick=10**(-int(meta.get("priceHint") or 2)))
    return actual, adj, v, events


def scan(text):
    items = []
    for sym in symbols(text, 6):
        try:
            actual, frame, v, events = snapshot(sym, int(datetime.now(timezone.utc).timestamp() // 900))
            end = frame.index[-1]
            cutoff = end - pd.DateOffset(days=90)
            past = events.loc[events["確認日"] >= cutoff].drop_duplicates(["類型", "確認日"])
            last = past.iloc[-1] if not past.empty else None
            items.append({
                "symbol": actual, "end": end.date().isoformat(), "score": round(float(v.QTemp.iloc[-1]), 3),
                "last": round(float(frame.Close.iloc[-1]), 4), "highDrawdown": round(float(frame.Close.iloc[-1]/frame.Close.iloc[-252:].max()-1), 5),
                "signal": str(last["類型"]) if last is not None else "—",
                "signalDate": last["確認日"].date().isoformat() if last is not None else None,
                "recentSignals": int(len(past)), "error": None
            })
        except Exception as exc:
            items.append({"symbol": sym, "error": str(exc)[:200]})
    return {"items": items, "basis": "已確認日K、Adj Close還原；最新訊號採90天內同類同日去重；最多6檔。"}


def compare(text):
    cols = []
    returns = []
    errors = []
    for sym in symbols(text, 4):
        try:
            actual, frame, v, events = snapshot(sym, int(datetime.now(timezone.utc).timestamp() // 900))
            pair = pd.DataFrame({"close":frame.Close, "qtemp":v.QTemp}).dropna()
            pair = pair.loc[pair.index >= pair.index[-1]-pd.DateOffset(years=5)]
            cols.append((actual,pair))
        except Exception as exc:
            errors.append(sym + "：" + str(exc)[:140])
    if not cols: raise ValueError("所有標的皆無可用資料："+"；".join(errors))
    shared = cols[0][1].index
    for _,f in cols[1:]: shared = shared.intersection(f.index)
    if len(shared)<30: raise ValueError("共同交易日期不足30天，無法比較。")
    shared=shared[-1250:]
    for sym, frame in cols:
        close=frame.reindex(shared).close
        growth=close/close.iloc[0]-1
        dd=close/close.cummax()-1
        daily=close.pct_change().dropna()
        annual=float((close.iloc[-1]/close.iloc[0])**(252/(len(close)-1))-1) if close.iloc[0]>0 else None
        returns.append({"symbol":sym,"totalReturn":float(growth.iloc[-1]),
           "cagr":annual,"maxDrawdown":float(dd.min()),
           "volatility":float(daily.std()*np.sqrt(252)) if len(daily)>1 else None,
           "qtemp":float(frame.reindex(shared).qtemp.iloc[-1]),
           "points":[[x.strftime("%Y-%m-%d"),round(float(y*100),3)] for x,y in zip(shared,growth)][::max(1,len(shared)//300)]})
    return {"assets":returns,"start":shared[0].strftime("%Y-%m-%d"),"end":shared[-1].strftime("%Y-%m-%d"),"errors":errors,
        "note":"比較採共同交易日期、股利還原價，年化以252交易日近似；未計交易成本。"}


def strategy(symbol, entry="-85", exit_at="35", fee="0.1", max_hold="120"):
    entry, exit_at, fee, max_hold = float(entry),float(exit_at),float(fee),int(max_hold)
    if not (-100<=entry<=0 and 0<=exit_at<=100 and 0<=fee<=2 and 5<=max_hold<=504):
        raise ValueError("參數超出範圍。進場 -100~0，出場 0~100，費率0~2%，最長持有5~504交易日。")
    actual, frame, values, _ = snapshot(symbols(symbol,1)[0], int(datetime.now(timezone.utc).timestamp()//900))
    start=max(0,len(frame)-2520)
    frame=frame.iloc[start:]
    values=values.iloc[start:]
    dates=frame.index
    opens=frame.Open.to_numpy(dtype=float)
    closes=frame.Close.to_numpy(dtype=float)
    scores=values.QTemp.to_numpy(dtype=float)
    fee=fee/100
    cash=1.0
    shares=0.0
    buy_idx=None
    buy_price=None
    trades=[]
    curve=[]
    # Signals formed at close i-1 can only trade at open i.
    for i in range(len(frame)):
        prior=scores[i-1] if i>0 else np.nan
        if shares>0 and (np.isfinite(prior) and prior>=exit_at or (buy_idx is not None and i-buy_idx>=max_hold)):
            cash=shares*opens[i]*(1-fee)
            shares=0.0
            trades.append({"entry":dates[buy_idx].strftime("%Y-%m-%d"),"exit":dates[i].strftime("%Y-%m-%d"),
              "return":float(cash/buy_price-1)})
            buy_idx=None
        elif shares==0 and i>0 and np.isfinite(prior) and prior<=entry:
            buy_idx=i
            buy_price=cash
            shares=cash*(1-fee)/opens[i]
            cash=0.0
        curve.append(float(cash+shares*closes[i]))
    if not curve: raise ValueError("可用歷史不足")
    values_curve=np.array(curve)
    peak=np.maximum.accumulate(values_curve)
    drawdown=float(np.min(values_curve/peak-1))
    length=len(values_curve)
    ret=float(values_curve[-1]-1)
    years=max(1,(dates[-1]-dates[0]).days)/365.25
    daily=pd.Series(values_curve).pct_change().replace([np.inf,-np.inf],np.nan).dropna()
    risk=float(np.sqrt(252)*daily.mean()/daily.std()) if len(daily)>2 and daily.std()>0 else None
    return {"symbol":actual,"start":dates[0].strftime("%Y-%m-%d"),"end":dates[-1].strftime("%Y-%m-%d"),
        "trades":trades[-100:],"tradeCount":len(trades),"totalReturn":ret,
        "cagr":float(values_curve[-1]**(1/years)-1),"maxDrawdown":drawdown,"sharpeZeroRf":risk,
        "openPosition":bool(shares>0),"wins":float(sum(t["return"]>0 for t in trades)/len(trades)) if trades else None,
        "curve":[[dates[i].strftime("%Y-%m-%d"),round(float(values_curve[i]),6)] for i in range(0,length,max(1,length//320))],
        "note":"示意型多頭單倉策略，收盤訊號於下一交易日開盤成交；QTemp低於進場門檻時進場，高於出場門檻或達最長持有日數時出場。每次進出均計費率，未計滑價、稅與融資；未平倉按最後還原收盤市值計。夏普以零無風險利率估算，年化252交易日；沒有反向放空。"}
