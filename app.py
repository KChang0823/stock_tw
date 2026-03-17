import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from valuation_engine import ValuationEngine
from data_loader import StockDataLoader

# --- 頁面配置 ---
st.set_page_config(
    page_title="高股息價值選股器",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- 專業設計風格 (Fintech Dark Mode) ---
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'IBM Plex Sans', sans-serif;
    }
    
    .stApp {
        background-color: #0F172A;
        color: #F8FAFC;
    }
    
    /* 玻璃擬態卡片 */
    .metric-container {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
    }
    
    .signal-buy { color: #22C55E; font-weight: 700; font-size: 2rem; }
    .signal-sell { color: #EF4444; font-weight: 700; font-size: 2rem; }
    .signal-track { color: #6366F1; font-weight: 700; font-size: 2rem; }
    
    /* 隱藏預設元件 */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    </style>
    """, unsafe_allow_html=True)

# --- 初始化 Engine ---
@st.cache_resource
def get_engine():
    loader = StockDataLoader()
    return ValuationEngine(loader)

engine = get_engine()

# --- UI 佈局 ---

# 1. 頂部輸入區 (類 HTML 佈局)
st.title("高股息平合理價評估系統")
col_input, _ = st.columns([2, 5])
with col_input:
    stock_ids_input = st.text_input("輸入股票代號 (多個請用逗號隔開)", "2317, 2330, 2454")

stock_list = [s.strip() for s in stock_ids_input.split(",") if s.strip()]

# 2. 指標卡片區 (零件展示)
results = []
for sid in stock_list:
    try:
        data = engine.get_valuation_data(sid)
        if "error" not in data:
            results.append(data)
    except Exception as e:
        st.error(f"無法載入代碼 {sid}: {e}")

if results:
    # 3. 數據總表 (Col A, Col B, Col C, Col D)
    st.subheader("📊 多股評比清單")
    
    display_data = []
    for r in results:
        display_data.append({
            "股票": r["stock_id"],
            "現價": r["current_price"],
            "預估 EPS (低)": r["eps_predict"]["low"],
            "預估現金股利": round(r["dividend_predict"]["cash_low"], 2),
            "低買入價": round(r["valuation"]["buy_low"], 2),
            "高買入價": round(r["valuation"]["buy_high"], 2),
            "低賣出價": round(r["valuation"]["sell_low"], 2),
            "高賣出價": round(r["valuation"]["sell_high"], 2),
            "訊號": r["signal"]
        })
    
    df = pd.DataFrame(display_data)
    st.dataframe(df, use_container_width=True, hide_index=True)

else:
    st.info("請輸入有效的股票代號開始分析。")
