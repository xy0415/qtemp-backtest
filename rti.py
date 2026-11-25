"""Confirmed daily Relative Temperature Index from the supplied Pine v6 rules."""
from collections import deque
from datetime import datetime, timezone
from functools import lru_cache
from math import isfinite, log
import re

import numpy as np
import pandas as pd
import yfinance as yf
from qtemp_core import apply_price_basis, ema, load_market, midrank, path_clear, wilder


def calibration(rank):
    return 100.0 * min(1.0, max(-1.0, (rank - .5) / .45))


def _pivots(frame, score, atr, tick):
    opens, highs, lows, closes = (frame[column].to_numpy() for column in ('Open','High','Low','Close'))
    dates = frame.index.strftime('%Y-%m-%d')
    events = []
    for bullish, prices, side in [(False, highs, 1), (True, lows, -1)]:
        anchors = deque(maxlen=100)
        for pos in range(3, len(frame) - 3):
            current = prices[pos]
            if not isfinite(score[pos]) or any(
                (prices[j]-current)*side > 0 or (j>pos and prices[j]==current)
                for j in range(pos-3,pos+4)):
                continue
            while anchors and pos-anchors[0][0]>90:
                anchors.popleft()
            point = (pos,current,score[pos])
            valid_level = score[pos]<=50 if bullish else score[pos]>=-50
            if valid_level and np.sign(closes[pos]-opens[pos])==side:
                for previous in anchors:
                    j, price, value = previous
                    if pos-j<12 or np.sign(closes[j]-opens[j])!=side:
                        continue
                    if (current-price)*side<=0 or (score[pos]-value)*side>=0:
                        continue
                    if np.isfinite(score[j:pos+1]).all() and path_clear(opens,closes,score,atr,previous,point,bullish,tick):
                        events.append(dict(kind='bull' if bullish else 'bear',start=dates[j],
                                           end=dates[pos],confirmed=dates[pos+3]))
            anchors.append(point)
    return sorted(events,key=lambda item:item['confirmed'])[-150:]


def calculate(frame, rank_len, minimum, divergence=False, tick=.01):
    opens, highs, lows, closes, volumes = (
        frame[column].to_numpy(dtype=float) for column in ('Open','High','Low','Close','Volume'))
    count = len(frame)
    deviations, required, previews, scores, atrs = (np.full(count,np.nan) for _ in range(5))
    fast=slow=atr=gain=loss=flow_num=flow_den=smoothed=preview_smoothed=None
    atr_seed, gain_seed, loss_seed = [], [], []
    results, annual = [], {}
    dates = frame.index.strftime('%Y-%m-%d')
    for i, close in enumerate(closes):
        fast, slow = ema(fast,close,50), ema(slow,close,200)
        high, low, volume = highs[i], lows[i], volumes[i]
        delta = close-closes[i-1] if i else 0.0
        true_range=max(high-low,abs(high-closes[i-1]),abs(low-closes[i-1])) if i else high-low
        atr=wilder(atr,true_range,atr_seed)
        if atr is not None:
            atrs[i]=atr
        if i:
            gain=wilder(gain,max(delta,0),gain_seed)
            loss=wilder(loss,max(-delta,0),loss_seed)
        rsi=None if gain is None else 100.0 if loss==0 else 100-100/(1+gain/loss)
        trend_on=atr is not None and atr>0
        trend=float(np.clip((fast-slow)/atr,-1,1)) if trend_on else None
        momentum=None
        if i>=19:
            window=closes[i-19:i+1]
            mean=window.mean()
            mad=np.abs(window-mean).mean()
            if mad>0:
                momentum=float(np.clip((close-mean)/(.015*mad*100),-1,1))
        flow_on=bool(i and trend_on and isfinite(volume) and volume>0 and high>=low)
        position=float(np.clip((2*close-high-low)/(high-low),-1,1)) if flow_on and high>low else 0.0
        move=float(np.clip(delta/atr,-1,1)) if flow_on else 0.0
        flow_num=ema(flow_num,(position+move)*.5*volume if flow_on else 0.0,21)
        flow_den=ema(flow_den,volume if flow_on else 0.0,21)
        flow=float(np.clip(flow_num/flow_den,-1,1)) if flow_on and flow_den>0 else None
        active=[(weight,value) for weight,value in [(45,trend),(35,momentum),(20,flow)] if value is not None]
        consensus=sum(weight*value for weight,value in active)/sum(weight for weight,_ in active) if active else None
        deviations[i]=log(close/slow)
        deviation_rank,_=midrank(deviations,i,rank_len,minimum)
        composite=[(weight,value) for weight,value in [
            (35,consensus),(50,2*deviation_rank-1 if deviation_rank is not None else None)]
            if value is not None]
        raw=sum(weight*value for weight,value in composite)/sum(weight for weight,_ in composite) if composite else None
        if raw is not None:
            preview_smoothed=ema(preview_smoothed,raw,3)
            previews[i]=preview_smoothed
            if i>=199 and trend is not None and momentum is not None and flow is not None and deviation_rank is not None:
                smoothed=ema(smoothed,raw,3)
                required[i]=smoothed
        rank,samples=midrank(required,i,rank_len,1)
        preview_rank,preview_samples=midrank(previews,i,rank_len,1)
        formal=rank is not None and samples>=minimum
        preliminary=preview_rank is not None and preview_samples>=30
        score=calibration(rank) if formal else calibration(preview_rank) if preliminary else None if raw is None else preview_smoothed*100
        if score is not None:
            scores[i]=score
        display=rank*100 if formal else preview_rank*100 if preliminary else None if score is None else 50+score*.5
        ready=rsi is not None and score is not None
        cold=bool(ready and rsi<30 and score<-90)
        hot=bool(ready and rsi>70 and score>90)
        year=int(dates[i][:4])
        stats=annual.setdefault(year,dict(year=year,buyCount=0,sellCount=0,buySum=0.,sellSum=0.))
        entry=None
        if ready and i>=2 and results[-1]['ready']:
            if results[-2]['cold'] and not results[-1]['cold']:
                entry='buy'
            elif results[-2]['hot'] and not results[-1]['hot']:
                entry='sell'
            if entry:
                stats[entry+'Count']+=1
                stats[entry+'Sum']+=opens[i]
        results.append(dict(day=dates[i],open=opens[i],high=high,low=low,close=close,
                            volume=float(volume) if isfinite(volume) and volume>=0 else None,
                            score=score,percentile=display,stage='formal' if formal else 'preliminary' if preliminary else 'raw' if score is not None else 'none',
                            ready=ready,rsi=rsi,trend=trend,momentum=momentum,flow=flow,consensus=consensus,
                            deviation=(close/slow-1)*100,deviationRank=deviation_rank,
                            samples=samples,previewSamples=preview_samples,cold=cold,hot=hot,entry=entry))
    for row in annual.values():
        for side in ('buy','sell'):
            total=row.pop(side+'Sum')
            row[side+'Average']=total/row[side+'Count'] if row[side+'Count'] else None
    return results,list(reversed(list(annual.values())))[:15],_pivots(frame,scores,atrs,tick) if divergence else []


def _crypto_history(symbol):
    ticker=yf.Ticker(symbol)
    frame=ticker.history(period='max',interval='1d',auto_adjust=False,timeout=20,raise_errors=True)
    meta=ticker.history_metadata or {}
    if meta.get('instrumentType') not in (None,'CRYPTOCURRENCY') or frame.empty:
        raise ValueError('Yahoo Finance 沒有該幣種的日線')
    dates=pd.DatetimeIndex(frame.index)
    if dates.tz is not None:
        dates=dates.tz_convert('UTC').tz_localize(None)
    frame.index=dates.normalize()
    good=(frame.index<pd.Timestamp(datetime.now(timezone.utc).date())) & frame[['Open','High','Low','Close']].gt(0).all(axis=1)
    frame=frame.loc[good].sort_index()
    frame=frame.loc[~frame.index.duplicated(keep='last')]
    if frame.empty:
        raise ValueError('尚未取得已結束 UTC 日線')
    return symbol,frame,meta


def earnings_reference(frame, reports):
    """Use only reports dated before the current bar, as Pine's previous daily bar does."""
    by_day = sorted(reports.items())
    pos=0
    earnings=deque(maxlen=4)
    history=np.full(len(frame),np.nan)
    price,eps,age,samples,coverage,rank=None,None,None,0,0.0,None
    close=frame['Close'].to_numpy()
    for i, day in enumerate(frame.index):
        while pos<len(by_day) and by_day[pos][0]<=day:
            earnings.append(by_day[pos]);pos+=1
        if len(earnings)==4 and all(45<=(b[0]-a[0]).days<=140 for a,b in zip(earnings,list(earnings)[1:])):
            age=(day-earnings[-1][0]).days
            value=sum(entry[1] for entry in earnings)
            if age<=150 and value>0:
                history[i]=log(close[i])-log(value)
        if i==len(frame)-2:
            price=float(np.exp(history[i])) if isfinite(history[i]) else None
            eps=float(close[i]/price) if price else None
            rank,samples=midrank(history,i,756,1)
            coverage=samples/min(i,756) if i else 0.0
            return dict(value=price,eps=eps,ageDays=age,samples=samples,coverage=coverage,
                        percentile=rank*100 if rank is not None and samples>=126 and coverage>=.6 else None,
                        asOf=day.strftime('%Y-%m-%d'))
    return dict(value=None,percentile=None)


@lru_cache(maxsize=64)
def get_earnings_reference(symbol,slot):
    resolved,frame,meta,_=load_market(symbol)
    if (meta.get('instrumentType') or '').upper() not in {'EQUITY','DR'}:
        return dict(value=None,note='本益比參考適用於股票，資料須有已公布 EPS。')
    try:
        data=yf.Ticker(resolved).get_earnings_dates(limit=48)
        actual=data['Reported EPS'].dropna()
        reports={pd.Timestamp(day.date()):float(value) for day,value in actual.items() if isfinite(value)}
        return earnings_reference(frame,reports)
    except Exception:
        return dict(value=None,note='來源暫無足夠已公布 EPS，無法估算本益比。')


def symbol_valid(symbol):
    return bool(re.fullmatch(r'(?:[A-Z0-9][A-Z0-9_-]{0,24}(?:\.(?:TW|TWO))?|\^(?:TWII|GSPC|IXIC|DJI|SOX|NDX|RUT|VIX))',symbol))


@lru_cache(maxsize=48)
def rti_snapshot(symbol, rank_len, minimum, divergence, slot):
    crypto=symbol.endswith('-USD')
    if crypto:
        resolved,frame,meta=_crypto_history(symbol)
    else:
        resolved,frame,meta,_=load_market(symbol)
        frame=apply_price_basis(frame)
    rank_len=rank_len or (730 if crypto else 504)
    minimum=min(minimum,rank_len) if minimum else max(30,min(126,rank_len//4))
    rows,annual,confirmed=calculate(frame.tail(5000),rank_len,minimum,divergence,10**(-int(meta.get('priceHint') or 2)))
    return dict(symbol=resolved,rankLength=rank_len,minimum=minimum,rows=rows,annual=annual,
                divergences=confirmed,priceBasis='Yahoo Finance UTC 日線' if crypto else 'Yahoo Finance 還原日線',
                stale=bool(meta.get('_qtemp_cache_status')=='stale_backup'),asOf=rows[-1]['day'])

