"""Multi-market dashboard using observed Yahoo Finance daily data, and verified official RSS.

No artificial fallbacks, no assumed real-time prices, and no silent synthetic observations.
The public site must confirm appropriate market-data display/republication rights before scale-up.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, time as walltime, timedelta
from zoneinfo import ZoneInfo
from email.utils import parsedate_to_datetime
from functools import lru_cache
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
import math
import threading
import time
import pandas as pd
import yfinance as yf

INDEXES=[
 ("^GSPC","S&P 500","US","美股"),
 ("^IXIC","NASDAQ Composite","US","美股"),
 ("^DJI","Dow Jones","US","美股"),
 ("^SOX","費城半導體 SOX","US","半導體"),
 ("^TWII","台灣加權指數","TW","台股"),
 ("^N225","日經 225","JP","全球"),
 ("^VIX","VIX 波動率","US","風險"),
 ("^TNX","美國 10Y 殖利率","US","利率"),
 ("GC=F","黃金期貨","US","商品"),
 ("CL=F","WTI 原油期貨","US","商品"),
 ("DX-Y.NYB","美元指數 DXY","US","外匯"),
 ("TWD=X","USD/TWD","TW","外匯"),
 ("BTC-USD","Bitcoin","Crypto","加密"),
 ("ETH-USD","Ethereum","Crypto","加密"),
]
SECTORS=[
 ("SOXX","半導體","US","產業 ETF"),
 ("XLK","資訊科技","US","產業 ETF"),
 ("XLC","通訊服務","US","產業 ETF"),
 ("XLF","金融","US","產業 ETF"),
 ("XLE","能源","US","產業 ETF"),
 ("XLV","醫療保健","US","產業 ETF"),
 ("XLI","工業","US","產業 ETF"),
 ("XLY","非必需消費","US","產業 ETF"),
 ("XLP","必需消費","US","產業 ETF"),
 ("XLU","公用事業","US","產業 ETF"),
]
ENTRIES=INDEXES+SECTORS
SOURCES=[
 ("Federal Reserve","https://www.federalreserve.gov/feeds/press_all.xml","央行政策"),
 ("SEC","https://www.sec.gov/news/pressreleases.rss","監管公告"),
]
_cache={}
_lock=threading.Lock()
def _utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
def _clean(v):
    try:
        a=float(v)
        return round(a,6) if math.isfinite(a) else None
    except (TypeError,ValueError):
        return None

def _history(ticker,period="1y"):
    """This requests actual completed daily bars only. No forward-filling."""
    df=yf.Ticker(ticker).history(period=period,interval="1d",auto_adjust=False,actions=False,
                                 raise_errors=True,timeout=12)
    if df is None or df.empty or "Close" not in df:
        raise ValueError("Yahoo Finance 無有效資料")
    prices=df["Close"].dropna()
    prices=prices[prices>0]
    if prices.empty:raise ValueError("沒有有效日線")
    prices.index=prices.index.tz_localize(None).normalize() if prices.index.tz is None else prices.index.tz_localize(None).normalize()
    prices=prices[~prices.index.duplicated(keep="last")].sort_index()
    if ticker in ("BTC-USD","ETH-USD"):
        # Crypto trades continuously: only include completed UTC calendar dates.
        current_utc=datetime.now(timezone.utc).date()
        prices=prices[prices.index.date<current_utc]
    else:
        # Conservative market close + buffer; never publish an intraday partial candle as a completed daily close.
        region=("TW" if ticker in ("^TWII","TWD=X") else
                "JP" if ticker=="^N225" else "US")
        zone,cutoff={
            "TW":("Asia/Taipei",walltime(16,0)),
            "JP":("Asia/Tokyo",walltime(17,0)),
            "US":("America/New_York",walltime(19,0) if ticker in ("GC=F","CL=F") else walltime(17,30))
        }[region]
        now=datetime.now(ZoneInfo(zone))
        last_complete=now.date() if now.time()>=cutoff else now.date()-timedelta(days=1)
        prices=prices[prices.index.date<=last_complete]
    if prices.empty:raise ValueError("尚未取得已收盤的有效日 K")
    return prices

def _cache_get(key,ttl,fn):
    with _lock:
        entry=_cache.get(key)
        if entry and time.monotonic()-entry[0]<ttl:return entry[1]
    value=fn()
    with _lock:_cache[key]=(time.monotonic(),value)
    return value

def _entry(entry):
    ticker,label,region,kind=entry
    try:
        prices=_cache_get(("price",ticker),900,lambda:_history(ticker,"1y"))
        today=float(prices.iloc[-1])
        prior=float(prices.iloc[-2]) if len(prices)>1 else None
        delta=today-prior if prior is not None else None
        percent=100*delta/prior if prior and prior>0 else None
        sampled=prices.iloc[-200:].copy()
        if len(sampled)>100:
            positions=sorted(set([0,len(sampled)-1,*[round(i*(len(sampled)-1)/99) for i in range(100)]]))
            sampled=sampled.iloc[positions]
        return {"ticker":ticker,"name":label,"category":kind,"region":region,
            "value":_clean(today),"previous":_clean(prior),"change":_clean(delta),
            "changePct":_clean(percent),"asOf":prices.index[-1].strftime("%Y-%m-%d"),
            "currency":"USD" if ticker in ("BTC-USD","ETH-USD","GC=F","CL=F") else
                "TWD/USD" if ticker=="TWD=X" else "index" if ticker.startswith("^") else "USD",
            "series":[[d.strftime("%Y-%m-%d"),_clean(v)] for d,v in sampled.items()],
            "status":"日線最後一筆；不保證為交易所最終結算或即時報價"}
    except Exception:
        return {"ticker":ticker,"name":label,"category":kind,"region":region,
            "status":"資料暫時無法取得","error":"Yahoo Finance 未提供可驗證的日線"}

def market_snapshot():
    # Bounded workers and 15 minute in-process cache, limit Yahoo rate exposure.
    def load():
        with ThreadPoolExecutor(max_workers=5) as pool:
            rows=list(pool.map(_entry,ENTRIES))
        return {"items":rows,"updatedUTC":_utc(),
            "basis":"Yahoo Finance 每日收盤欄位；可能有延遲、不同交易所日曆及未完成日線，不視為即時成交價。",
            "limitations":"SOX 為 ^SOX 費城半導體指數；SOXX 是追蹤半導體產業的 ETF，兩者不能混同。指數殖利率報價需依資料源口徑確認。"}
    return _cache_get(("dashboard",),900,load)

def _read_feed(source):
    name,url,category=source
    req=Request(url,headers={"User-Agent":"QTempAnalyticsResearch/1.0 (public financial research dashboard)","Accept":"application/rss+xml, application/xml, text/xml"})
    try:
        with urlopen(req,timeout=7) as resp:
            content=resp.read(700000)
        tree=ET.fromstring(content)
        items=[]
        for item in tree.findall(".//item")[:12]:
            title=(item.findtext("title") or "").strip()
            link=(item.findtext("link") or "").strip()
            raw=(item.findtext("pubDate") or "").strip()
            if not title or not link.startswith(("https://www.federalreserve.gov/","https://www.sec.gov/")):
                continue
            try:published=parsedate_to_datetime(raw).astimezone(timezone.utc).isoformat()
            except (ValueError,TypeError,OverflowError):published=None
            items.append({"title":title[:220],"url":link,"publishedUTC":published,
                          "source":name,"category":category})
        return items
    except Exception:
        return []

def official_news():
    def fetch():
        with ThreadPoolExecutor(max_workers=2) as pool:
            groups=list(pool.map(_read_feed,SOURCES))
        items=[r for group in groups for r in group]
        items.sort(key=lambda x:x["publishedUTC"] or "",reverse=True)
        return {"articles":items[:18],"checkedUTC":_utc(),
                "source":"Federal Reserve 與 SEC 官方新聞 RSS",
                "status":"ok" if items else "暫時無法取得官方 RSS；不顯示推測新聞",
                "links":[{"title":s[0],"url":s[1]} for s in SOURCES]}
    return _cache_get(("news",),900,fetch)

def macro_snapshot():
    """Select market-observed rate/volatility proxies, not fabricated macro releases."""
    snapshot=market_snapshot()
    wanted={"^TNX","^VIX","DX-Y.NYB","GC=F","TWD=X"}
    return {"items":[x for x in snapshot["items"] if x["ticker"] in wanted],
            "updatedUTC":snapshot["updatedUTC"],
            "note":"本頁為金融市場宏觀代理變數，不等於 CPI、失業率或政策利率官方公布值。統計發布前不填估計值。",
            "officialLinks":[
                {"name":"FRED 經濟資料","url":"https://fred.stlouisfed.org/"},
                {"name":"Federal Reserve","url":"https://www.federalreserve.gov/"},
                {"name":"BLS 美國勞動統計","url":"https://www.bls.gov/"},
                {"name":"BEA 美國經濟分析","url":"https://www.bea.gov/"}]}

def market_history(symbol,period="1y"):
    allowed={x[0] for x in ENTRIES}
    if symbol not in allowed:raise ValueError("不支援的市場代號")
    if period not in ("1mo","3mo","6mo","1y","2y","5y"):raise ValueError("不支援的期間")
    prices=_cache_get(("history",symbol,period),900,lambda:_history(symbol,period))
    return {"symbol":symbol,"period":period,"asOf":prices.index[-1].strftime("%Y-%m-%d"),
        "points":[[d.strftime("%Y-%m-%d"),_clean(v)] for d,v in prices.items()],
        "source":"Yahoo Finance 日 K · 原始 Close（不是 Adj Close，指數、商品與加密資產各有不同口徑）"}
