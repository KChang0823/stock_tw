import pandas as pd
from FinMind.data import DataLoader
import datetime

class StockDataLoader:
    def __init__(self, api_token: str = ""):
        self.api = DataLoader()
        if api_token:
            self.api.login(api_token)
        
    def get_stock_price(self, stock_id: str, days: int = 30):
        """獲取最近股價"""
        end_date = datetime.date.today().strftime("%Y-%m-%d")
        start_date = (datetime.date.today() - datetime.timedelta(days=days)).strftime("%Y-%m-%d")
        
        df = self.api.taiwan_stock_daily(
            stock_id=stock_id,
            start_date=start_date,
            end_date=end_date
        )
        return df

    def get_eps_last_3_years(self, stock_id: str):
        """獲取近三年的 Q1~Q4 EPS"""
        current_year = datetime.date.today().year
        start_date = f"{current_year - 3}-01-01"
        
        df = self.api.taiwan_stock_financial_statement(
            stock_id=stock_id,
            start_date=start_date
        )
        # 過濾出 EPS 並整理格式 (FinMind API 中通常為 'EPS')
        eps_df = df[df['type'] == 'EPS'].copy()
        # 確保 date 是 datetime 格式方便排序與處理
        eps_df['date'] = pd.to_datetime(eps_df['date'])
        eps_df = eps_df.sort_values('date')
        return eps_df

    def get_yield_and_multipliers(self, stock_id: str, days: int = 1000):
        """獲取近三年殖利率與本益比資料 (從台灣證券交易所股價倍數資料)"""
        end_date = datetime.date.today().strftime("%Y-%m-%d")
        start_date = (datetime.date.today() - datetime.timedelta(days=days)).strftime("%Y-%m-%d")
        
        df = self.api.taiwan_stock_per_pbr(
            stock_id=stock_id,
            start_date=start_date,
            end_date=end_date
        )
        return df

    def get_dividends_last_3_years(self, stock_id: str):
        """獲取近三年股利發放資料 (現金與股票)"""
        current_year = datetime.date.today().year
        start_date = f"{current_year - 4}-01-01" # 往前多抓一年確保完整性
        
        df = self.api.taiwan_stock_dividend(
            stock_id=stock_id,
            start_date=start_date
        )
        return df
    def get_etf_constituents(self, etf_id: str):
        """抓取 ETF 成份股列表 (支援帶入常見 ETF 的預設清單作為 fallback)"""
        # 常見 ETF 預設清單 (避免爬蟲被擋時無法使用)
        fallbacks = {
            "0050": ["2330", "2317", "2454", "2308", "2891", "3711", "2881", "2382", "2882", "2345", 
                      "2303", "2884", "2412", "3017", "2886", "6669", "2383", "3231", "2887", "2885"],
            "0056": ["2317", "2382", "2357", "3231", "2301", "3034", "2441", "2379", "3044", "2303"],
            "00878": ["2317", "2382", "2357", "3231", "2301", "3034", "2454", "2891", "2886", "2881"]
        }
        
        if etf_id in fallbacks:
            return fallbacks[etf_id]

        import requests
        from bs4 import BeautifulSoup
        import re
        
        url = f"https://www.wantgoo.com/stock/etf/{etf_id}/constituent"
        try:
            resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=15)
            soup = BeautifulSoup(resp.text, 'html.parser')
            # 抓取頁面中所有 /stock/XXXX 的連結
            links = soup.find_all('a', href=re.compile(r'/stock/\d{4}$'))
            stock_ids = []
            for l in links:
                sid = re.search(r'/stock/(\d{4})', l['href']).group(1)
                if sid != etf_id:
                    stock_ids.append(sid)
            
            if not stock_ids: # 嘗試另一種解析法
                # 有些頁面可能是 JSON 資料隱藏在 script 中
                scripts = soup.find_all('script')
                for s in scripts:
                    matches = re.findall(r'"StockNo":"(\d{4})"', s.text)
                    if matches:
                        stock_ids.extend(matches)
            
            return sorted(list(set(stock_ids))) if stock_ids else []
        except Exception as e:
            print(f"Error fetching ETF constituents: {e}")
            return []

if __name__ == "__main__":
    # 測試腳本
    loader = StockDataLoader()
    stock_id = "2317" # 鴻海測試
    
    print(f"--- 測試抓取 {stock_id} 近三年數據 ---")
    
    print("\n1. EPS (Q1~Q4):")
    eps = loader.get_eps_last_3_years(stock_id)
    if not eps.empty:
        print(eps[['date', 'value']].tail(12)) # 顯示最近 12 季 (3 年)
    else:
        print("未找到 EPS 數據")
    
    print("\n2. 殖利率 (Yield):")
    yield_df = loader.get_yield_and_multipliers(stock_id)
    if not yield_df.empty:
        # FinMind API 中殖利率欄位通常是 'dividend_yield'
        print(yield_df[['date', 'dividend_yield']].tail(5))
    else:
        print("未找到殖利率數據")
        
    print("\n3. 股利發放 (Dividends):")
    div_df = loader.get_dividends_last_3_years(stock_id)
    if not div_df.empty:
        # CashEarningsDistribution: 現金股息, StockEarningsDistribution: 股票股息
        print(div_df[['date', 'StockEarningsDistribution', 'CashEarningsDistribution']].tail(5))
    else:
        print("未找到股利數據")
