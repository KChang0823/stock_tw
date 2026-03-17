import streamlit as st
import pandas as pd
from valuation_engine import ValuationEngine
from data_loader import StockDataLoader

# --- 頁面配置 ---
st.set_page_config(
    page_title="ETF 成份股評估系統",
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
    
    /* 膠囊按鈕樣式 */
    .stButton > button {
        border-radius: 20px;
        background-color: rgba(99, 102, 241, 0.2);
        color: #6366F1;
        border: 1px solid #6366F1;
        padding: 2px 12px;
        font-size: 0.8rem;
    }
    .stButton > button:hover {
        background-color: rgba(99, 102, 241, 0.4);
        border: 1px solid #818CF8;
    }
    
    /* 隱藏預設元件 */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    </style>
    """, unsafe_allow_html=True)

# --- 初始化 ---
if 'etf_list' not in st.session_state:
    st.session_state.etf_list = []

def get_engine():
    loader = StockDataLoader()
    return ValuationEngine(loader)

engine = get_engine()

# --- UI 佈局 ---

st.title("ETF 成份股評估系統")

# 1. ETF 搜尋區域
col_input, _ = st.columns([2, 5])
with col_input:
    # 使用 st.form 讓輸入更順暢
    with st.form("etf_form", clear_on_submit=True):
        new_etf = st.text_input("輸入 ETF 代號 (例如 0050, 0056)").strip()
        submit = st.form_submit_button("新增 ETF")
        if submit and new_etf:
            if new_etf not in st.session_state.etf_list:
                st.session_state.etf_list.append(new_etf)
            else:
                st.warning(f"{new_etf} 已在列表中")

# 2. 膠囊展示區 (每行顯示幾個)
if st.session_state.etf_list:
    st.write("已選 ETF：")
    capsule_cols = st.columns(len(st.session_state.etf_list) + 1)
    for i, etf_id in enumerate(st.session_state.etf_list):
        with capsule_cols[i]:
            if st.button(f"{etf_id} ✖", key=f"del_{etf_id}"):
                st.session_state.etf_list.remove(etf_id)
                st.rerun()

# 3. 展開成份股並計算
if st.session_state.etf_list:
    st.divider()
    
    all_constituents = set()
    with st.spinner("正在解析成份股與計算估價..."):
        for etf_id in st.session_state.etf_list:
            constituents = engine.loader.get_etf_constituents(etf_id)
            if constituents:
                all_constituents.update(constituents)
            else:
                st.error(f"無法找到 {etf_id} 的成份股資料。")

        # 排序並移除可能重複的股票
        stock_list = sorted(list(all_constituents))
        
        results = []
        for sid in stock_list:
            try:
                data = engine.get_valuation_data(sid)
                if "error" not in data:
                    results.append(data)
            except:
                continue

    if results:
        st.subheader(f"📊 成份股綜合評比 (共 {len(results)} 檔)")
        
        display_data = []
        for r in results:
            display_data.append({
                "股票": r["stock_id"],
                "現價": r["current_price"],
                "預估 EPS": f"{r['eps_predict']['low']:.2f}",
                "預估現金股利": round(r["dividend_predict"]["cash_low"], 2),
                "買入區間 (低-高)": f"{r['valuation']['buy_low']:.2f} - {r['valuation']['buy_high']:.2f}",
                "賣出區間 (低-高)": f"{r['valuation']['sell_low']:.2f} - {r['valuation']['sell_high']:.2f}",
                "操作訊號": r["signal"]
            })
        
        df = pd.DataFrame(display_data)
        
        # 顯示表格並根據訊號著色 (Streamlit 支援 Pandas Styler)
        def color_signal(val):
            color = '#22C55E' if val == '買' else '#EF4444' if val == '賣' else '#6366F1' if val == '追蹤' else 'white'
            return f'color: {color}; font-weight: bold'

        st.dataframe(df.style.applymap(color_signal, subset=['操作訊號']), 
                     use_container_width=True, hide_index=True)
    else:
        st.info("尚未載入成份股數據。")
else:
    st.info("請輸入 ETF 代號（如 0050）開始分析成份股位階。")
