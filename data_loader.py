import pandas as pd
from FinMind.data import DataLoader
import datetime
import yfinance as yf
import re

class StockDataLoader:
    def __init__(self, api_token: str = ""):
        self.api = DataLoader()
        if api_token:
            self.api.login(api_token)
        
    def _get_yf_ticker(self, stock_id: str) -> str:
        """輔助方法：將代號轉為 yfinance 格式 (.TW 或 .TWO)"""
        # 簡單邏輯：4位數通常是上市 .TW，但為了精準，如果已知名稱抓不到可嘗試切換
        # 這裡預設先用 .TW，若 yfinance info 為空再試 .TWO
        return f"{stock_id}.TW"

    def get_stock_name(self, stock_id: str) -> str:
        """獲取股票公司名稱 (優先 FinMind, 備援 yfinance)"""
        # 1. Try FinMind
        try:
            df = self.api.taiwan_stock_info()
            row = df[df['stock_id'] == stock_id]
            if not row.empty:
                name = row.iloc[0].get('stock_name', '')
                if name: return name
        except:
            pass

        # 2. Try yfinance Fallback
        try:
            tk = yf.Ticker(self._get_yf_ticker(stock_id))
            name = tk.info.get('longName') or tk.info.get('shortName')
            if not name:
                # 嘗試 .TWO (上櫃)
                tk = yf.Ticker(f"{stock_id}.TWO")
                name = tk.info.get('longName') or tk.info.get('shortName')
            if name: return name
        except:
            pass
            
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
        
        # 備援 yfinance
        if df.empty:
            try:
                tk = yf.Ticker(self._get_yf_ticker(stock_id))
                hist = tk.history(period="1mo")
                if not hist.empty:
                    # 轉換為 FinMind 格式
                    df = hist.reset_index()
                    df.columns = [col.lower() for col in df.columns]
                    # yfinance 的 columns 名稱不同，映射一下
                    df = df.rename(columns={'date': 'date', 'close': 'close'})
            except:
                pass
        return df

    def get_eps_last_3_years(self, stock_id: str):
        """獲取近三年的 Q1~Q4 EPS (優先 FinMind, 備援 yfinance)"""
        current_year = datetime.date.today().year
        start_date = f"{current_year - 3}-01-01"
        
        df = pd.DataFrame()
        try:
            df = self.api.taiwan_stock_financial_statement(
                stock_id=stock_id,
                start_date=start_date
            )
        except:
            pass

        if not df.empty and 'type' in df.columns:
            eps_df = df[df['type'] == 'EPS'].copy()
            eps_df['date'] = pd.to_datetime(eps_df['date'])
            eps_df = eps_df.sort_values('date')
            if not eps_df.empty:
                return eps_df

        # 備援 yfinance
        try:
            tk = yf.Ticker(self._get_yf_ticker(stock_id))
            income = tk.income_stmt # 年度 EPS，yfinance 對台股季度支援較弱
            if not income.empty:
                label = 'Basic EPS' if 'Basic EPS' in income.index else 'Diluted EPS'
                if label in income.index:
                    vals = income.loc[label]
                    # 模擬 FinMind 格式返回
                    fallback_df = pd.DataFrame({
                        'date': vals.index,
                        'value': vals.values,
                        'type': 'EPS'
                    })
                    return fallback_df
        except:
            pass
            
        return pd.DataFrame()

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
        """獲取近三年股利發放資料 (優先 FinMind, 備援 yfinance)"""
        current_year = datetime.date.today().year
        start_date = f"{current_year - 4}-01-01"
        
        df = pd.DataFrame()
        try:
            df = self.api.taiwan_stock_dividend(
                stock_id=stock_id,
                start_date=start_date
            )
        except:
            pass

        if not df.empty:
            return df

        # 備援 yfinance
        try:
            tk = yf.Ticker(self._get_yf_ticker(stock_id))
            divs = tk.dividends
            if not divs.empty:
                # 模擬 FinMind 格式 (這裡 yfinance 無法區分現金/股票，預設全放現金)
                fallback_df = pd.DataFrame({
                    'date': divs.index,
                    'CashEarningsDistribution': divs.values,
                    'StockEarningsDistribution': 0.0
                })
                # 過濾近三年
                cutoff = pd.to_datetime(start_date).tz_localize(divs.index.tz)
                fallback_df = fallback_df[fallback_df['date'] >= cutoff]
                return fallback_df
        except:
            pass
            
        return pd.DataFrame()
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
