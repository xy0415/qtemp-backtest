"""Risk-adjusted multi-asset comparison (actual Yahoo Finance adjusted daily prices).

Date filtering and common-session alignment happen before computing all statistics.
No market series are interpolated, forward-filled or invented.
"""
from datetime import datetime, timezone
import math
import re
import numpy as np
import pandas as pd
from research_features import snapshot, symbols

TIMEFRAMES={"1y":1,"3y":3,"5y":5,"10y":10,"15y":15,"all":None,"custom":None}
BENCHMARKS={"SPY","QQQ","SOXX"}
FREQUENCIES={"none","monthly","quarterly","annual"}
PER_YEAR=252
LIMIT=30000

def _safe(v):
    if v is None: return None
    try:
        out=float(v)
        return round(out,9) if math.isfinite(out) else None
    except (TypeError,ValueError,OverflowError):
        return None

def _date(v,name):
    try:
        if not isinstance(v,str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}",v):
            raise ValueError()
        return pd.Timestamp(v)
    except (ValueError,TypeError):
        raise ValueError(name+"需為 YYYY-MM-DD 格式")

def _period_window(end,timeframe,start,end_date):
    if timeframe not in TIMEFRAMES:raise ValueError("時間範圍不正確")
    if timeframe=="custom":
        begin=_date(start,"起始日期")
        finish=_date(end_date,"結束日期")
        if begin>=finish:raise ValueError("結束日期必須晚於起始日期")
        if finish>end:finish=end
        return begin,finish
    years=TIMEFRAMES[timeframe]
    return (end-pd.DateOffset(years=years),end) if years else (None,end)

def _max_dd_stats(nav):
    peak=nav.cummax()
    dd=nav/peak-1.
    mdd=float(dd.min())
    underwater=dd.lt(-1e-10).to_numpy()
    longest=run=0
    for flag in underwater:
        run=run+1 if flag else 0
        longest=max(longest,run)
    if not len(dd):return None,None,None,None
    trough_index=int(np.argmin(dd.to_numpy()))
    prior_peak=int(np.argmax(nav.iloc[:trough_index+1].to_numpy()))
    target=float(nav.iloc[prior_peak])
    recovered=np.flatnonzero(nav.iloc[trough_index+1:].to_numpy()>=target*(1.-1e-10))
    recovery=None if len(recovered)==0 else int(trough_index+1+recovered[0]-prior_peak)
    return mdd,longest,recovery,dd

def _yearly(nav):
    out=[]
    for year,part in nav.groupby(nav.index.year):
        # For the first and last partial years, start from previous available close if present.
        earlier=nav.loc[nav.index<part.index[0]]
        anchor=float(earlier.iloc[-1]) if len(earlier) else float(part.iloc[0])
        out.append({"year":str(year),"return":_safe(part.iloc[-1]/anchor-1),
                    "partial":bool(part.index[0].month>1 or part.index[-1].month<12)})
    return out

def _perf(nav,benchmark=None):
    close=nav.astype(float)
    daily=close.pct_change().dropna()
    years=(close.index[-1]-close.index[0]).days/365.25
    total=float(close.iloc[-1]/close.iloc[0]-1)
    cagr=(float(close.iloc[-1]/close.iloc[0])**(1/years)-1) if years>0 else None
    sigma=float(daily.std(ddof=1)) if len(daily)>1 else 0.
    vol=sigma*math.sqrt(PER_YEAR)
    negative=daily.where(daily<0,0.)
    downside=float(math.sqrt((negative**2).mean())*math.sqrt(PER_YEAR)) if len(daily) else 0.
    annmean=float(daily.mean()*PER_YEAR) if len(daily) else 0.
    mdd,longest,recovery,dd=_max_dd_stats(close)
    year_stats=_yearly(close)
    full_years=[x["return"] for x in year_stats if not x["partial"] and x["return"] is not None]
    year_list=full_years if full_years else [x["return"] for x in year_stats if x["return"] is not None]
    result={
      "totalReturn":_safe(total),"cagr":_safe(cagr),"volatility":_safe(vol),
      "maxDrawdown":_safe(mdd),"sharpe":_safe(annmean/vol) if vol>0 else None,
      "sortino":_safe(annmean/downside) if downside>0 else None,
      "calmar":_safe(cagr/abs(mdd)) if mdd is not None and mdd<0 else None,
      "winRate":_safe(daily.gt(0).mean()) if len(daily) else None,
      "bestYear":_safe(max(year_list)) if year_list else None,
      "worstYear":_safe(min(year_list)) if year_list else None,
      "maxUnderwaterDays":longest,"recoveryDays":recovery,
      "yearly":year_stats
    }
    if benchmark is not None:
        aligned=pd.concat([daily,benchmark.pct_change().dropna()],axis=1,join="inner").dropna()
        aligned.columns=["asset","benchmark"]
        if len(aligned)>=3:
            d=aligned.asset-aligned.benchmark
            bm_var=float(aligned.benchmark.var())
            beta=float(aligned.asset.cov(aligned.benchmark)/bm_var) if bm_var>0 else None
            # Annual arithmetic Jensen alpha, zero risk-free assumption.
            alpha=(float(aligned.asset.mean()-beta*aligned.benchmark.mean())*PER_YEAR) if beta is not None else None
            tracking=float(d.std()*math.sqrt(PER_YEAR))
            result.update({
              "beta":_safe(beta),"alpha":_safe(alpha),"trackingError":_safe(tracking),
              "informationRatio":_safe(float(d.mean()*PER_YEAR)/tracking) if tracking>0 else None
            })
    return result,dd

def _points(series,scale=1,max_points=1400):
    if len(series)>max_points:
        ix=sorted(set([0,len(series)-1,*np.linspace(0,len(series)-1,max_points,dtype=int)]))
        series=series.iloc[ix]
    return [[day.strftime("%Y-%m-%d"),_safe(v*scale)] for day,v in series.items()]

def _portfolio(prices,weights,rebalancing):
    """No external deposits, dividends embedded in adjusted-price ratios, no fees."""
    total=len(prices.columns)
    weights=np.asarray(weights,dtype=float)
    if len(weights)!=total or (weights<0).any() or weights.sum()<=0:
        raise ValueError("投資組合權重不正確")
    weights=weights/weights.sum()
    shares=100.*weights/prices.iloc[0].to_numpy(dtype=float)
    values=[]
    count=0
    last_period=None
    for day,close in prices.iterrows():
        close_values=close.to_numpy(dtype=float)
        value=float(np.dot(shares,close_values))
        if not math.isfinite(value) or value<=0:raise ValueError("投資組合數值異常")
        if rebalancing!='none':
            period=day.to_period({"monthly":"M","quarterly":"Q","annual":"Y"}[rebalancing])
            if last_period is not None and period!=last_period:
                shares=value*weights/close_values
                count+=1
            last_period=period
        values.append(value)
    return pd.Series(values,index=prices.index,name="Portfolio"),count

def _rolling_corr(returns,benchmark):
    data=pd.concat([returns,benchmark],axis=1,join="inner").dropna()
    if len(data)<61:return []
    rolling=data.iloc[:,0].rolling(60,min_periods=60).corr(data.iloc[:,1])
    return _points(rolling.dropna(),max_points=600)

def compare_deep(text,benchmark="SPY",timeframe="10y",start="",end_date="",weights="",
                 rebalancing="none"):
    selected=symbols(text,4)
    benchmark=benchmark.strip().upper()
    if benchmark not in BENCHMARKS:raise ValueError("基準指數請選 SPY、QQQ 或 SOXX")
    if rebalancing not in FREQUENCIES:raise ValueError("再平衡頻率不正確")
    if weights.strip():
        try: percentages=[float(v.strip()) for v in weights.split(",")]
        except ValueError: raise ValueError("權重必須為數字，以逗號分隔")
        if len(percentages)!=len(selected):raise ValueError("每檔標的都需要一個權重")
        if any(not math.isfinite(v) or v<0 for v in percentages) or sum(percentages)<=0:
            raise ValueError("權重必須非負且總和大於0")
    else:percentages=[100/len(selected)]*len(selected)
    errors=[]
    datasets={}
    listed={}
    qtemps={}
    for symbol in list(dict.fromkeys([*selected,benchmark])):
        try:
            actual,frame,values,_=snapshot(symbol,int(datetime.now(timezone.utc).timestamp()//900))
            close=frame.Close.astype(float)
            if close.empty or not np.isfinite(close).all() or (close<=0).any():
                raise ValueError("日 K 價格驗證失敗")
            datasets[symbol]=close
            listed[symbol]={"first":close.index[0].strftime("%Y-%m-%d"),
                            "last":close.index[-1].strftime("%Y-%m-%d"),"bars":len(close)}
            qtemps[symbol]=_safe(values.QTemp.iloc[-1])
        except Exception as e:
            errors.append(symbol+"："+str(e)[:145])
    if errors:raise ValueError("資料不完整，不能進行公平比較："+"；".join(errors))
    end=min(series.index[-1] for series in datasets.values())
    begin,finish=_period_window(end,timeframe,start,end_date)
    selected_frames=[datasets[s] for s in [*selected,benchmark]]
    common=selected_frames[0].index
    for series in selected_frames[1:]:common=common.intersection(series.index)
    common=common[common<=finish]
    if begin is not None:common=common[common>=begin]
    if len(common)<40:raise ValueError("共同已確認交易日不足 40 天；請拉長區間或改選標的")
    if len(common)>LIMIT:common=common[-LIMIT:]
    prices=pd.DataFrame({sym:datasets[sym].loc[common] for sym in selected},index=common)
    bench=datasets[benchmark].loc[common]
    benchmark_nav=bench/bench.iloc[0]*100.
    names=[sym for sym in selected]
    asset_nav={sym:(prices[sym]/prices[sym].iloc[0]*100.) for sym in names}
    portfolio,rebalance_count=_portfolio(prices,percentages,rebalancing)
    all_series={**asset_nav,"投資組合":portfolio}
    benchmark_metrics,_=_perf(benchmark_nav)
    benchmark_return=bench.pct_change().dropna()
    assets=[]
    for name,nav in all_series.items():
        stats,dd=_perf(nav,benchmark_nav)
        assets.append({"symbol":name,
                       "qtemp":qtemps.get(name),
                       "metrics":stats,
                       "nav":_points(nav),
                       "drawdown":_points(dd,100),
                       "excess":_points((nav/benchmark_nav-1)*100),
                       "logNav":_points(nav.apply(math.log))})
    index_matrix=prices.pct_change().dropna()
    corr=index_matrix.corr(method="pearson")
    corr_out=[]
    for a in names:
        corr_out.append({"symbol":a,"values":{b:_safe(corr.loc[a,b]) for b in names}})
    rolling=[]
    for symbol in names:
        if symbol==benchmark:continue
        rolling.append({"symbol":symbol,"points":_rolling_corr(index_matrix[symbol],benchmark_return)})
    return {
      "symbols":names,"benchmark":benchmark,"timeframe":timeframe,
      "requestedStart":start if timeframe=="custom" else None,
      "requestedEnd":end_date if timeframe=="custom" else None,
      "listed":listed,
      "commonStart":common[0].strftime("%Y-%m-%d"),
      "commonEnd":common[-1].strftime("%Y-%m-%d"),
      "commonDays":len(common),
      "riskFreeAnnual":0,
      "benchmarkMetrics":benchmark_metrics,
      "assets":assets,
      "benchmarkSeries":{"nav":_points(benchmark_nav),
                         "drawdown":_points(_max_dd_stats(benchmark_nav)[-1],100)},
      "correlations":corr_out,"rollingCorrelations":rolling,
      "portfolio":{"weights":{s:_safe(w/sum(percentages)*100) for s,w in zip(selected,percentages)},
                   "rebalancing":rebalancing,"rebalanceCount":rebalance_count},
      "notes":["資料使用 Yahoo Finance 已確認日 K 的 Adj Close 還原價格；無模擬行情、補值或推估缺漏。",
               "所有績效統計、基準及組合只使用同一組共同交易日，起始淨值一律為 100。",
               "Sharpe、Sortino 及 Jensen Alpha 假設無風險利率為 0%，採 252 交易日年化；勝率為正報酬交易日比例。",
               "年度最佳與最差報酬優先採完整曆年；沒有完整年時採目前可見部分年度。季度、年度首次共同交易日作再平衡。",
               "未計交易費、稅及滑價；跨幣別標的未換匯，請勿將不同幣別價格直接當作同一幣別投組。",
               "槓桿型 ETF 可能有每日重設及波動耗損，長期績效不等於指數固定倍數。"]
    }
