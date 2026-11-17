"""Confirmed daily QTemp zone research; no changes to the QTemp indicator formula.

Seven mutually exclusive fixed score bands; seven independently ranked percentile bands.
The exact QTemp 100 high-risk state is an overlay, not an eighth score band.
"""
from datetime import datetime, timezone
import math
import numpy as np
import pandas as pd
from research_features import snapshot, symbols

PERIODS={"1y":1,"3y":3,"5y":5,"10y":10,"15y":15,"all":None}
ZONES=[
 ("extreme_low","極端低估","−100 ≤ QTemp < −95","#5960d6"),
 ("undervalued","低估區間","−95 ≤ QTemp < −75","#8a8be5"),
 ("weak","偏弱區間","−75 ≤ QTemp < −35","#78a8e5"),
 ("neutral","中性區間","−35 ≤ QTemp ≤ 35","#9da8b9"),
 ("strong","偏強區間","35 < QTemp ≤ 75","#48b5a7"),
 ("overvalued","高估區間","75 < QTemp < 95","#e5ad72"),
 ("extreme_high","極端高估","95 ≤ QTemp ≤ 100","#d56886")
]
PERCENTILE_ZONES=[
 ("p0","最低 5%","0% ≤ 歷史百分位 < 5%","#5960d6"),
 ("p1","5%～20%","5% ≤ 歷史百分位 < 20%","#8a8be5"),
 ("p2","20%～40%","20% ≤ 歷史百分位 < 40%","#78a8e5"),
 ("p3","40%～60%","40% ≤ 歷史百分位 ≤ 60%","#9da8b9"),
 ("p4","60%～80%","60% < 歷史百分位 ≤ 80%","#48b5a7"),
 ("p5","80%～95%","80% < 歷史百分位 ≤ 95%","#e5ad72"),
 ("p6","最高 5%","95% < 歷史百分位 ≤ 100%","#d56886")
]

def classify(v):
    """Return exactly one fixed band for any finite score."""
    v=float(v)
    if not math.isfinite(v):
        raise ValueError("QTemp 分數必須為有限數值")
    if v < -95: return "extreme_low"
    if v < -75: return "undervalued"
    if v < -35: return "weak"
    if v <= 35: return "neutral"
    if v <= 75: return "strong"
    if v < 95: return "overvalued"
    return "extreme_high"

def classify_percentile(p):
    p=float(p)
    if not math.isfinite(p): raise ValueError("百分位必須為有限數值")
    if p<5: return "p0"
    if p<20: return "p1"
    if p<40: return "p2"
    if p<=60: return "p3"
    if p<=80: return "p4"
    if p<=95: return "p5"
    return "p6"

def _episodes(keys, positions, zone_ids):
    """Contiguous *valid original trading rows* count as one episode.

    Warmup / missing observations break an episode; an ordinary weekend does not.
    A slice starting partway through an existing episode is marked as left-censored.
    """
    states={key:{"entries":0,"longestDays":0,"averageDays":0.0,"ongoingDays":0,
                 "lengths":[],"leftCensored":False} for key in zone_ids}
    if not keys:return states
    prev_key=None
    prev_position=None
    duration=0
    started_at_left=False
    def finish():
        if prev_key is None:return
        item=states[prev_key]
        item["entries"]+=1
        item["lengths"].append(duration)
        item["longestDays"]=max(item["longestDays"],duration)
        item["leftCensored"]=item["leftCensored"] or started_at_left
    for i,(key,position) in enumerate(zip(keys,positions)):
        contiguous=(prev_position is not None and position==prev_position+1)
        if key!=prev_key or not contiguous:
            finish()
            duration=0
            started_at_left=(i==0 and position>0)
        duration+=1
        prev_key=key
        prev_position=position
    finish()
    states[prev_key]["ongoingDays"]=duration
    for item in states.values():
        lengths=item.pop("lengths")
        item["averageDays"]=sum(lengths)/len(lengths) if lengths else 0.0
    return states

def _empirical_percentile(series):
    """Tie-aware empirical percentile ranks (average of tied ranks).

    This describes within-window relative rank, NOT an estimate of fair value.
    Identical scores have identical percentile and occupy the same bin.
    """
    if series.empty:return series
    return series.rank(method="average",pct=True)*100.0

def zone_analytics(frame,values,events,years=10,mode="fixed"):
    if mode not in ("fixed","percentile"):raise ValueError("區間模式不正確")
    if years is not None and (not isinstance(years,int) or years not in (1,3,5,10,15)):
        raise ValueError("歷史期間不正確")
    end=pd.Timestamp(frame.index[-1])
    cutoff=(end-pd.DateOffset(years=years)) if years is not None else None
    score=pd.to_numeric(values["QTemp"],errors="coerce")
    warmup=values["暫算"].fillna(True).astype(bool)
    aligned=score.reindex(frame.index)
    invalid=warmup.reindex(frame.index).fillna(True)|~np.isfinite(aligned.to_numpy())
    selected=(frame.index>=cutoff) if cutoff is not None else np.ones(len(frame),dtype=bool)
    mask=selected & ~invalid.to_numpy()
    valid=aligned.loc[mask]
    positions=np.flatnonzero(mask).tolist()
    sample=len(valid)
    if not sample:raise ValueError("所選期間沒有已確認、有效的 QTemp 分數")
    current_score=float(score.iloc[-1])
    if not math.isfinite(current_score):raise ValueError("最新 QTemp 分數無效")
    # Fixed scores and percentile ranks are *separate* partitioning modes.
    ranked=_empirical_percentile(valid)
    configs=ZONES if mode=="fixed" else PERCENTILE_ZONES
    metric=valid if mode=="fixed" else ranked
    get_zone=classify if mode=="fixed" else classify_percentile
    keys=[get_zone(x) for x in metric.to_numpy()]
    episodes=_episodes(keys,positions,[r[0] for r in configs])
    counts={key:keys.count(key) for key,*_ in configs}
    by_year=[]
    for year in range(valid.index[0].year,end.year+1):
        this=[key for day,key in zip(valid.index,keys) if day.year==year]
        by_year.append({"year":year,"counts":{key:this.count(key) for key,*_ in configs},
                        "total":len(this)})
    current_percentile=float((valid.lt(current_score).sum()+.5*valid.eq(current_score).sum())/sample*100)
    # Score values below or above the sample all rank 0 or 100 respectively.
    current_percentile=min(100.0,max(0.0,current_percentile))
    current_zone=get_zone(current_score if mode=="fixed" else current_percentile)
    current_definition=next(r for r in configs if r[0]==current_zone)
    high_risk_exact=int((valid==100).sum())
    high_risk_current=bool(current_score==100)
    bins=np.linspace(-100,100,41)
    histogram=np.histogram(np.clip(valid.to_numpy(),-100,100),bins=bins)[0]
    # An extreme-low confirmed event may show its verified close for reference.
    today_events=events.loc[(~events["暫算"].astype(bool)) &
        (pd.to_datetime(events["確認日"]).dt.normalize()==end.normalize())
    ].drop_duplicates(["類型","確認日"])
    confirmation=None
    if classify(current_score)=="extreme_low" and not today_events.empty:
        confirmation={
            "day":end.strftime("%Y-%m-%d"),
            "confirmedPrice":float(frame.Close.iloc[-1]),
            "signalNames":today_events["類型"].astype(str).tolist(),
            "executionNote":"已確認收盤參考點位，非保證成交價格；策略買入仍為下一交易日開盤。"
        }
    zones=[]
    for key,label,bounds,color in configs:
        days=counts[key]
        zones.append({"key":key,"label":label,"bounds":bounds,"color":color,
                      "days":days,"percent":100*days/sample,
                      "entries":episodes[key]["entries"],
                      "averageDays":episodes[key]["averageDays"],
                      "longestDays":episodes[key]["longestDays"],
                      "ongoingDays":episodes[key]["ongoingDays"],
                      "leftCensored":episodes[key]["leftCensored"]})
    return {
        "source":"Yahoo Finance · Adj Close 還原 · 已確認日 K",
        "mode":mode,"period":"all" if years is None else f"{years}y",
        "start":valid.index[0].strftime("%Y-%m-%d"),
        "end":end.strftime("%Y-%m-%d"),"sample":sample,
        "totalWarmupExcluded":int(warmup.reindex(frame.index).fillna(True).loc[selected].sum()),
        "current":{"score":current_score,"percentile":current_percentile,
                   "zone":current_zone,"label":current_definition[1],
                   "description":current_definition[2],
                   "highRisk100":high_risk_current,
                   "date":end.strftime("%Y-%m-%d"),"confirmation":confirmation},
        "zones":zones,"annual":by_year,
        "histogram":{"edges":bins.tolist(),"counts":histogram.astype(int).tolist()},
        "highRisk":{"exact100Days":high_risk_exact,"exact100Percent":100*high_risk_exact/sample,
                    "current":high_risk_current},
        "note":(
          "固定區間依七組互斥的 QTemp 數值分類；100 分另標為高風險極值、不新增第八個區間。"
          if mode=="fixed" else
          "歷史百分位使用目前期間內全部有效分數的平均名次（同分同百分位）；不是估值高低或發生機率，亦不等同固定 QTemp 分數區間。"
        )+" 進入次數以連續有效交易日計算；期間起點可能截斷前一段持續區間，暖機／無效日則中斷連續性。排除暫算及無效樣本。"
    }

def site_zones(requested,period="10y",mode="fixed"):
    if period not in PERIODS:raise ValueError("期間請使用 1y、3y、5y、10y、15y 或 all")
    if mode not in ("fixed","percentile"):raise ValueError("模式請選固定區間或歷史百分位")
    symbol=symbols(requested,1)[0]
    actual,frame,values,events=snapshot(symbol,int(datetime.now(timezone.utc).timestamp()//180))
    result=zone_analytics(frame,values,events,PERIODS[period],mode)
    if result["current"]["confirmation"] is not None:
        from qtemp_core import load_market
        _,raw,_,_=load_market(actual)
        record=raw.loc[frame.index[-1]]
        result["current"]["confirmation"]["rawClose"]=float(record["Close"])
        result["current"]["confirmation"]["executionNote"]=(
            "原始收盤價與 Adj Close 還原價僅供參考，不表示實際成交；"
            "回測買入價採下一交易日還原開盤。")
    return {"symbol":actual,**result}
