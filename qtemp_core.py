# QTemp 計算及 Yahoo 資料處理，保留 Colab 版本邏輯。
from collections import deque
import numpy as np
import pandas as pd

SIGNALS = {'buy': '低估值', 'sell': '高估值', 'bull': '底背離', 'bear': '頂背離'}
COLORS = {'buy': '#72a7ff', 'sell': '#ff8a88', 'bull': '#7ce7ba', 'bear': '#ffd08b'}

def ema(previous, value, length):
    alpha = 2 / (length + 1)
    return value if previous is None else alpha * value + (1 - alpha) * previous

def wilder(previous, value, seed):
    if previous is not None:
        alpha = 1 / 14
        return alpha * value + (1 - alpha) * previous
    seed.append(value)
    return sum(seed) / 14 if len(seed) == 14 else None

def midrank(series, index, length, minimum):
    value = series[index]
    if not np.isfinite(value):
        return None, 0
    prior = series[max(0, index - length):index]
    valid = prior[np.isfinite(prior)]
    count = len(valid)
    if count < minimum or count < len(prior) * .6:
        return None, count
    # Pine comparison operators round each float operand to nine decimals.
    valid = np.round(valid, 9)
    low, high = np.round([value - 1e-10, value + 1e-10], 9)
    below = np.count_nonzero(valid < low)
    tied = np.count_nonzero((valid >= low) & (valid <= high))
    return (below + .5 * tied) / count, count

def path_clear(opens, closes, scores, atr, a, b, bull, tick):
    ai, ap, ac = a
    bi, bp, bc = b
    distance = bi - ai
    cs, ps = (bc-ac)/distance, (bp-ap)/distance
    hits = touches = 0
    last = -1.
    lo, hi = min(ac, bc), max(ac, bc)
    for step in range(distance):
        index = ai + step
        current, following = scores[index:index+2]
        lo, hi = min(lo, current, following), max(hi, current, following)
        if round(hi - lo,9) > round(120 + 1e-8,9):
            return False
        contacts = []
        if round(abs(cs),9) > 0:
            x = (current-ac)/cs
            if step - 1e-7 <= x <= step + 1 + 1e-7:
                contacts.append(x)
        elif round(abs(current - (ac + cs * step)),9) <= 1e-8:
            return False
        right = ac + cs * (step+1)
        if (step+1 < distance and abs(following-current) > 1e-8 and
                min(current, following)-1e-8 <= right <= max(current, following)+1e-8):
            contacts.append(step + 1)
        for x in contacts:
            if 1e-7 < x < distance - 1e-7 and abs(x-last) > 1e-7:
                hits, last = hits+1, x
        if hits > 3:
            return False
        if step:
            o, c = opens[index], closes[index]
            left, right_price = ap+ps*(step-.5), ap+ps*(step+.5)
            scale = max(atr[index] if np.isfinite(atr[index]) else abs(c-o), tick)
            penetration = (max(left, right_price)-min(o, c) if bull else max(o, c)-min(left, right_price))/scale
            if penetration > max(.05, tick/scale) + 1e-8:
                return False
            touches += penetration >= -1e-8
            if touches > 1:
                return False
    return True

def qtemp(frame, eps=None, tick=.01):
    o, h, l, c, v = (frame[col].to_numpy(dtype=float) for col in ['Open','High','Low','Close','Volume'])
    size = len(c)
    divs, pe_history, smooth, atr, scores = [np.full(size, np.nan) for _ in range(5)]
    rsi_out, pe_weights, warmup = np.full(size,np.nan), np.zeros(size), np.zeros(size,dtype=bool)
    fast = slow = gain = loss = flow_ema = atr_value = blend = None
    cumulative = 0.
    seeds = [[],[],[]]
    highs, lows = deque(maxlen=100), deque(maxlen=100)
    events = []
    eps_values = eps.reindex(frame.index).to_numpy(dtype=float) if eps is not None else np.full(size, np.nan)
    pe_start = max(0, size-5000)
    pe_window = pe_history[pe_start:]
    for i in range(size):
        if i:
            delta = c[i]-c[i-1]
            gain = wilder(gain, max(delta,0), seeds[0])
            loss = wilder(loss, max(-delta,0), seeds[1])
        rsi = np.nan if gain is None or loss is None else 100 if loss == 0 else 100-100/(1+gain/loss)
        rsi_out[i] = rsi
        cci_value = np.nan
        if i>=19:
            window = c[i-19:i+1]
            mean = window.mean()
            mad = np.abs(window-mean).mean()
            if mad:
                cci_value = (c[i]-mean)/(.015*mad)
        votes = int(np.isfinite(rsi))+int(np.isfinite(cci_value))
        rsi_compare, cci_compare = round(rsi,9), round(cci_value,9)
        momentum = (int(rsi_compare>60)-int(rsi_compare<40)+int(cci_compare>100)-int(cci_compare<-100))/votes if votes else 0
        fast, slow = ema(fast,c[i],50), ema(slow,c[i],200)
        old_flow = flow_ema
        candle_side = np.sign(round(c[i],9)-round(o[i],9))
        cumulative += candle_side * (v[i] if np.isfinite(v[i]) else 0)
        flow_ema = ema(flow_ema,cumulative,21)
        vw = 20 if np.isfinite(v[i]) and old_flow is not None and np.any(v[max(0,i-20):i+1]>0) else 0
        slope = np.sign(round(flow_ema-old_flow,9)) if old_flow is not None else 0
        consensus = (45*np.sign(round(fast,9)-round(slow,9))+35*(int(momentum>.25)-int(momentum<-.25))+vw*slope)/(45+35*bool(votes)+vw)
        divs[i] = np.log(c[i]/slow)
        deviation, _ = midrank(divs,i,504,126)
        if i >= pe_start and np.isfinite(eps_values[i]) and round(eps_values[i],9)>0:
            pe_history[i] = np.log(c[i])-np.log(eps_values[i])
        pe, observations = midrank(pe_window,i-1-pe_start,756,1) if i>pe_start else (None,0)
        pe_weight = 0 if pe is None else 15*min(1,max(0,(observations-126)/126))
        total = 35+(50 if deviation is not None else 0)+pe_weight
        value = ((35/total)*consensus+((50/total)*(2*deviation-1) if deviation is not None else 0)+
                 ((pe_weight/total)*(2*pe-1) if pe is not None else 0))
        blend = ema(blend,value,3)
        smooth[i] = blend
        percentile, count = midrank(smooth,i,504,1)
        scores[i] = np.clip(100*(percentile-.5)/.45,-100,100) if percentile is not None and count>=30 else 100*blend
        warmup[i], pe_weights[i] = count<126, pe_weight/total
        true_range = max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) if i else h[i]-l[i]
        atr_value = wilder(atr_value,true_range,seeds[2])
        if atr_value is not None:
            atr[i] = atr_value
        if rsi_compare < 30 and round(scores[i],9) < -90:
            events.append(('buy',i,i,None))
        if rsi_compare > 70 and round(scores[i],9) > 90:
            events.append(('sell',i,i,None))
        if i<6:
            continue
        pivot = i-3
        for bull, prices, side, anchors in [(False,h,1,highs),(True,l,-1,lows)]:
            price = prices[pivot]
            if any((prices[j]-price)*side > 0 or (j>pivot and prices[j]==price) for j in range(i-6,i+1)):
                continue
            while anchors and pivot-anchors[0][0]>90:
                anchors.popleft()
            score = scores[pivot]
            current = pivot,price,score
            if np.sign(round(c[pivot],9)-round(o[pivot],9))==side and (round(score,9)<=50 if bull else round(score,9)>=-50):
                for anchor in anchors:
                    j, start_price, start_score = anchor
                    if (pivot-j>=12 and np.sign(round(c[j],9)-round(o[j],9))==side
                            and (round(price,9)-round(start_price,9))*side>0
                            and (round(score,9)-round(start_score,9))*side<0
                            and path_clear(o,c,scores,atr,anchor,current,bull,tick)):
                        events.append(('bull' if bull else 'bear',pivot,i,j))
            anchors.append(current)
    values = pd.DataFrame({'QTemp':scores,'RSI':rsi_out,'P/E 權重':pe_weights,'暫算':warmup},index=frame.index)
    rows = [{'類型':SIGNALS[k],'代碼':k,'標記日':frame.index[j],'確認日':frame.index[i],
             '確認收盤價':c[i],'暫算':bool(warmup[i]),'標記位置':j,'確認位置':i,'背離起點':a}
            for k,j,i,a in events]
    return values, pd.DataFrame(rows,columns=['類型','代碼','標記日','確認日','確認收盤價','暫算','標記位置','確認位置','背離起點'])

from functools import lru_cache
from datetime import datetime, time
import re
import unicodedata
from zoneinfo import ZoneInfo
import yfinance as yf

def symbol_input(value):
    value = unicodedata.normalize('NFKC', value).strip().upper()
    return value.replace(' ', '') if re.fullmatch(r'[A-Z0-9.^=_ -]+', value) else value

def candidates(value):
    ticker = symbol_input(value)
    if re.fullmatch(r'\d{4,6}[A-Z]?',ticker):
        return [ticker+'.TW', ticker+'.TWO']
    return [ticker]

def search_yahoo(text):
    text = unicodedata.normalize('NFKC', text).strip()
    if not text:
        return []
    results = list(dict.fromkeys(candidates(text))) if re.fullmatch(r'[A-Z0-9.^=_ -]+', text.upper()) else []
    choices = [(s,s) for s in results]
    try:
        quotes = yf.Search(text, max_results=12, news_count=0, enable_fuzzy_query=False).quotes
        for item in quotes:
            symbol = item.get('symbol')
            if symbol and item.get('quoteType') in {'EQUITY','ETF','INDEX','MUTUALFUND'}:
                label = f"{symbol} ｜ {item.get('shortname') or item.get('longname') or ''} ｜ {item.get('exchDisp') or ''}"
                choices = [(old_label,s) for old_label,s in choices if s != symbol]
                choices.append((label,symbol))
    except Exception:
        if not choices:
            raise
    return choices

def closed_cutoff(local_date, tz):
    try:
        import exchange_calendars as xcals
        names = {'Asia/Taipei': 'XTAI', 'America/New_York': 'XNYS'}
        calendar = xcals.get_calendar(names[tz])
        return calendar.session_close(pd.Timestamp(local_date)).to_pydatetime() + pd.Timedelta(minutes=20)
    except Exception:
        return datetime.combine(local_date, time(17,30), ZoneInfo(tz))

@lru_cache(maxsize=12)
def yahoo_history(symbol, refresh_slot):
    ticker = yf.Ticker(symbol)
    frame = ticker.history(period='max', interval='1d', auto_adjust=False, actions=True,
                           prepost=False, timeout=20, raise_errors=True)
    if frame.empty:
        raise ValueError(f'Yahoo Finance 未回傳 {symbol} 的歷史日線。')
    metadata = ticker.history_metadata or {}
    zone = str(getattr(frame.index, 'tz', '') or metadata.get('exchangeTimezoneName') or '')
    if not zone or zone == 'UTC':
        zone = 'Asia/Taipei' if symbol.endswith(('.TW','.TWO')) else 'America/New_York'
    now = datetime.now(ZoneInfo(zone))
    dates = pd.DatetimeIndex(frame.index)
    if dates.tz is not None:
        dates = dates.tz_convert(zone).tz_localize(None)
    frame.index = dates.normalize().rename('交易日')
    frame = frame.loc[~frame.index.duplicated(keep='last')].sort_index()
    today = pd.Timestamp(now.date())
    frame = frame[frame.index <= today]
    if now < closed_cutoff(now.date(),zone):
        frame = frame[frame.index < today]
    columns = ['Open','High','Low','Close','Adj Close','Volume','Dividends','Stock Splits']
    frame = frame.reindex(columns=columns).apply(pd.to_numeric,errors='coerce')
    ohlc = frame[['Open','High','Low','Close']]
    valid = np.isfinite(ohlc).all(axis=1) & ohlc.gt(0).all(axis=1)
    valid &= frame.High.ge(ohlc[['Open','Low','Close']].max(axis=1))
    valid &= frame.Low.le(ohlc[['Open','High','Close']].min(axis=1))
    frame = frame.loc[valid].copy()
    frame['Volume'] = frame.Volume.where(np.isfinite(frame.Volume) & frame.Volume.ge(0))
    if len(frame)<20:
        raise ValueError(f'{symbol} 只有 {len(frame)} 根已收盤日 K，至少需要 20 根。')
    return frame,metadata,zone

def load_market(value):
    failures = []
    slot = int(pd.Timestamp.now(tz='UTC').timestamp() // 300)
    for symbol in candidates(value):
        try:
            frame, meta, zone = yahoo_history(symbol,slot)
            return symbol,frame.copy(),meta,zone
        except Exception as error:
            failures.append(f'{symbol}：{error}')
    raise RuntimeError('；'.join(failures))

def apply_price_basis(frame):
    factor = (frame['Adj Close']/frame.Close).replace([np.inf,-np.inf],np.nan)
    usable = factor.notna() & factor.gt(0)
    if not usable.all():
        raise ValueError('Yahoo Finance 的調整收盤價有缺漏，無法用 Adj Close 還原。')
    result = frame.copy()
    result[['Open','High','Low']] = frame[['Open','High','Low']].mul(factor,axis=0)
    result['Close'] = frame['Adj Close']
    result['High'] = result.High.clip(lower=result.Close)
    result['Low'] = result.Low.clip(upper=result.Close)
    return result

def optional_info(ticker):
    try:
        return ticker.get_info() or {},None
    except Exception as error:
        return {},str(error)

def annual_table(frame, events, years=10, event='低估值', include_warmup=True):
    closes = frame.Close.groupby(frame.index.year).last()
    latest_year = int(frame.index[-1].year)
    selected = events[events['類型'].eq(event)]
    if not include_warmup:
        selected = selected[~selected['暫算']]
    selected = selected.drop_duplicates(['類型','確認日'])
    event_years = pd.to_datetime(selected['確認日']).dt.year
    rows = []
    for year in closes.index[::-1]:
        if year<latest_year-years+1:
            break
        e = selected.loc[event_years.eq(year),'確認收盤價']
        previous = closes.get(year-1, np.nan)
        avg = e.mean()
        rows.append({'年度':int(year),'訊號次數':len(e),'訊號均價':avg,
                     '均價至最近收盤報酬率':frame.Close.iloc[-1]/avg-1 if len(e) else np.nan,
                     '年度報酬率':closes.loc[year]/previous-1})
    return pd.DataFrame(rows)

def historical_returns(frame):
    last = frame.index[-1]
    targets = {'1 個月':pd.DateOffset(months=1),'3 個月':pd.DateOffset(months=3),
               '1 年':pd.DateOffset(years=1),'3 年':pd.DateOffset(years=3),
               '5 年':pd.DateOffset(years=5),'10 年':pd.DateOffset(years=10)}
    rows = []
    for label, offset in targets.items():
        i = frame.index.searchsorted(last-offset,side='right')-1
        rows.append({'期間':label,'基準日':frame.index[i] if i>=0 else pd.NaT,
                     '報酬率':frame.Close.iloc[-1]/frame.Close.iloc[i]-1 if i>=0 else np.nan})
    return pd.DataFrame(rows)

import json

from io import StringIO

def chart_payload(frame, values, events):
    first = frame.index.searchsorted(frame.index[-1] - pd.DateOffset(years=12))
    visible = frame.iloc[first:]
    days = visible.index.strftime('%Y-%m-%d').tolist()
    scores = values.QTemp.iloc[first:].to_list()
    candles = [[day, float(o), float(h), float(l), float(c), None if pd.isna(v) else float(v)]
               for day, (o,h,l,c,v) in zip(days, visible[['Open','High','Low','Close','Volume']].itertuples(index=False,name=None))]
    selected = events.loc[events['標記位置'].ge(first)]
    marked = selected.drop_duplicates(['標記位置','代碼']).sort_values('標記位置',kind='stable')
    marks = [[days[int(position)-first], code] for position, code in
             marked[['標記位置','代碼']].itertuples(index=False,name=None)]
    segments = []
    for end, code, anchor in selected[['標記位置','代碼','背離起點']].dropna().tail(150).itertuples(index=False,name=None):
        if anchor < first:
            continue
        a,b = int(anchor)-first,int(end)-first
        price_index = 3 if code == 'bull' else 2
        segments.append([days[a],days[b],candles[a][price_index],candles[b][price_index],scores[a],scores[b],code])
    return {'candles':candles,'scores':scores,'marks':marks,'segments':segments}

def tv_csv_frame(csv_text, zone):
    if len(csv_text)>2_000_000:
        raise ValueError('CSV 大於 2 MB，請縮短匯出區間。')
    raw = pd.read_csv(StringIO(csv_text.lstrip('\ufeff')))
    columns = {str(col).strip().lower():col for col in raw.columns}
    date_col = next((columns[k] for k in ('time','date','日期','時間') if k in columns),None)
    if date_col is None or not all(k in columns for k in ('open','high','low','close')):
        raise ValueError('CSV 須有 TradingView 的 Time、Open、High、Low、Close 欄。')
    times = raw[date_col].astype(str).str.strip()
    numeric = pd.to_numeric(times,errors='coerce')
    if numeric.notna().all():
        unit = 'ms' if numeric.abs().median()>1e11 else 's'
        index = pd.DatetimeIndex(pd.to_datetime(numeric,unit=unit,utc=True))
        if not (index == index.normalize()).all():
            index = index.tz_convert(zone)
        index = index.tz_localize(None)
    else:
        parsed = [pd.Timestamp(stamp) for stamp in times]
        index = pd.DatetimeIndex([stamp if stamp.tzinfo is None else stamp.tz_convert(zone).tz_localize(None)
                                  for stamp in parsed])
    if index.hasnans:
        raise ValueError('CSV 有無效的交易日。')
    frame = pd.DataFrame(index=index.normalize().rename('交易日'))
    if frame.index.has_duplicates:
        raise ValueError('CSV 有同日多筆資料，請用日 K 匯出。')
    for k in ('open','high','low','close','volume'):
        col = columns.get(k) or (columns.get('成交量') if k == 'volume' else None)
        frame[k.title()] = pd.to_numeric(raw[col],errors='coerce').to_numpy() if col is not None else np.nan
    target = next((col for key,col in columns.items() if 'relative temperature' in key or key in ('qtemp','qtemp score','qtemp 分數')),None)
    if target is None:
        raise ValueError('CSV 缺少 QTemp 分數，請把 QTemp 指標加到 TradingView 圖表後再匯出。')
    frame['TradingView'] = pd.to_numeric(raw[target],errors='coerce').to_numpy()
    ohlc = frame[['Open','High','Low','Close']]
    if not (np.isfinite(ohlc).all(axis=1) & ohlc.gt(0).all(axis=1) & frame.High.ge(ohlc.max(axis=1)) & frame.Low.le(ohlc.min(axis=1))).all():
        raise ValueError('CSV 有無效的日 K 價格。')
    frame['Volume'] = frame.Volume.where(np.isfinite(frame.Volume) & frame.Volume.ge(0))
    if not frame.TradingView.notna().any():
        raise ValueError('CSV 的 QTemp 欄沒有數值。')
    return frame.sort_index()

def site_compare(requested, csv_text):
    try:
        symbol, raw, meta, zone = load_market(requested)
        yahoo = apply_price_basis(raw)
        frame = tv_csv_frame(csv_text,zone)
        now = datetime.now(ZoneInfo(zone))
        today = pd.Timestamp(now.date())
        frame = frame.loc[frame.index < today if now < closed_cutoff(now.date(),zone) else frame.index <= today]
        if len(frame)<20:
            raise ValueError('CSV 至少需要 20 根已收盤日 K。')
        tick = 10**(-int(meta.get('priceHint') or 2))
        same, _ = qtemp(frame, tick=tick)
        # Align start dates when comparing providers so EMA warm-up is comparable.
        span = yahoo.loc[frame.index[0]:frame.index[-1]]
        if span.empty:
            raise ValueError('Yahoo 與 CSV 的交易日沒有重疊，請核對標的。')
        yvalues, _ = qtemp(span,tick=tick)
        audit = pd.DataFrame({'TV 分數':frame.TradingView,'同一 CSV 重算':same.QTemp,'Yahoo 重算':yvalues.QTemp,
                              'TV 收盤':frame.Close,'Yahoo 收盤':span.Close,
                              'TV 成交量':frame.Volume,'Yahoo 成交量':span.Volume}).reindex(frame.index)
        audit['CSV 重算差'] = audit['同一 CSV 重算'] - audit['TV 分數']
        audit['Yahoo 重算差'] = audit['Yahoo 重算'] - audit['TV 分數']
        valid = audit[['CSV 重算差','Yahoo 重算差']].dropna()
        def different(a,b):
            comparable = audit[[a,b]].dropna()
            return int((~np.isclose(comparable[a],comparable[b],rtol=1e-7,atol=1e-8)).sum()),len(comparable)
        price_count, price_days = different('TV 收盤','Yahoo 收盤')
        vol_count, vol_days = different('TV 成交量','Yahoo 成交量')
        ohlc = ['Open','High','Low','Close']
        common = frame.index.intersection(span.index)
        different_ohlc = (~np.isclose(frame.loc[common,ohlc],span.loc[common,ohlc],rtol=1e-7,atol=1e-8)).any(axis=1).sum()
        volume_note = f'成交量不同 {vol_count}/{vol_days} 日' if vol_days else '無共同成交量可比對'
        if not frame.Volume.notna().any():
            volume_note = 'CSV 缺少有效成交量，同一 CSV 重算的量能權重為零'
        warm_note = '｜CSV 歷史不足 1,200 根，分位與 EMA 仍可能受圖表起點影響' if len(frame)<1200 else ''
        score_note = f'｜共同分數 {len(valid)} 日，平均絕對差：同一 CSV {valid["CSV 重算差"].abs().mean():.4f}、Yahoo {valid["Yahoo 重算差"].abs().mean():.4f}' if len(valid) else ''
        return ({'table':records(audit.tail(50).iloc[::-1].reset_index()),
                     'note': f'{symbol}｜OHLC 不同 {different_ohlc}/{len(common)} 日，其中收盤不同 {price_count}/{price_days} 日｜{volume_note}{score_note}{warm_note}。'})
    except Exception as error:
        return ({'error':f'無法對照：{error}'})

def market_details(symbol, frame, info, meta, zone):
    price = info.get('regularMarketPrice')
    stamp = info.get('regularMarketTime')
    try:
        quote_time = pd.to_datetime(stamp,unit='s',utc=True).tz_convert(zone).strftime('%Y-%m-%d %H:%M:%S %Z') if stamp else None
    except (TypeError, ValueError, OverflowError):
        quote_time = None
    fields = [('名稱',info.get('longName') or info.get('shortName')),('代號',symbol),
              ('交易所',info.get('fullExchangeName') or meta.get('fullExchangeName') or meta.get('exchangeName')),
              ('幣別',info.get('currency') or meta.get('currency')),('交易所時區',zone),
              ('Yahoo 報價',price),('Yahoo 報價時間',quote_time),('Yahoo 市況',info.get('marketState')),
              ('Yahoo 報價成交量',info.get('regularMarketVolume')),('Yahoo 漲跌幅',info.get('regularMarketChangePercent')),
              ('最近日 K 日期',frame.index[-1].date().isoformat()),('最近日 K 還原收盤',frame.Close.iloc[-1]),
              ('最近日 K 成交量',frame.Volume.iloc[-1]),('市值',info.get('marketCap')),
              ('近四季 EPS',info.get('trailingEps')),('本益比',info.get('trailingPE')),
              ('預估本益比',info.get('forwardPE')),('股價淨值比',info.get('priceToBook')),
              ('52 週最高',info.get('fiftyTwoWeekHigh')),('52 週最低',info.get('fiftyTwoWeekLow'))]
    return pd.DataFrame([{'項目':k,'數值':f'{v:,.4f}'.rstrip('0').rstrip('.') if isinstance(v,(float,np.floating)) and np.isfinite(v)
                          else f'{v:,}' if isinstance(v,(int,np.integer)) else str(v) if v is not None else '—'} for k,v in fields])

def records(frame):
    return {
        "columns": [str(c) for c in frame.columns],
        "rows": json.loads(frame.to_json(orient='values', date_format='iso', double_precision=10)),
    }


# 報價與回測資料分開：報價可能盤中變動，QTemp 只計算確認收盤的日線。
@lru_cache(maxsize=48)
def yahoo_quote(symbol, refresh_slot):
    ticker = yf.Ticker(symbol)
    quote = ticker.history(period='5d', interval='1m', auto_adjust=False,
                           prepost=False, timeout=15)
    if quote.empty:
        raise ValueError('Yahoo 尚未提供可用的分鐘報價')
    valid = quote[['Close']].dropna()
    if valid.empty:
        raise ValueError('Yahoo 分鐘報價缺少收盤價格')
    latest = valid.iloc[-1]
    stamp = valid.index[-1]
    zone = str(getattr(quote.index, 'tz', '') or ('Asia/Taipei' if symbol.endswith(('.TW','.TWO')) else 'America/New_York'))
    if getattr(stamp, 'tzinfo', None) is not None:
        local_time = stamp.tz_convert(zone)
    else:
        local_time = stamp.tz_localize(zone)
    last_price = float(latest.Close)
    # Yahoo regular session minute bar provides raw, unadjusted market prices.
    daily = ticker.history(period='7d', interval='1d', auto_adjust=False,
                           prepost=False, timeout=15)
    prev_close = None
    if not daily.empty:
        daily = daily.dropna(subset=['Close'])
        day = local_time.date()
        earlier = daily[pd.DatetimeIndex(daily.index).date < day]
        if not earlier.empty:
            prev_close = float(earlier.Close.iloc[-1])
        elif len(daily) > 1:
            prev_close = float(daily.Close.iloc[-2])
    change = last_price / prev_close - 1 if prev_close and prev_close > 0 else None
    volume = latest.get('Volume')
    return {'symbol': symbol, 'price': last_price, 'change': change,
            'volume': None if pd.isna(volume) else float(volume),
            'time': local_time.strftime('%Y-%m-%d %H:%M %Z'),
            'timestamp': int(local_time.timestamp()),
            'zone': zone, 'source': 'Yahoo Finance（分鐘行情，可能延遲）'}

def site_quote(requested):
    try:
        symbol = symbol_input(str(requested)[:100])
        if not re.fullmatch(r'[A-Z0-9.^=_-]{1,30}', symbol):
            raise ValueError('無效的股票代號')
        slot = int(pd.Timestamp.now(tz='UTC').timestamp() // 60)
        return yahoo_quote(symbol, slot)
    except Exception as error:
        return {'error': f'最新報價暫不可用：{error}'}

def site_closed_day(requested):
    try:
        symbol = symbol_input(str(requested)[:100])
        if not re.fullmatch(r'[A-Z0-9.^=_-]{1,30}', symbol):
            raise ValueError('無效的股票代號')
        _, frame, _, _ = load_market(symbol)
        return {'end': frame.index[-1].date().isoformat()}
    except Exception as error:
        return {'error': f'確認收盤日失敗：{error}'}

def site_search(query):
    try:
        return ({'choices': search_yahoo(str(query)[:100])})
    except Exception as error:
        return ({'error': f'Yahoo Finance 搜尋失敗：{error}'})


def summary_analytics(frame, values, events, years=10):
    """Historical QTemp descriptive statistics; never uses unfinished daily bars."""
    end = frame.index[-1]
    cutoff = end - pd.DateOffset(years=years)
    recent = values.loc[values.index >= cutoff, 'QTemp']
    clean = recent[np.isfinite(recent)].astype(float)
    current = float(values.QTemp.iloc[-1])
    edges = np.linspace(-100., 100., 21)
    bins = np.histogram(np.clip(clean.to_numpy(), -100, 100), bins=edges)[0].tolist()
    # The historical percentile measures the full displayed lookback, not the
    # indicator's rolling percentile transformation used to create QTemp.
    percentile = (100. * (np.count_nonzero(clean.to_numpy() < current)
                    + 0.5 * np.count_nonzero(clean.to_numpy() == current)) / len(clean)) if len(clean) else None
    closes = frame.Close
    close = float(closes.iloc[-1])
    peak = float(closes.max())
    fiftytwo = closes.iloc[-252:]
    recent_high = float(fiftytwo.max())
    recent_low = float(fiftytwo.min())
    dedup = events.drop_duplicates(['類型', '確認日'])
    dedup = dedup.sort_values('確認日')
    if not dedup.empty:
        latest = dedup.iloc[-1]
        signal = {'type': str(latest['類型']), 'day': latest['確認日'].date().isoformat(),
                  'price': float(latest['確認收盤價'])}
    else:
        signal = None
    firstyear = end.year - years + 1
    years_list = list(range(firstyear, end.year + 1))
    recent_events = dedup[dedup['確認日'].ge(pd.Timestamp(firstyear, 1, 1))]
    yearly_counts = {label: {str(year): 0 for year in years_list} for label in SIGNALS.values()}
    for (name, year), count in recent_events.groupby(['類型', recent_events['確認日'].dt.year]).size().items():
        if name in yearly_counts and str(year) in yearly_counts[name]:
            yearly_counts[name][str(year)] = int(count)
    return {
        'price': {'high52': recent_high, 'low52': recent_low, 'highAll': peak,
                  'from52High': close/recent_high-1, 'fromAllHigh': close/peak-1,
                  'volume': None if pd.isna(frame.Volume.iloc[-1]) else float(frame.Volume.iloc[-1])},
        'latestSignal': signal,
        'distribution': {'years': years, 'start': clean.index[0].date().isoformat() if len(clean) else None,
                         'end': clean.index[-1].date().isoformat() if len(clean) else None,
                         'sample': int(len(clean)), 'percentile': percentile,
                         'min': float(clean.min()) if len(clean) else None,
                         'max': float(clean.max()) if len(clean) else None,
                         'mean': float(clean.mean()) if len(clean) else None,
                         'belowNeg90': int((clean < -90).sum()),
                         'above90': int((clean > 90).sum()),
                         'edges': edges.tolist(), 'counts': bins},
        'heatmap': {'years': years_list, 'signals': yearly_counts,
                    'maxCount': max([c for row in yearly_counts.values() for c in row.values()] or [0])}
    }


def signal_forward_study(frame, events, years=10, horizons=(5, 20, 60, 120)):
    """Signal-confirmation-date forward study, using next session adjusted open.

    Confirmation is a close-of-day event; a next-session open entry prevents a
    same-bar trading assumption. All horizons require a full future window.
    Duplicate same-type signals confirmed on the same date count only once.
    """
    end = frame.index[-1]
    earliest = pd.Timestamp(end.year - years + 1, 1, 1)
    selected = (events.loc[
        events['確認日'].ge(earliest) & ~events['暫算'].astype(bool)
    ].drop_duplicates(['類型', '確認日']).sort_values('確認日'))
    opens = frame['Open'].to_numpy(dtype=float)
    closes = frame['Close'].to_numpy(dtype=float)
    lows = frame['Low'].to_numpy(dtype=float)
    highs = frame['High'].to_numpy(dtype=float)
    last_index = len(frame) - 1
    rows = []
    detail = []
    bullish = {'低估值', '底背離'}
    for label in SIGNALS.values():
        subset = selected.loc[selected['類型'].eq(label)]
        records_by_horizon = {h: [] for h in horizons}
        available = len(subset)
        for record in subset.itertuples(index=False):
            confirmation = int(record.確認位置)
            entry_index = confirmation + 1
            if entry_index > last_index:
                continue
            entry = opens[entry_index]
            if not np.isfinite(entry) or entry <= 0:
                continue
            direction = 1 if label in bullish else -1
            for h in horizons:
                exit_index = confirmation + h
                if exit_index > last_index:
                    continue
                exit_price = closes[exit_index]
                lo = np.min(lows[entry_index:exit_index+1])
                hi = np.max(highs[entry_index:exit_index+1])
                if not np.isfinite([exit_price, lo, hi]).all():
                    continue
                actual_return = float(exit_price / entry - 1.)
                directional = float(direction * actual_return)
                adverse = float(lo / entry - 1. if direction > 0 else 1. - hi / entry)
                favorable = float(hi / entry - 1. if direction > 0 else 1. - lo / entry)
                trade = {
                    'signal': label, 'confirmation': record.確認日.date().isoformat(),
                    'entry': frame.index[entry_index].date().isoformat(),
                    'exit': frame.index[exit_index].date().isoformat(),
                    'horizon': int(h), 'entryPrice': float(entry), 'exitPrice': float(exit_price),
                    'return': actual_return, 'directionalReturn': directional,
                    'mae': min(0., adverse), 'mfe': max(0., favorable)
                }
                records_by_horizon[h].append(trade)
                detail.append(trade)
        for h in horizons:
            trades = records_by_horizon[h]
            valid_count = len(trades)
            dr = np.array([trade['directionalReturn'] for trade in trades], dtype=float)
            rr = np.array([trade['return'] for trade in trades], dtype=float)
            rows.append({
                'signal': label, 'days': int(h), 'count': valid_count,
                'signals': available, 'excluded': available - valid_count,
                'winRate': float(np.mean(dr > 0)) if valid_count else None,
                'avgReturn': float(rr.mean()) if valid_count else None,
                'avgDirectional': float(dr.mean()) if valid_count else None,
                'medianDirectional': float(np.median(dr)) if valid_count else None,
                'avgMAE': float(np.mean([trade['mae'] for trade in trades])) if valid_count else None,
                'avgMFE': float(np.mean([trade['mfe'] for trade in trades])) if valid_count else None
            })
    detail.sort(key=lambda trade: trade['confirmation'], reverse=True)
    return {'years': years, 'horizons': list(horizons), 'rows': rows, 'details': detail[:1200],
            'method': '確認日收盤形成訊號；下一交易日以還原開盤價進場；第 N 根後續交易日以還原收盤價計算；只有未來資料完整的樣本列入；排除暖機期訊號；同類同日去重。'}

def site_analyze(requested):
    try:
        requested = symbol_input(str(requested)[:100])
        if not re.fullmatch(r'[A-Z0-9.^=_-]{1,30}', requested):
            raise ValueError('公司名稱請從搜尋結果選取。')
        symbol, raw, meta, zone = load_market(requested)
        frame = apply_price_basis(raw)
        ticker = yf.Ticker(symbol)
        info, info_error = optional_info(ticker)
        tick = 10**(-int(meta.get('priceHint') or 2))
        values, events = qtemp(frame, tick=tick)
        figure = chart_payload(frame, values, events)
        newest = values.iloc[-1]
        analytics = summary_analytics(frame, values, events)
        forward_study = signal_forward_study(frame, events)
        annual = {name: records(annual_table(frame,events,10,name)) for name in SIGNALS.values()}
        event_rows = events[events['確認日'].ge(pd.Timestamp(frame.index[-1].year-9,1,1))].drop_duplicates(['類型','確認日'])
        recent = frame.drop(columns='Adj Close').join(values[['QTemp','RSI']]).tail(120).reset_index()
        actions = raw.loc[raw.Dividends.fillna(0).ne(0) | raw['Stock Splits'].fillna(0).ne(0),['Dividends','Stock Splits']]
        return ({
            'symbol': symbol, 'name': info.get('shortName') or info.get('longName') or symbol,
            'market': info.get('fullExchangeName') or meta.get('fullExchangeName') or meta.get('exchangeName'),
            'currency': info.get('currency') or meta.get('currency'), 'zone': zone,
            'start': frame.index[0].date().isoformat(), 'end': frame.index[-1].date().isoformat(),
            'last': float(frame.Close.iloc[-1]), 'change': float(frame.Close.iloc[-1] / frame.Close.iloc[-2] - 1),
            'volume': None if pd.isna(raw.Volume.iloc[-1]) else float(raw.Volume.iloc[-1]),
            'qtemp': float(newest.QTemp), 'basis': 'Adj Close 還原', 'infoMissing': bool(info_error),
            'figure': figure, 'analytics': analytics, 'forwardStudy': forward_study,
            'annual': annual, 'returns': records(historical_returns(frame)),
            'events': records(event_rows[['類型','標記日','確認日','確認收盤價']].iloc[::-1]),
            'details': records(market_details(symbol,frame,info,meta,zone)),
            'daily': records(recent.iloc[::-1]), 'actions': records(actions.tail(50).reset_index().iloc[::-1]),
        })
    except Exception as error:
        return ({'error': f'無法載入：{error}'})

