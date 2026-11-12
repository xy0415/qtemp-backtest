"""Safe local historical market cache for Render's ephemeral filesystem.

Cache is scoped to Yahoo data already fetched/validated by qtemp_core.
No pickle, no third-party unverified price source, no implied realtime prices.
"""
import hashlib
import json
import os
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
import numpy as np

ROOT=Path(os.environ.get("QTEMP_CACHE_DIR","/tmp/qtemp_verified_prices"))
FRESH_SECONDS=15*60
BACKUP_SECONDS=7*86400

def _path(symbol):
    filename=hashlib.sha256(symbol.upper().encode("utf-8")).hexdigest()[:32]+".json"
    return ROOT/filename

def _read(symbol):
    path=_path(symbol)
    try:
        obj=json.loads(path.read_text(encoding="utf-8"))
        if obj.get("symbol")!=symbol:
            return None
        saved=datetime.fromisoformat(obj["savedAt"])
        age=(datetime.now(timezone.utc)-saved).total_seconds()
        if age<0 or age>BACKUP_SECONDS:
            return None
        frame=pd.DataFrame(obj["rows"],columns=obj["columns"])
        frame.index=pd.to_datetime(obj["dates"])
        frame.index.name="交易日"
        for col in frame.columns:
            frame[col]=pd.to_numeric(frame[col],errors="coerce")
        needed=["Open","High","Low","Close","Adj Close","Volume"]
        if not all(col in frame for col in needed) or len(frame)<20:
            return None
        ohlc=frame[["Open","High","Low","Close"]]
        if (not np.isfinite(ohlc.to_numpy()).all()
            or not ohlc.gt(0).all().all()
            or not np.isfinite(frame["Adj Close"]).all()
            or not frame["Adj Close"].gt(0).all()
            or not frame["High"].ge(ohlc[["Open","Low","Close"]].max(axis=1)).all()
            or not frame["Low"].le(ohlc[["Open","High","Close"]].min(axis=1)).all()
            or not frame.index.is_monotonic_increasing
            or frame.index.has_duplicates):
            return None
        meta=obj.get("meta",{})
        zone=obj.get("zone","")
        if not isinstance(meta,dict) or not zone:
            return None
        return frame,meta,zone,age,obj["savedAt"]
    except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError):
        return None

def load_verified(symbol, backup=False):
    cached=_read(symbol)
    if not cached:
        return None
    frame,meta,zone,age,saved=cached
    if not backup and age>FRESH_SECONDS:
        return None
    meta=dict(meta)
    meta["_qtemp_cache_status"]="stale_backup" if backup else "verified_cache"
    meta["_qtemp_cache_saved_at"]=saved
    meta["_qtemp_cache_age_seconds"]=round(age)
    return frame.copy(),meta,zone

def save_verified(symbol,frame,metadata,zone):
    # Atomic writes and only a closed/validated dataset accepted by caller.
    if not frame.index.is_monotonic_increasing or frame.index.has_duplicates:
        return
    allowed_meta={}
    for key in ["priceHint","currency","exchangeTimezoneName","exchangeName","fullExchangeName"]:
        val=metadata.get(key)
        if isinstance(val,np.integer):
            val=int(val)
        elif isinstance(val,np.floating):
            val=float(val)
        if isinstance(val,(str,int,float,bool)) and not (isinstance(val,float) and not np.isfinite(val)):
            allowed_meta[key]=val
    data={
        "version":1,"source":"Yahoo Finance validated daily OHLC Adj Close",
        "symbol":symbol,"savedAt":datetime.now(timezone.utc).isoformat(),
        "zone":zone,"meta":allowed_meta,
        "dates":[day.strftime("%Y-%m-%d") for day in frame.index],
        "columns":frame.columns.tolist(),
        "rows":frame.astype(object).where(pd.notna(frame),None).values.tolist()
    }
    try:
        ROOT.mkdir(parents=True,exist_ok=True)
        path=_path(symbol)
        tmp=path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data,ensure_ascii=False,allow_nan=False),encoding="utf-8")
        os.replace(tmp,path)
    except (OSError,TypeError,ValueError):
        # Failure of a cache write must never break successful market retrieval.
        return
