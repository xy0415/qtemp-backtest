"""QTemp temperature-zone statistics. Read-only with respect to indicator logic."""
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from research_features import snapshot, symbols

ZONES=[
 ("bottom","抄底區","QTemp < −95","#535fda"),
 ("dca","定投區間","−95 ≤ QTemp < −75","#6193df"),
 ("neutral","中性區間","−75 ≤ QTemp ≤ 75","#9ba9bd"),
 ("strong","趨勢極強","75 < QTemp < 95","#24a79c"),
 ("overvalued","高估值區間","QTemp > 95","#d86b87")
]

def classify(v):
    if v < -95: return "bottom"
    if v < -75: return "dca"
    if v > 95: return "overvalued"
    if v > 75: return "strong"
    return "neutral"

def zone_analytics(frame,values,events,years=10):
    end=frame.index[-1]
    cutoff=end-pd.DateOffset(years=years)
    score=values["QTemp"]
    warmup=values["暫算"].fillna(True).astype(bool)
    valid=score.loc[(score.index>=cutoff)&(~warmup)&np.isfinite(score)]
    current=float(score.iloc[-1])
    zone=classify(current)
    groups={k:[] for k,_,_,_ in ZONES}
    for day,v in valid.items():
        groups[classify(float(v))].append((day,float(v)))
    years_list=list(range(valid.index[0].year,end.year+1)) if not valid.empty else []
    by_year=[]
    for year in years_list:
        counts={key:sum(x.year==year for x,_ in groups[key]) for key,_,_,_ in ZONES}
        total=sum(counts.values())
        by_year.append({"year":year,"counts":counts,"total":total})
    edges=np.linspace(-100,100,41)
    counts=np.histogram(np.clip(valid.to_numpy(),-100,100),bins=edges)[0].astype(int).tolist()
    current_date=end.normalize()
    today_events=(events.loc[(~events["暫算"].astype(bool)) &
         (events["確認日"].eq(current_date))].drop_duplicates(["類型","確認日"]))
    signal_detail=None
    if zone=="bottom" and not today_events.empty:
        # Confirmation close is an observational point, NOT a guaranteed entry fill.
        point=float(frame.Close.iloc[-1])
        signal_detail={
            "day":end.strftime("%Y-%m-%d"),
            "confirmedPrice":point,
            "signalNames":today_events["類型"].astype(str).tolist(),
            "executionNote":"已確認訊號的還原收盤參考點位，非保證成交價格；策略實際買入仍為下一交易日開盤。"
        }
    sample=len(valid)
    current_group=next(x for x in ZONES if x[0]==zone)
    return {
       "source":"Yahoo Finance · Adj Close 還原 · 已確認日 K",
       "start":valid.index[0].strftime("%Y-%m-%d") if sample else None,
       "end":end.strftime("%Y-%m-%d"),
       "sample":sample,"totalWarmupExcluded":int(warmup.loc[score.index>=cutoff].sum()),
       "current":{"score":current,"zone":zone,"label":current_group[1],"description":current_group[2],
                  "date":end.strftime("%Y-%m-%d"),"confirmation":signal_detail},
       "zones":[{"key":key,"label":label,"bounds":bounds,"color":color,
                 "days":len(groups[key]),"percent":100*len(groups[key])/sample if sample else 0}
                for key,label,bounds,color in ZONES],
       "annual":by_year,"histogram":{"edges":edges.tolist(),"counts":counts},
       "note":"依最新已確認日 K 的 QTemp 分數分類；排除暫算及無效暖機樣本，同一交易日僅計一次。恰為 −95、−75、75、95 的數值歸入相鄰區間規則：−95 屬定投、−75 與 75 屬中性、95 屬中性之外的邊界（為保持使用者指定嚴格大於95/小於95，95 顯示中性邊界）。鐘形圖為歷史分數的實際直方圖與平滑密度線，不假設一定服從常態分布。"
    }

def site_zones(requested):
    symbol=symbols(requested,1)[0]
    actual,frame,values,events=snapshot(symbol,int(datetime.now(timezone.utc).timestamp()//900))
    return {"symbol":actual,**zone_analytics(frame,values,events)}
