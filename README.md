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
