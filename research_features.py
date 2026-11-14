"""Additional QTemp research endpoints. Preserve qtemp_core's calculation unchanged."""
import re
from functools import lru_cache
from datetime import datetime, timezone
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

