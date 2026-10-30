# BMP Pro 2.0

BMP 生化甲烷潛能分析工具改版中。

## 新版試用（GitHub Pages）
網頁入口（需先於 Settings → Pages 將 Source 設為 **GitHub Actions**）：https://hwh0410.github.io/BMP-Pro/

- Excel / CSV 匯入、從 Excel 貼上、手動輸入每日產氣
- TS/VS 性質分析、植種空白扣除與累積單位產氣量
- 平行樣標準差及 Plotly 互動圖表
- JSON 專案儲存／讀取、CSV 結果匯出
- 手機及桌機響應式介面

**注意：** 此為 Phase 1 原型；目前尚未加入 Python SciPy 動力學擬合、完整多曲線比較、共醱酵比例工具。核心公式參考既有 `bmp_core.py`，尚未完成完整回歸驗證；研究或報告正式使用前請與原版計算結果交叉比對。當前 Excel/Plotly 套件使用 CDN，首次載入需要網路。

## 原始 Python Flask 基線
保留自 [Hugging Face BMP Pro v1](https://huggingface.co/spaces/hwh0410/BMP_Pro_v1) 的 Python 核心與舊版頁面，作為公式與數值驗證參考。舊版需要 Flask / Python，**無法直接透過 GitHub Pages 執行**。

```bash
pip install -r requirements.txt
python run_web.py
```

## 改版規劃
參閱 [設計需求](docs/REDESIGN_BRIEF.md)。

原版 LFS 背景圖片、Logo 尚未匯入；新介面並未依賴這兩張素材。
