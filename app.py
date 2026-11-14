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
    return send_file('index.html')

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
    if (method in ('search','analyze','quote','closed_day','scan','compare_assets','research','zones') and len(args) != 1) or (method == 'compare' and len(args) != 2) or (method == 'capital_comparison' and len(args) != 9) or (method == 'deep_compare' and len(args) != 7):
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
