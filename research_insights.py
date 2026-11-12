"""QTemp research: data audit, confirmed-signal event study, calendar.

Keep this module read-only: never modifies qtemp_core indicator calculations.
"""
from datetime import datetime, timezone
import math
import numpy as np
import pandas as pd
from research_features import snapshot, symbols

SIGNALS = ("低估值", "高估值", "底背離", "頂背離")
DAYS_BEFORE = 20
DAYS_AFTER = 120
DAYS = list(range(-DAYS_BEFORE, DAYS_AFTER+1, 5))
MAX_EVENTS = 1500


def _float(value):
    return float(value) if np.isfinite(value) else None


def _market_sessions(first, last, zone):
    """Exact exchange sessions only when recognized; never label weekday holidays missing."""
    calendars = {"Asia/Taipei":"XTAI", "America/New_York":"XNYS"}
    calendar=calendars.get(zone)
    if not calendar:
        return None, "交易所日曆未支援，缺失交易日數無法可靠估計"
    try:
        import exchange_calendars
        xc=exchange_calendars.get_calendar(calendar)
        return xc.sessions_in_range(first, last).tz_localize(None), "交易所日曆 "+calendar
    except Exception:
        return None, "交易所日曆無法載入，缺失交易日數未估計"


def _audit(symbol, frame, values, events, zone, metadata=None):
    metadata=metadata or {}
    first,last=frame.index[0],frame.index[-1]
    sessions,cal_note=_market_sessions(first,last,zone)
    absent=[] if sessions is None else sorted(set(sessions.normalize())-set(frame.index.normalize()))
    adj_factor=frame["Adj Close"]/frame["Close"] if "Adj Close" in frame else None
    valid_adjustment=bool(
        adj_factor is not None and np.isfinite(adj_factor).all() and adj_factor.gt(0).all()
    )
    warmup=values["暫算"].fillna(True).astype(bool)
    valid=np.isfinite(values.QTemp.to_numpy(dtype=float)) & (~warmup.to_numpy())
    confirmed=events.loc[~events["暫算"].astype(bool)] if not events.empty else events
    confirmed=confirmed.drop_duplicates(["類型", "確認日"])
    first_valid=int(np.flatnonzero(valid)[0]) if np.any(valid) else None
    now=datetime.now(timezone.utc)
    return {
        "source":"Yahoo Finance / yfinance",
        "queriedAt": now.strftime("%Y-%m-%d %H:%M UTC"),
        "dataStatus":metadata.get("_qtemp_cache_status","未標記"),
        "cachedAt":metadata.get("_qtemp_cache_saved_at"),
        "cacheAgeSeconds":metadata.get("_qtemp_cache_age_seconds"),
        "symbol":symbol,
        "start":first.date().isoformat(),
        "end":last.date().isoformat(),
        "bars":int(len(frame)),
        "zone":zone,
        "calendarMethod":cal_note,
        "missingSessions": len(absent) if sessions is not None else None,
        "missingSample":[d.date().isoformat() for d in absent[:40]],
        "missingTruncated":len(absent)>40,
        "adjClose": "Adj Close 還原 OHLC" if valid_adjustment else "Adj Close 驗證失敗",
        "adjFactorMin":_float(adj_factor.min()) if adj_factor is not None else None,
        "adjFactorMax":_float(adj_factor.max()) if adj_factor is not None else None,
        "qtempSamples":int(np.count_nonzero(valid)),
        "warmupBars":int(warmup.sum()),
        "firstValid":frame.index[first_valid].date().isoformat() if first_valid is not None else None,
        "confirmedSignals":int(len(confirmed)),
        "signalRule":"收盤確認日計算訊號；背離樞紐須等待右側 K 棒確認；回測進場採確認後下一交易日開盤；排除暖機訊號，不使用未來資料。",
        "quoteNote":"以上為取得資料時的 UTC 時間，不是交易所即時行情時間；最近日 K 截至已確認收盤交易日。",
        "status":"警告：缺失交易日" if absent else "已驗證日 K 欄位與還原價格（不保證外部資料絕對正確）"
    }


def _event_study(frame, events):
    """All windows are aligned to confirmed date, no future bars peeked as entries."""
    prices=frame.Close.to_numpy(dtype=float)
    count=len(prices)
    by_kind={}
    confirmed=events.loc[~events["暫算"].astype(bool)].drop_duplicates(["類型","確認日"])
    for kind in SIGNALS:
        chosen=confirmed.loc[confirmed["類型"].eq(kind)]
        rows=[]
        for pos in chosen["確認位置"].to_numpy(dtype=int):
            if pos < DAYS_BEFORE or pos+DAYS_AFTER >= count:
                continue
            if prices[pos] <= 0 or not np.isfinite(prices[pos]):
                continue
            segment=prices[pos-DAYS_BEFORE:pos+DAYS_AFTER+1]
            if len(segment) != DAYS_BEFORE+DAYS_AFTER+1 or not np.isfinite(segment).all():
                continue
            rows.append((segment/prices[pos]-1.)*100.)
        matrix=np.asarray(rows,dtype=float)
        points=[]
        if len(rows):
            for day in DAYS:
                col=matrix[:,day+DAYS_BEFORE]
                points.append({
                  "day":day,"mean":_float(col.mean()),"median":_float(np.median(col)),
                  "p10":_float(np.percentile(col,10)),"p90":_float(np.percentile(col,90))
                })
        by_kind[kind]={
            "sample":len(rows),
            "excluded":int(len(chosen)-len(rows)),
            "points":points,
            "first":int(-DAYS_BEFORE),"last":int(DAYS_AFTER)
        }
    return {
      "groups":by_kind,
      "note":"確認日為第0天，所有價格以該日已確認還原收盤價標準化為0%；顯示訊號前20、後120個交易日，以5日取點。四條統計線為平均、中位數及第10/90百分位。僅包含完整前後視窗的訊號（右側未來數據不足者排除），不代表能在確認日收盤成交；事件重疊樣本不具獨立性。"
    }


def _calendar(events, frame):
    earliest=frame.index[-1]-pd.DateOffset(years=10)
    valid=(events.loc[(~events["暫算"].astype(bool)) & (events["確認日"]>=earliest)]
           .drop_duplicates(["類型","確認日"]).sort_values("確認日"))
    result=[]
    for day, group in valid.groupby("確認日"):
        result.append({
            "day":pd.Timestamp(day).strftime("%Y-%m-%d"),
            "signals":[label for label in SIGNALS if label in group["類型"].to_numpy()]
        })
    return result


def site_research(requested):
    symbol=symbols(requested,1)[0]
    actual, frame, values, events=snapshot(symbol,int(datetime.now(timezone.utc).timestamp()//900))
    # Raw market history, needed only to compute adjustment factors and session gaps.
    from qtemp_core import load_market
    _, raw, meta, zone=load_market(actual)
    return {
      "symbol":actual,
      "quality":_audit(actual,raw,values,events,zone,meta),
      "eventStudy":_event_study(frame,events),
      "calendar":_calendar(events,frame)
    }
