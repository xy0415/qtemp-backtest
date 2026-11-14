# QTemp Analytics

以真實 Yahoo Finance 已確認日線為基礎的 QTemp 量化研究平台。提供行情圖表、訊號研究、策略投入回測、多資產比較、自選股及資料品質檢查。**不提供即時保證報價、交易執行或投資建議。**

線上網站：https://qtemp-backtest.onrender.com/

## 現行網站架構（2026-11-14）

六個主要入口：**總覽／行情圖表／訊號研究／策略回測／標的比較／自選股**。歷史「區間統計」已整合於**訊號研究 → 區間統計**；研究資源（資料品質、公式、TradingView CSV 對照、匯出）從頁首 **資料與說明** 或頁尾入口進入。原 `#zones`、`#resources` 連結仍可使用，避免舊分享連結失效。

- **總覽**：目前標的、QTemp 分數、歷史百分位、最新區間狀態與資料截止日。重複的完整分布圖與熱力圖不在總覽展示。
- **行情圖表**：確認日 K、還原 OHLC、QTemp、訊號標記、技術圖表拖曳與區間縮放、PNG 匯出。
- **訊號研究**：歷史勝率、訊號事件研究、訊號日曆、年度統計與 QTemp 分數區間。QTemp 分數區間包含歷史直方圖、年度天數熱力圖與目前分數位置。
- **策略回測**：QTemp「低估值」確認後下一交易日開盤追加固定金額、定期定額、期初單筆投入三種只買不賣策略。提供 XIRR、資金流調整後風險、買入交易明細與 CSV。
- **標的比較**：最多四個資產、SPY/QQQ/SOXX 基準、長期及自訂期間、同日配對績效、相關矩陣與可選再平衡組合；預設表只展示核心報酬風險，低頻使用的 Sortino、Calmar、Beta、Alpha 等保留於可展開「進階統計」。
- **自選股**：本機儲存分組、備註、排序、查詢及 JSON 匯入／匯出；通知有兩類：*分數低於門檻的區間提醒*（不等於新訊號）與*最新已確認日 K 當天的新訊號*。排除暫算訊號，兩類去重獨立。

## 主要金融計算與資料限制

- 歷史行情使用 Yahoo Finance 已確認日 K，計算與比較使用 **Adj Close 比例還原的 OHLC**。未取得資料的日期不補虛構價格，不保證即時行情；快取與過時備援會在資料品質頁標示。
- QTemp 核心公式保留於 `qtemp_core.py`，未經本次網站精簡改動。確認日訊號在收盤成立；回測按下一交易日還原開盤價執行，不用未來資料。
- 最佳／最差年度報酬僅納入具備**前一年底收盤基準**、同一曆年首末完整範圍與足夠共同交易日的年度；不完整年度顯示空值，而非冒充全年報酬。
- 三策略日報酬採**入金時間分段的時間加權計算**：日初投入計入當日盤中，日末投入不計當日報酬；原持股透過開盤市值區分隔夜和日內變動。無持倉時不得產生虛假報酬。XIRR 仍以實際現金流與期末市值計算。
- 多資產資料以所有標的與基準的共同有效交易日配對；年化 Sharpe/Sortino/Alpha 使用 252 日和零無風險利率。不同幣別未換匯，槓桿 ETF 每日重設且可能有波動耗損；組合模擬不計費用、稅、滑價、融資及限制。
- 監控面板是**目前回應程序自啟動後**的 API 使用與錯誤次數，不是全站或 Yahoo 整體 SLA。Render 重新部署／程序重啟會歸零。
- 自選股資料只存在目前瀏覽器，請使用 JSON 匯出備份。網站開啟且使用者允許時才可能發送瀏覽器通知，不代表伺服器會持續監控。

## 技術構成

- `app.py`：Flask API 與前端資源服務。
- `qtemp_core.py`：原始 QTemp、訊號、日線還原、TradingView CSV 對照。
- `research_features.py`：共用 QTemp 快取與自選股確認訊號掃描。
- `capital_backtest.py`：長期三策略與資金流績效。
- `deep_comparison.py`：多資產報酬、風險、相關與組合。
- `research_insights.py`、`qtemp_zones.py`：資料品質、事件研究、訊號與區間統計。
- `index.html`、`platform_navigation.js`、`workspace_glass.css` 及各功能 UI/樣式：白底藍紫色 Liquid Glass 多頁設計。
- `market_cache.py`：已驗證 Yahoo 歷史日線 JSON 暫存，短期快取與最多七天的可標示過時備援。Render `/tmp` 非永久儲存，不能保證部署後有備援。
- `.github/workflows/qtemp-ci.yml`：Python 編譯、JavaScript 語法、金融計算及 Flask 路由煙霧測試。

已淘汰舊版固定近五年 `compare_assets` API 和舊單倉買賣 `strategy` API，以免與正式多資產比較／長期投入回測採用不同口徑。**TradingView CSV 的 `compare` API 仍保留，供指標計算核對。**

## 本機啟動與驗證

```bash
pip install -r requirements.txt
python -m unittest -v test_capital_backtest test_deep_comparison test_financial_audit test_watchlist_audit test_research_insights test_market_cache test_qtemp_zones
python -m flask --app app run
```

開啟 http://127.0.0.1:5000 。CI 只涵蓋確定性、離線測試；仍需獨立確認 Render 健康檢查、Yahoo Finance 連線、瀏覽器互動及實際行情口徑。離線測試的合成價僅供演算法驗證，**不會成為公開網站顯示行情**。

## Render 部署

本專案已以 `render.yaml` 在 Render 部署。Render Free 可能因閒置休眠；Yahoo Finance 可能限制雲端機房 IP。網站無法取得有效價格時應明確回報錯誤，不得任意填入模型資料。

## GitHub Actions 可選的 Discord 日線訊號

`.github/workflows/qtemp-signals.yml` 可在台灣工作日上午排程檢查已確認訊號。通知預設不會發送：管理者需於 GitHub Repository Secrets 建立 `DISCORD_WEBHOOK_URL` 並設定 `alert_watchlist.json`。這份伺服器清單與使用者瀏覽器中的自選股互不相通。Webhook 屬敏感憑證，不得上傳到公開程式碼。

---
本網站僅作歷史研究，結果不是投資建議；未經過完整實際交易成本及市場情境驗證，不能把回測績效視為未來獲利承諾。
