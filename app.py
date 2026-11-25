"""Production WSGI entrypoint: gunicorn app:app"""
from flask import Flask, jsonify, request, send_file
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from qtemp_core import site_analyze, site_compare, site_search, site_quote, site_closed_day
from research_features import scan
from capital_backtest import capital_comparison
from research_insights import site_research
from qtemp_zones import site_zones
from deep_comparison import compare_deep
from financial_market import market_snapshot, official_news, macro_snapshot, market_history
from market_rankings import MARKETS, market_segment, rankings, taiwan_disclosures
from rti import get_earnings_reference, rti_snapshot, symbol_valid
from rti_backtest import backtest
from market_research import EVENT_CHANNELS, EQUITY_FEEDS, RESEARCH_COINS, event_research, news_events, taiwan_close
from crypto_data import crypto_market, crypto_resource, SORTS

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 3 * 1024 * 1024
_monitor_lock=Lock()
_monitor_started=monotonic()
_monitor={"requests":0,"errors":0,"lastError":None,"lastErrorAt":None,"lastSuccessfulApi":None,"sourceStatus":None}

def _monitor_result(error=None, source=None):
    now=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    with _monitor_lock:
        _monitor["requests"]+=1
        if error:
            _monitor["errors"]+=1
            _monitor["lastError"]="當前程序最近一次 API 請求異常"
            _monitor["lastErrorAt"]=now
        else:
            _monitor["lastSuccessfulApi"]=now
        if source:
            _monitor["sourceStatus"]=source

@app.get('/api/diagnostics')
def diagnostics():
    with _monitor_lock:
        result=dict(_monitor)
    result["uptimeSeconds"]=int(monotonic()-_monitor_started)
    result["checkedAt"]=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    result["scope"]="single_worker_since_start"
    result["sourceStatus"]="none" if result.get("sourceStatus") is None else result["sourceStatus"]
    return jsonify(result)

@app.get('/workspace_glass.css')
def workspace_glass_css():
    return send_file('workspace_glass.css',mimetype='text/css')

@app.get('/workspace_dashboard.js')
def workspace_dashboard_js():
    return send_file('workspace_dashboard.js',mimetype='application/javascript')

@app.get('/workspace_watchlist.js')
def workspace_watchlist_js():
    return send_file('workspace_watchlist.js',mimetype='application/javascript')


@app.get('/')
def index():
    return send_file('static/market_terminal_home.html')

@app.get('/research_features.js')
def extra_js():
    return send_file('research_features.js', mimetype='application/javascript')

@app.get('/research_features.css')
def extra_css():
    return send_file('research_features.css', mimetype='text/css')

@app.get('/platform_theme.css')
def platform_theme():
    return send_file('platform_theme.css', mimetype='text/css')

@app.get('/platform_navigation.js')
def platform_navigation():
    return send_file('platform_navigation.js', mimetype='application/javascript')

@app.get('/capital_backtest_ui.js')
def capital_backtest_ui():
    return send_file('capital_backtest_ui.js', mimetype='application/javascript')

@app.get('/capital_backtest.css')
def capital_backtest_css():
    return send_file('capital_backtest.css', mimetype='text/css')

@app.get('/research_insights_ui.js')
def research_insights_ui():
    return send_file('research_insights_ui.js', mimetype='application/javascript')

@app.get('/research_insights.css')
def research_insights_css():
    return send_file('research_insights.css', mimetype='text/css')

@app.get('/qtemp_zones.css')
def qtemp_zones_css():
    return send_file('qtemp_zones.css',mimetype='text/css')

@app.get('/qtemp_zones_ui.js')
def qtemp_zones_js():
    return send_file('qtemp_zones_ui.js',mimetype='application/javascript')

@app.get('/deep_comparison_ui.js')
def deep_comparison_ui_js():
    return send_file('deep_comparison_ui.js',mimetype='application/javascript')

@app.get('/deep_comparison.css')
def deep_comparison_css():
    return send_file('deep_comparison.css',mimetype='text/css')

@app.get('/favicon.svg')
def site_favicon():
    return send_file('favicon.svg', mimetype='image/svg+xml')

@app.after_request
def disable_market_response_caching(response):
    if request.path.startswith('/api/market/'):
        response.headers['Cache-Control']='no-store, max-age=0'
        response.headers['Pragma']='no-cache'
    return response

@app.get('/api/market/rankings/<market>')
def market_rankings_api(market):
    if market not in MARKETS:
        return jsonify(error='無效市場'), 404
    return jsonify(rankings(market))


@app.get('/api/market/crypto/assets')
def crypto_assets_api():
    page = request.args.get('page', '1')
    sort = request.args.get('sort', 'rank')
    order = request.args.get('order', 'desc')
    provider = request.args.get('provider', '')
    if not page.isascii() or not page.isdecimal() or len(page) > 6 or int(page) < 1 or sort not in SORTS or order not in ('asc', 'desc') or provider not in ('', 'CoinMarketCap', 'CoinGecko'):
        return jsonify(error='無效的資產分頁或排序'), 400
    try:
        return jsonify(crypto_market(int(page), sort, order, provider))
    except Exception:
        return jsonify(error='此排序的加密資產資料暫時無法取得'), 503


@app.get('/api/market/crypto/resources/<name>')
def crypto_resources_api(name):
    from urllib.error import HTTPError
    try:
        return jsonify(crypto_resource(name, request.args.get('id', ''),
                                       request.args.get('platform', ''), request.args.get('address', '')))
    except KeyError:
        return jsonify(error='找不到此資料類別'), 404
    except HTTPError as error:
        message = {401:'上游 API 授權失敗', 403:'目前方案未開放此資料',
                   404:'上游沒有這個標的', 429:'上游請求頻率達上限，請稍後重試'}
        return jsonify(error=message.get(error.code, '上游資料暫時不可用')), 503
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except Exception:
        return jsonify(error='加密市場資料暫時不可用'), 503


@app.get('/api/market/tw/close/<board>')
def taiwan_close_api(board):
    if board not in EQUITY_FEEDS:
        return jsonify(error='不支援的市場'), 404
    try:
        return jsonify(taiwan_close(board, int(monotonic() // 300)))
    except Exception:
        return jsonify(error='官方收盤資料暫時無法取得'), 503


@app.get('/api/market/crypto/events/<coin>')
def rti_events_api(coin):
    channel = request.args.get('channel', 'main')
    if coin not in RESEARCH_COINS or channel not in EVENT_CHANNELS:
        return jsonify(error='不支援的幣種或事件類型'), 400
    try:
        if request.args.get('study') == '1':
            return jsonify(event_research(coin, channel))
        return jsonify(events=news_events(coin, channel, int(monotonic() // 300)))
    except Exception:
        return jsonify(error='事件或小時 K 線來源暫時無法取得'), 503


@app.get('/api/market/tw/disclosures')
def taiwan_disclosures_api():
    return jsonify(taiwan_disclosures())


@app.get('/api/market/segment/<market>/<category>')
def market_segment_api(market, category):
    if market not in ('tw','us') or category not in ('index','etf'):
        return jsonify(error='無效市場分類'), 404
    return jsonify(market_segment(market,category))


@app.get('/api/rti/<symbol>')
def rti_api(symbol):
    symbol=symbol.upper()
    rank=request.args.get('rank',0,type=int)
    minimum=request.args.get('minimum',0,type=int)
    if not symbol_valid(symbol) or not (rank==0 or 30<=rank<=1000) or not (minimum==0 or 30<=minimum<=1000):
        return jsonify(error='請確認代號與分位範圍'),400
    try:
        return jsonify(rti_snapshot(symbol,rank,minimum,request.args.get('divergence')=='1',int(monotonic()//180)))
    except Exception:
        return jsonify(error='無法取得可用日線，請核對代號或稍後再試。'),503


@app.get('/api/rti/<symbol>/backtest')
def rti_backtest_api(symbol):
    symbol = symbol.upper()
    if not symbol_valid(symbol):
        return jsonify(error='請確認代號'), 400
    try:
        return jsonify(backtest(symbol, request.args.get('start', '2016-01-01'),
                                request.args.get('end', datetime.now(timezone.utc).date().isoformat()),
                                float(request.args.get('initial', '100000')),
                                float(request.args.get('allocation', '100')),
                                float(request.args.get('fee', '0.1')),
                                float(request.args.get('slippage', '0')),
                                int(request.args.get('delay', '1')),
                                request.args.get('split') or None,
                                request.args.get('audit') == '1'))
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except Exception:
        app.logger.exception('RTI backtest unavailable')
        return jsonify(error='歷史資料暫時無法取得，請稍後重試'), 503


@app.get('/api/rti/<symbol>/capital')
def rti_capital_api(symbol):
    import pandas as pd
    if not symbol_valid(symbol.upper()):
        return jsonify(error='標的代號無效'), 400
    def rti_provider(code, slot):
        data = rti_snapshot(code, 0, 0, False, slot)
        frame = pd.DataFrame(data['rows'])
        frame.index = pd.to_datetime(frame.pop('day'))
        for name in ('Open','High','Low','Close'):
            frame[name] = frame[name.lower()]
        events = pd.DataFrame([{'類型':'低估值','暫算':False,'確認位置':i,'確認日':frame.index[i]} for i, row in enumerate(data['rows']) if row['entry']=='buy' and row['stage']=='formal'], columns=['類型','暫算','確認位置','確認日'])
        return data['symbol'], frame, None, events
    try:
        result = capital_comparison(symbol.upper(), request.args.get('start','2016-01-01'),
                 request.args.get('end',datetime.now(timezone.utc).date().isoformat()),
                 request.args.get('initial','100000'), request.args.get('periodic','10000'),
                 request.args.get('frequency','monthly'), request.args.get('signal','10000'),
                 request.args.get('timing','end'), request.args.get('lump','match_dca'), snapshot_provider=rti_provider)
        result['strategies'][0]['name']='RTI 買入訊號'
        result['note']='RTI 歷史日線中的買入標記於該日收盤確認後，下一可交易日開盤投入，以避免使用當日完整 K 線在同日開盤交易。定投及單筆比較沿用原站資金流與風險計算；未計稅費、滑價與交易限制。'
        return jsonify(result)
    except ValueError as error:
        return jsonify(error=str(error)),400
    except Exception:
        app.logger.exception('RTI capital comparison failed')
        return jsonify(error='資料暫時無法取得'),503


@app.get('/api/rti/compare')
def rti_compare_api():
    import pandas as pd
    def rti_provider(symbol, slot):
        data = rti_snapshot(symbol, 0, 0, False, slot)
        rows = data['rows']
        frame = pd.DataFrame(rows)
        frame.index = pd.to_datetime(frame.pop('day'))
        frame['Close'] = frame['close']
        values = pd.DataFrame({'QTemp': frame['score']}, index=frame.index)
        return data['symbol'], frame, values, None
    try:
        result = compare_deep(request.args.get('symbols', 'SPY,QQQ'), request.args.get('benchmark', 'SPY'),
                              request.args.get('period', '10y'), request.args.get('start', ''),
                              request.args.get('end', ''), request.args.get('weights', ''),
                              request.args.get('rebalancing', 'none'), snapshot_provider=rti_provider)
        for asset in result['assets']:
            asset['rti'] = asset.pop('qtemp', None)
        result['notes'][0] = '股票為 Yahoo Finance Adj Close 還原日線，加密資產為 Yahoo Finance 已結束 UTC 日線。'
        return jsonify(result)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    except Exception:
        app.logger.exception('RTI comparison failed')
        return jsonify(error='比較資料暫時無法取得'), 503


@app.get('/api/rti/<symbol>/valuation')
def rti_valuation_api(symbol):
    symbol=symbol.upper()
    if not symbol_valid(symbol) or symbol.endswith('-USD'):
        return jsonify(error='此標的不支援歷史本益比'),400
    try:
        return jsonify(get_earnings_reference(symbol,int(monotonic()//21600)))
    except Exception:
        return jsonify(value=None,note='本益比資料來源暫不可用')


@app.get('/api/market/overview')
def market_overview_api():
    return jsonify(market_snapshot())

@app.get('/api/market/news')
def market_news_api():
    return jsonify(official_news())

@app.get('/api/market/macro')
def market_macro_api():
    return jsonify(macro_snapshot())

@app.get('/api/market/history/<path:symbol>')
def market_history_api(symbol):
    try:
        return jsonify(market_history(symbol,request.args.get('period','1y'),
                                      allow_lookup=request.args.get('lookup')=='1'))
    except ValueError as error:
        return jsonify({"error":str(error)}),400
    except Exception:
        app.logger.exception("Market history unavailable")
        return jsonify({"error":"市場資料暫時不可用"}),503

@app.get('/financial_portal.js')
def financial_portal_js():
    return send_file('financial_portal.js',mimetype='application/javascript')

@app.get('/financial_portal.css')
def financial_portal_css():
    return send_file('financial_portal.css',mimetype='text/css')

@app.get('/health')
def health():
    return jsonify({'status': 'ok'})

@app.post('/api/<method>')
def api(method):
    if method not in ('search', 'analyze', 'compare', 'quote', 'closed_day', 'scan', 'capital_comparison', 'research', 'zones', 'deep_compare'):
        return jsonify({'error': '不支援的操作'}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get('args'), list):
        return jsonify({'error': '請求格式不正確'}), 400
    args = payload['args']
    if (method in ('search','analyze','quote','closed_day','scan','research') and len(args) != 1) or (method == 'zones' and len(args) not in (1,3)) or (method == 'compare' and len(args) != 2) or (method == 'capital_comparison' and len(args) != 9) or (method == 'deep_compare' and len(args) != 7):
        return jsonify({'error': '參數數量不正確'}), 400
    if any(not isinstance(v, str) for v in args):
        return jsonify({'error': '參數必須為文字'}), 400
    if method == 'compare' and len(args[1]) > 2_000_000:
        return jsonify({'error': 'CSV 超過 2 MB'}), 400
    if method != 'compare' and len(args[0]) > 100:
        return jsonify({'error': '搜尋內容過長'}), 400
    try:
        result = {'search': site_search, 'analyze': site_analyze, 'compare': site_compare, 'quote': site_quote, 'closed_day': site_closed_day, 'scan': scan, 'capital_comparison': capital_comparison, 'research': site_research, 'zones': site_zones, 'deep_compare': compare_deep}[method](*args)
        if isinstance(result,dict):
            _monitor_result(result.get('error'),result.get('dataSourceStatus') or result.get('quality',{}).get('dataStatus'))
        else:
            _monitor_result()
        return jsonify(result)
    except ValueError as error:
        _monitor_result(error)
        return jsonify({'error': str(error)[:300]}), 400
    except RuntimeError as error:
        _monitor_result(error)
        app.logger.warning('Market data temporarily unavailable: %s', str(error)[:150])
        return jsonify({'error': 'Yahoo 歷史行情暫時無法取得：' + str(error)[:240]}), 503
    except Exception:
        _monitor_result('內部伺服器錯誤')
        app.logger.exception('API request failed')
        return jsonify({'error': '伺服器處理發生錯誤，請稍後重試'}), 500

@app.errorhandler(413)
def too_large(_):
    return jsonify({'error': '上傳檔案過大'}), 413

