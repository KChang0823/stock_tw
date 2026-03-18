import pandas as pd
from FinMind.data import DataLoader
import datetime

class StockDataLoader:
    def __init__(self, api_token: str = ""):
        self.api = DataLoader()
        if api_token:
            self.api.login(api_token)
        
    def get_stock_name(self, stock_id: str) -> str:
        """獲取股票公司名稱"""
        try:
            df = self.api.taiwan_stock_info()
            row = df[df['stock_id'] == stock_id]
            if not row.empty:
                return row.iloc[0].get('stock_name', '')
        except Exception as e:
            print(f"  ⚠ 無法取得 {stock_id} 公司名: {e}")
        return ''

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
        """抓取 ETF 成份股列表 (使用 MoneyDJ SSR 頁面)"""
        import requests
        from bs4 import BeautifulSoup
        import re
        
        # MoneyDJ Basic0007B = 全部持股頁面 (SSR，requests 直接拿到)
        url = f"https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid={etf_id}.TW"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                print(f"MoneyDJ returned {resp.status_code} for {etf_id}")
                return []
            
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # 找所有 etfid=XXXX.TW 格式的連結 (成份股)
            links = soup.find_all('a', href=re.compile(r'etfid=\d{4,5}\.TW'))
            stock_ids = []
            for link in links:
                match = re.search(r'etfid=(\d{4,5})\.TW', link['href'])
                if match:
                    sid = match.group(1)
                    if sid != etf_id:
                        stock_ids.append(sid)
            
            result = sorted(list(set(stock_ids)))
            if result:
                return result
            
            print(f"MoneyDJ: 未找到 {etf_id} 的成份股")
            return []
        except Exception as e:
            print(f"Error fetching ETF constituents for {etf_id}: {e}")
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
