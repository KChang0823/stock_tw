import pandas as pd
import datetime
from data_loader import StockDataLoader

class ValuationEngine:
    def __init__(self, data_loader: StockDataLoader):
        self.loader = data_loader

    def get_valuation_data(self, stock_id: str, buy_multiplier: float = 16, sell_multiplier: float = 32):
        # 0. 獲獲現價
        price_df = self.loader.get_stock_price(stock_id)
        current_price = price_df['close'].iloc[-1] if not price_df.empty else None

        # 1. 獲取原始數據
        eps_df = self.loader.get_eps_last_3_years(stock_id)
        div_df = self.loader.get_dividends_last_3_years(stock_id)
        
        if eps_df.empty:
            return {"error": "缺少 EPS 數據"}
        
        # 股利數據若為空，視為 0
        if div_df.empty:
            div_df = pd.DataFrame({
                'date': [datetime.date.today()],
                'CashEarningsDistribution': [0.0],
                'StockEarningsDistribution': [0.0]
            })

        # 2. 整理 EPS 數據
        # 如果是 yfinance 備援，資料可能是按年度 (len=1 per year)
        # 如果每一年的資料只有一筆，且日期是年底，我們視為年度數據，跳過季度填充
        is_annual = all(eps_df.groupby(eps_df['date'].dt.year).size() == 1)
        
        latest_date = eps_df['date'].max()
        this_year = latest_date.year
        last_year = this_year - 1
        
        this_year_eps = eps_df[eps_df['date'].dt.year == this_year].sort_values('date')
        last_year_eps = eps_df[eps_df['date'].dt.year == last_year].sort_values('date')

        if is_annual:
            # 年度邏輯：直接使用該年數值作為預估參考
            eps_low = this_year_eps['value'].iloc[0] if not this_year_eps.empty else 0.0
            eps_high = eps_low
            # 為了後續計算配息率，我們需要去年的總和
            last_total_eps = last_year_eps['value'].iloc[0] if not last_year_eps.empty else 0.0
            last_q = [last_total_eps, 0, 0, 0] # 模擬
        else:
            # 季度邏輯 (原有序邏輯)
            def get_q_list(df):
                return df['value'].tolist()

            this_q = get_q_list(this_year_eps)
            last_q = get_q_list(last_year_eps)
            
            while len(this_q) < 4: this_q.append(None)
            while len(last_q) < 4: last_q.append(0.0)
            
            filled_this_q = []
            for i in range(4):
                if this_q[i] is not None:
                    filled_this_q.append(this_q[i])
                else:
                    filled_this_q.append(last_q[i])
            part_a = sum(filled_this_q)
            
            reported_count = sum(1 for q in this_q if q is not None)
            if reported_count > 0:
                this_sum_reported = sum(this_q[:reported_count])
                last_sum_reported = sum(last_q[:reported_count])
                last_total = sum(last_q)
                if last_sum_reported != 0:
                    part_b = (this_sum_reported / last_sum_reported) * last_total
                else:
                    part_b = part_a
            else:
                part_b = part_a
                
            eps_low = min(part_a, part_b)
            eps_high = max(part_a, part_b)
            last_total_eps = sum(last_q)
        
        # 3. 處理股利數據
        # 抓取最近一次的全年配息 (假設是針對 last_year 發放的)
        # 這裡需要從 div_df 找最新的記錄
        last_div_row = div_df.iloc[-1]
        last_cash = last_div_row['CashEarningsDistribution']
        last_stock = last_div_row['StockEarningsDistribution']
        if last_total_eps == 0:
            return {"error": "去年 EPS 為 0，無法計算配息率"}
            
        # 零件 C/D (現金): 去年現金 * (今年低/高 EPS / 去年總 EPS)
        part_c = last_cash * (eps_low / last_total_eps)
        part_d = last_cash * (eps_high / last_total_eps)
        
        # 零件 E/F (股票): 去年股票 * (今年低/高 EPS / 去年總 EPS)
        part_e = last_stock * (eps_low / last_total_eps)
        part_f = last_stock * (eps_high / last_total_eps)
        
        # 4. 核心估價：四分位階法
        def calc_price(cash_part, stock_part, multiplier):
            adj = 1 + stock_part / 10
            if adj == 0: return 0
            return (cash_part * multiplier) / adj
            
        buy_low = calc_price(part_c, part_e, buy_multiplier)
        buy_high = calc_price(part_d, part_f, buy_multiplier)
        sell_low = calc_price(part_c, part_e, sell_multiplier)
        sell_high = calc_price(part_d, part_f, sell_multiplier)
        
        # 5. 營收動能
        consecutive_yoy = self.loader.get_consecutive_positive_yoy_months(stock_id)

        # 6. 判斷訊號
        signal = ""
        if current_price is not None:
            if current_price < buy_low:
                signal = "買"
            elif buy_low <= current_price <= buy_high:
                signal = "追蹤"
            elif sell_low <= current_price <= sell_high:
                signal = "追蹤"
            elif current_price > sell_high:
                signal = "賣"
            else:
                signal = "" # 介於高買與低賣之間，不顯示
                
        return {
            "stock_id": stock_id,
            "current_price": current_price,
            "eps_predict": {"low": eps_low, "high": eps_high},
            "dividend_predict": {
                "cash_low": part_c, "cash_high": part_d,
                "stock_low": part_e, "stock_high": part_f
            },
            "valuation": {
                "buy_low": buy_low,
                "buy_high": buy_high,
                "sell_low": sell_low,
                "sell_high": sell_high
            },
            "signal": signal,
            "consecutive_yoy": consecutive_yoy
        }

if __name__ == "__main__":
    from data_loader import StockDataLoader
    loader = StockDataLoader()
    engine = ValuationEngine(loader)
    
    # 用鴻海 2317 測試
    result = engine.get_valuation_data("2317")
    import json
    print(json.dumps(result, indent=4, ensure_ascii=False))
