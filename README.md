# BMP Pro 2.0

BMP 生化甲烷潛能分析互動式網站。基於 GitHub Pages，保留原 Hugging Face Flask/Python 核心作為計算參考。

## 新版試用（GitHub Pages）
網頁入口（需先於 Settings → Pages 將 Source 設為 **GitHub Actions**）：https://hwh0410.github.io/BMP-Pro/

- Excel / CSV 匯入、從 Excel 貼上、手動輸入每日產氣
- TS/VS 性質分析、植種空白扣除與累積單位產氣量
- 平行樣標準差及 Plotly 互動圖表
- JSON 專案儲存／讀取、CSV 結果匯出
- 手機及桌機響應式介面
- **實驗組別庫**：原料、組別代碼、操作條件、輸入數據與計算結果一起存到本機瀏覽器；支援載入、複製與刪除
- **跨組比較**：勾選已儲存組別，疊合累積曲線與查看產率表，支援比較 CSV 匯出
- **完整備份**：全部已儲存組別匯出／匯入 JSON，方便轉移到另一台裝置

**注意：** 此為持續開發版本（包含 Phase 2 的組別管理與比較）；目前尚未加入 Python SciPy 動力學擬合、獨立多曲線編輯工具、共醱酵比例計算工具。核心公式參考既有 `bmp_core.py`，尚未完成完整回歸驗證；研究或報告正式使用前請與原版計算結果交叉比對。當前 Excel/Plotly 套件使用 CDN，首次載入需要網路。

## 本機儲存與實驗資料安全

儲存組別使用目前瀏覽器的 localStorage，不會自動同步；無痕模式或清理網站資料可能造成遺失。建議定期使用「備份全部組別」功能。跨組比較針對**已儲存**的分析快照；若編輯目前組別，請再次點選「儲存目前組別」更新結果。

## 原始 Python Flask 基線
保留自 [Hugging Face BMP Pro v1](https://huggingface.co/spaces/hwh0410/BMP_Pro_v1) 的 Python 核心與舊版頁面，作為公式與數值驗證參考。舊版需要 Flask / Python，**無法直接透過 GitHub Pages 執行**。

```bash
pip install -r requirements.txt
python run_web.py
```

## 改版規劃
參閱 [設計需求](docs/REDESIGN_BRIEF.md)。

原版 LFS 背景圖片、Logo 尚未匯入；新介面並未依賴這兩張素材。


## Google Sheets 團隊雲端同步（測試版）

資料庫：[BMP_Pro_Database](https://docs.google.com/spreadsheets/d/1rPBgNKLWY1RaSqTA_lipTEV3Bdeo6KoOvej6oaDZefI/edit)。
- 網站使用 Google Identity Services，請用授權的 Google 帳號登入；OAuth scope 為 `https://www.googleapis.com/auth/spreadsheets`（讀寫），Client ID 可公開，但不要在前端加入 Client Secret。
- 「上傳目前組別快照」會先要求確認，新增一組唯一 ID 的 `Projects`、`Groups`、`TSVS_Data`、`Gas_Data`、`Results`；不覆蓋既有雲端資料。
- 「讀取雲端組別」從 `Results` 讀取**已完成的快照**；可以將個別組別匯入本機組別庫，之後再載入與比較。
- 同步需要網路。Google Sheets 修改權限由試算表分享設定控制；Viewer 無法上傳。所有存取權杖只保存在目前分頁的記憶體中。
- **限制與風險**：此為 append-only 原型，跨工作表寫入不是交易性／原子性操作。中途寫入失敗可能留下未完成資料列；`Results` 最後寫入作為完成標記。不要用正式研究資料做首次測試，先用示範數據驗證。
- 目前不支援原地更新、刪除雲端組別、交易式衝突鎖定；雲端快照不會自動隨本機修改更新。每次雲端儲存會建立一個新快照。
- 初期雲端已完成快照列表最多讀取 999 筆；單筆序列化資料長度限制約 42,000 字元。正式上線前應加入分頁、備份、數據一致性及跨帳號權限測試。

## 雲端組別管理 v2（2026-11-03）

- 雲端列表按專案名稱篩選，並顯示最新分析組別與最終產率。
- 點「載入並編輯」可把已保存的雲端組別資料帶回工作台；保留原本 `group_id`，上傳時將 `input_revision` 加一。
- 雲端儲存前重新讀取 `Results`，如版本已被別人更新則拒絕直接覆寫，要求先載入新版。
- 每次修改會以新版本附加 `Groups`、`TSVS_Data`、`Gas_Data`、`Results`、`Revisions`，舊版快照仍可查看。寫入採一次 `spreadsheets.batchUpdate`，降低跨工作表部分提交的風險。
- 沿用原本的 `compute()` 與 `bmp_core.py` 基準，未修改 BMP 公式。
- 舊版沒有 `projectId` 的快照可在後續儲存時補建對應的 `Projects` 紀錄。
- 不支援真正的交易式行鎖：兩位編輯者若同時在版本檢查後提交，仍可能產生相同版本號。頁面將標示此類衝突並停止直接編輯，後續需要後端交易性資料庫才能徹底避免。
- 此版本尚待實際瀏覽器跨帳號整合驗收；請使用示範實驗測試「載入 v1 → 修改 → 儲存 v2 → 刷新 → 查看歷史版本」，不要先用正式研究資料測試。
