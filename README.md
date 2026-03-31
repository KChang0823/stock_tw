# 📈 台灣高股息價值選股器 (Stock Valuation Tool)

基於 **FinMind Data API** 與專業 **四分位階估價模型** 打造的自動化選股工具。本專案能自動推估 EPS、預測股利，並計算出精確的買賣位階。

## ✨ 特色功能
- **ETF 模式支援**：完整支援 0050、00878、00929 等熱門 ETF，自動解析成分股並修正中文亂碼。
- **動態殖利率估價**：買入/賣出殖利率滑桿與「一鍵重置」功能，支援即時位階試算。
- **營收動能追蹤**：自動計算每檔股票「連續幾個月營收 YoY 為正」，前端可排序，≥6 個月綠色強調。
- **數據備援機制**：深度整合 FinMind 與 yfinance，支援上櫃 (.TWO) 及無配息股票（如 2498）。
- **頂級 Fintech UI**：深色模式玻璃擬態設計，優化大字體排版（28px-48px）與響應式佈局。


## ⏰ 自動化更新
本專案透過 GitHub Actions 於 **每日下午 1:30 (台灣時間)** 自動觸發數據重新計算，確保估價資訊與市場同步。

## 🚀 快速啟動

### 1. 後端（Python 估價腳本）
```bash
pip install -r requirements.txt

# 設定 Supabase 環境變數
export SUPABASE_URL="your-supabase-url"
export SUPABASE_KEY="your-supabase-key"

# 手動執行一次估價更新
python scripts/daily_update.py
```

### 2. 前端（Next.js）
```bash
cd web
npm install

# 建立 .env.local，填入 Supabase 連線資訊
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

npm run dev
```


## 🛠 核心架構
- `web/`: Next.js 前端，負責 UI 與即時估價重算。
- `valuation_engine.py`: 邏輯層，實作所有核心估價公式與營收動能計算。
- `data_loader.py`: 資料層，透過 FinMind API 獲取財報、股價及月營收數據。
- `scripts/daily_update.py`: 每日排程腳本，批次估價並寫入 Supabase。
- `邏輯.md`: 專案核心計算邏輯與公式定義說明文件。

## 📊 估價公式參考
詳細公式請參閱 [邏輯.md](./邏輯.md)。核心概念：
- **買入位階**：現金股利 × 16 倍 (對應 6.25% 殖利率)
- **賣出位階**：現金股利 × 32 倍 (對應 3.125% 殖利率)
- **除權修正**：1 + (股票股利 / 10)

## ⚖️ 免責聲明
本專案僅供開發與邏輯驗證參考，不構成任何投資建議。投資一定有風險，投資前請審慎評估。
