"""Production WSGI entrypoint: gunicorn app:app"""
from flask import Flask, jsonify, request, send_file
from qtemp_core import site_analyze, site_compare, site_search, site_quote, site_closed_day
from research_features import scan, compare as compare_assets, strategy

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 3 * 1024 * 1024

@app.get('/')
def index():
    return send_file('index.html')

@app.get('/research_features.js')
def extra_js():
    return send_file('research_features.js', mimetype='application/javascript')

@app.get('/research_features.css')
def extra_css():
    return send_file('research_features.css', mimetype='text/css')

@app.get('/health')
def health():
    return jsonify({'status': 'ok'})

@app.post('/api/<method>')
def api(method):
    if method not in ('search', 'analyze', 'compare', 'quote', 'closed_day', 'scan', 'compare_assets', 'strategy'):
        return jsonify({'error': '不支援的操作'}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get('args'), list):
        return jsonify({'error': '請求格式不正確'}), 400
    args = payload['args']
    if (method in ('search','analyze','quote','closed_day','scan','compare_assets') and len(args) != 1) or (method == 'compare' and len(args) != 2) or (method == 'strategy' and len(args) != 5):
        return jsonify({'error': '參數數量不正確'}), 400
    if any(not isinstance(v, str) for v in args):
        return jsonify({'error': '參數必須為文字'}), 400
    if method == 'compare' and len(args[1]) > 2_000_000:
        return jsonify({'error': 'CSV 超過 2 MB'}), 400
    if method != 'compare' and len(args[0]) > 100:
        return jsonify({'error': '搜尋內容過長'}), 400
    try:
        result = {'search': site_search, 'analyze': site_analyze, 'compare': site_compare, 'quote': site_quote, 'closed_day': site_closed_day, 'scan': scan, 'compare_assets': compare_assets, 'strategy': strategy}[method](*args)
        return jsonify(result)
    except Exception:
        app.logger.exception('API request failed')
        return jsonify({'error': '伺服器處理發生錯誤，請稍後重試'}), 500

@app.errorhandler(413)
def too_large(_):
    return jsonify({'error': '上傳檔案過大'}), 413
