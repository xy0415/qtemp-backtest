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


## 進階量化研究（2026-11）
網站在原有回測分頁之外，提供獨立「進階量化研究」面板：
- 圖表 SMA20、EMA55、BB(20,2)、訊號開關、全螢幕與 PNG。
- 多標的掃描器（最多 6 檔，QTemp 分數、最近訊號、距高點回撤）。
- 可設定 QTemp 門檻、最長持有日與雙邊交易費率的多頭單倉回測。
- 多標的相對績效（最多 4 檔）與資金曲線。
- 本機自選股、手動檢查及瀏覽器通知（僅在瀏覽器允許且頁面操作期間）。
- CSV、PNG、瀏覽器列印成 PDF 與包含代號的分享連結。

### 回測假設
- QTemp 訊號僅在「已確認日 K」計算；交易訊號在前一根收盤成立，下根開盤才執行。
- 股票價格以 Yahoo Finance 的 Adj Close 還原 OHLC；指標公式維持不變。
- 單一全額多頭部位，不放空、不槓桿、不重疊交易。
- 進場：昨日收盤 QTemp <= 進場門檻；出場：昨日收盤 QTemp >= 出場門檻或達到最長持有交易日。
- 每次進出收取使用者設定的費率，未納入滑價、個別稅制、借貸利息、流動性限制。
- 本模組是策略研究工具，不應將回測結果直接視為可實現報酬。
- 公開版為維持 Render Free 效能，掃描最多 6 檔、比較最多 4 檔。

### 可選的 Discord 定時訊號通知
GitHub 已加入 `.github/workflows/qtemp-signals.yml`，固定於台灣工作日早上 07:30 左右檢查已確認的日 K。GitHub 排程可能延遲。

**此功能預設不會發送通知**，需由儲存庫管理者完成下列設定：
1. 在 GitHub Repository → Settings → Secrets and variables → Actions 建立 Repository secret，名稱固定為 `DISCORD_WEBHOOK_URL`，值為 Discord Webhook URL。不要貼到 `index.html`、`alert_watchlist.json` 或公開程式碼。
2. 編輯 `alert_watchlist.json` 中的 `symbols`、`signals`，為排程指定追蹤清單。此檔案是**伺服器通知清單**，與訪客瀏覽器內的個人自選股不同步。
3. 在 Actions 中查看 `QTemp confirmed daily signals` 的執行紀錄，必要時手動觸發 `workflow_dispatch` 進行測試。手動重複觸發可能重送訊號。
4. 即使排程已執行，只有當天新確認且符合清單的訊號才嘗試寄送；無新訊號時不會發訊息。

提醒：Webhook 屬機密憑證，若曾在公開對話或儲存庫揭露，應在 Discord 重新產生並更換。

### 技術與驗證
- `research_features.py`：掃描、策略績效、跨標的比較 API。
- `research_features.js`、`research_features.css`：白底研究面板及響應式介面。
- `qtemp_alerts.py`、`alert_watchlist.json`：Discord 排程程式與監控名單。
- `.github/workflows/qtemp-ci.yml`：Python 編譯、JavaScript 語法、Flask API smoke tests。
- 公開 Render 部署需另確認 Logs、Yahoo Finance 連線與實際回測數據；CI 通過不等於行情服務保證可用。

## 深色分頁平台（2026-11-12）
新增深色多分頁設計，版面參考金融資料平台的專業風格，保留 QTemp 實際分析功能：
- `platform_theme.css`：深色視覺、資訊卡片、響應式布局與配色。
- `platform_navigation.js`：Hash 路由導覽，使用 `#overview`、`#chart`、`#signals`、`#scanner`、`#strategy`、`#compare`、`#watchlist`、`#resources` 切換頁面。
- 桌面版頁首選單，手機版下拉導覽，內頁麵包屑與研究子標籤頁；研究表格每頁 15 筆，避免無止境下滑。
- 深色 TradingView 圖表、量化研究卡片與主題一致的功能按鈕。
- 「研究資源」集中展示公式、行情資料、TradingView 對照與匯出功能。
- 原有公開 API、QTemp 公式、歷史統計和訊號判斷均保留。頁面路由屬客戶端導航，網址不變。
- 首頁的折線裝飾明確註明「示意線圖，非真實價格」；實際 QTemp 與行情卡片使用 Yahoo Finance 返回資料。沒有實際用戶帳號、資產託管、買賣交易或保證即時報價功能，不宣稱相關認證。

## 長期策略投入比較（2026-11-12）
網站的「策略回測」已更換為三種長期資金流回測：
- **QTemp 低估值**：期初 IA 投入，當既有 QTemp 指標的「低估值」訊號在收盤確認後，於下一交易日開盤追加指定金額；全程不賣出。標記日不是可交易日，暖機期訊號及同日重複訊號皆不計。
- **定期定額**：期初 IA 投入，依所選頻率（每週、每月、每季、每半年或每年）每期投入使用者指定的固定金額；以指定起點建立日曆週期，首尾不足一期也投入完整一期。期初於該週期第一個交易日**開盤**投入，期末於該週期最後交易日**收盤**投入。
- **每期定額金額**：使用者直接輸入每一期的投入金額，不再輸入年度 CFA。
- **單筆投入**：預設將與定投策略相同的整段預計投入總本金（IA + 所有定投）一次於期初投入，便於比照使用者提供的實例；可改選僅投入 IA。此期初取得未來定投預算是假設比較，非所有投資人當時具有該資金。
- 歷史日線最大取 Yahoo Finance 可以提供的全部，回測期間由使用者輸入，最長 45 年；若選定開始日期早於實際上市資料超過 14 天，要求修改日期，不以晚上市日冒充原始起始日。
- 以 Yahoo Adj Close 還原開高低收價格，允許小數股；回測不計交易手續費、稅、滑價及交易量限制。
- 輸出財富曲線、累積投入本金虛線、歷史累計報酬率曲線、PNG、績效對照表，包含總投入、期末資產、損益、總報酬、XIRR、最大回撤與年化波動。
- **比較限制**：QTemp 策略與定投策略的實際投入本金一般不同，總財富絕對值不能作為策略優劣的唯一判斷。總報酬 = 期末財富 / 累計投入 − 1，並非時間加權報酬；XIRR 使用實際日期與出入金現金流。資金流調整的最大回撤、波動率僅為日頻近似。
- 關聯檔案：`capital_backtest.py`、`capital_backtest_ui.js`、`capital_backtest.css`，另有 `test_capital_backtest.py` 離線價格測試。


## QTemp 區間統計與最新狀態（2026-11-13）

網站「總覽」第四張卡片改成 **最新狀態**，依最新已確認日 K 的 QTemp 數值分類，取代「最近一次歷史訊號」的名稱。主選單新增 **區間統計**，展示近十年已確認有效 QTemp 交易日數、年度區間熱力圖、真實分數直方圖、平滑經驗密度線與目前分數位置標線。

分區採嚴格數值條件，抄底區優先於定投區間：
- QTemp < −95：抄底區
- −95 ≤ QTemp < −75：定投區間
- −75 ≤ QTemp ≤ 75：中性區間
- 75 < QTemp < 95：趨勢極強
- QTemp > 95：高估值區間
- QTemp = 95：95 臨界值（單列，避免違背嚴格不等號）

抄底區只有 **最新已確認收盤日當日確實產生 QTemp 訊號** 才列出「抄底參考點位」，同時提供未還原原始收盤價及 Adj Close 還原收盤價。該價格是已確認日 K 的參考點，不保證當時能成交；既有策略回測仍採次日還原開盤價買入。分布統計排除 QTemp 暖機日，並以每個有效交易日計數，不用模擬行情。鐘形圖上的平滑線來自實際觀測分數的平滑直方圖，**不是假定服從常態分布**。

驗證：`python -m unittest -v test_qtemp_zones`，包含嚴格門檻、暖機剔除、年度加總及只顯示當日確認訊號。

## QTemp 資料品質、訊號事件研究與交易明細（2026-11-12）

- **研究資源 → 資料品質**：顯示 Yahoo Finance 資料來源、查詢 UTC 時間、資料最晚確認收盤日、使用的日線範圍、交易所日曆缺失天數、Adj Close 還原狀態、暖機期、有效 QTemp 樣本與確認訊號次數。僅在交易所日曆可用時報告缺失交易日數；無支援時呈現「無法判定」。
- **訊號研究 → 事件研究**：以訊號確認日收盤為第 0 天，固定採用前 20 根、後 120 根完整已收盤日 K（每 5 根取 1 點），統計平均、中位數及 10～90 百分位的歷史還原價格路徑。前後資料不足者排除。不是「訊號確認日當下可以成交」的承諾；重疊事件不保證獨立。
- **訊號研究 → 訊號日曆**：以真實確認日歸年歸月，排除暖機與同類同日重複訊號；四種類型以原本的藍、紅、綠、橘色標示，點選有訊號的日期可跳至 K 線。
- **策略回測 → 逐筆買入明細**：可切換 QTemp 低估值、定期定額與單筆投入；每筆列出確認日（若有）、實際成交日、價格、投入金額、新增股數、累積股數、持股成本、平均成本、當日持股市值及該筆股數在期末的估算市值。每頁 20 筆，另提供 CSV；資料量最多顯示 2500 筆/策略，其餘須進一步批次分頁開發。
- **行情圖表**：自訂日期區間、起訖範圍滑桿、滾輪與按住拖曳、局部放大縮小、K 線/成交量/QTemp/背離線/訊號箭頭開關、最新收盤價與 QTemp 標籤、PNG 匯出。
- **資料可靠性**：維持同一 Yahoo Finance 歷史來源，成功驗證的完整已收盤 OHLC、Adj Close 另存為可檢驗 JSON 快取。正常快取有效 15 分鐘，遇到資料限制最多兩次查詢、簡短退避，無法取得新資料時只可退回 7 天內已驗證的檔案，並明確標記 `stale_backup`。備份在 Render `/tmp`、**非永久儲存**：服務重建後可能消失，沒有備份時會報錯，不會用其他未知資料源或虛構股價。報價仍可能受 Yahoo 401/429、延遲及市場時段限制。

測試：`python -m unittest -v test_capital_backtest test_research_insights test_market_cache`；另外檢查 `node --check research_insights_ui.js`、圖表腳本與 Flask API。GitHub Actions `QTemp validation` 也會執行這些測試。回測結果僅供歷史研究，不代表實際可獲利的成交價格或未來報酬。

## 注意事項
- 歷史資料使用 Yahoo Finance；顯示回測結果不能視為交易建議。
- 原本 Colab 指標和 TradingView 分數差異並未在此次轉換中重新校準，計算核心未更改。
- 圖表元件由 CDN 動態下載，使用者瀏覽器須有網路連線。
