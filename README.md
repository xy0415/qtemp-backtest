# QTemp 技術指標回測

這是由原本 Google Colab 筆記本轉換的公開網站版本。保留原有 QTemp 計算、Adj Close 還原、Yahoo Finance、年度統計、K 線以及 TradingView CSV 對照。

## Render 部署（推薦）
1. 將此資料夾中的檔案上傳到 GitHub 的 `xy0415/qtemp-backtest` 儲存庫根目錄（請上傳解壓縮後的檔案，不是 ZIP）。
2. 在 https://dashboard.render.com 登入，選擇 `New` → `Blueprint`，連接 GitHub 儲存庫並選取 `render.yaml`。
3. 確認方案為 Free，按 `Deploy Blueprint`，部署完成後取得 `onrender.com` 網址。
4. 免費服務可能閒置休眠，首次開啟速度較慢；Yahoo Finance 可能對雲端機房 IP 限流，公開服務不保證即時資料持續可用。

## 本機測試
```bash
pip install -r requirements.txt
python -m flask --app app run
```
開啟 http://127.0.0.1:5000

## 架構
- `app.py`：Flask 後端與 API。
- `qtemp_core.py`：Colab 原有計算邏輯，僅移除 Colab 專用回傳包裝。
- `index.html`：原有白底 UI 和 TradingView Lightweight Charts，透過 `/api/*` 呼叫後端。
- `requirements.txt`：Python 依賴。
- `render.yaml`：Render 部署設定。

## 注意事項
- 歷史資料使用 Yahoo Finance；顯示回測結果不能視為交易建議。
- 原本 Colab 指標和 TradingView 分數差異並未在此次轉換中重新校準，計算核心未更改。
- 圖表元件由 CDN 動態下載，使用者瀏覽器須有網路連線。
