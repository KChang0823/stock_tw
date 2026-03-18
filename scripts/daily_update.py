"""
ETF 成份股每日估價排程腳本
- 從 Supabase 讀取 tracked_etfs 清單
- 抓取每檔 ETF 的成份股
- 對每檔成份股計算估價
- 將結果寫回 Supabase
"""

import sys
import os
import time
import datetime

# 確保能 import 專案根目錄的模組
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from data_loader import StockDataLoader
from valuation_engine import ValuationEngine
from scripts.supabase_client import get_supabase_client


def main():
    print(f"=== 開始每日估價更新 ({datetime.datetime.now()}) ===")
    
    sb = get_supabase_client()
    loader = StockDataLoader()
    engine = ValuationEngine(loader)
    
    # 1. 從 Supabase 讀取追蹤中的 ETF
    etf_resp = sb.table("tracked_etfs").select("etf_id").execute()
    etf_list = [row["etf_id"] for row in etf_resp.data]
    
    if not etf_list:
        print("沒有追蹤中的 ETF，請先新增。")
        return
    
    print(f"追蹤中的 ETF: {etf_list}")
    
    # 2. 收集所有成份股（去重）
    all_stocks = set()
    etf_constituents_map = {}  # etf_id -> [stock_ids]
    
    for etf_id in etf_list:
        print(f"\n--- 抓取 {etf_id} 成份股 ---")
        constituents = loader.get_etf_constituents(etf_id)
        if constituents:
            print(f"  找到 {len(constituents)} 檔成份股")
            all_stocks.update(constituents)
            etf_constituents_map[etf_id] = constituents
        else:
            print(f"  ⚠ 無法取得 {etf_id} 的成份股")
    
    # 3. 同步 etf_constituents 表
    print(f"\n--- 同步成份股對照表 ---")
    for etf_id, stocks in etf_constituents_map.items():
        # 先刪除該 ETF 的舊資料
        sb.table("etf_constituents").delete().eq("etf_id", etf_id).execute()
        # 寫入新資料
        rows = [{"etf_id": etf_id, "stock_id": sid} for sid in stocks]
        if rows:
            sb.table("etf_constituents").insert(rows).execute()
            print(f"  {etf_id}: 已同步 {len(rows)} 檔")
    
    # 4. 建立 stock -> [etf_ids] 反向對照
    stock_to_etfs = {}
    for etf_id, stocks in etf_constituents_map.items():
        for sid in stocks:
            stock_to_etfs.setdefault(sid, []).append(etf_id)
    
    # 5. 對每檔股票計算估價
    stock_list = sorted(list(all_stocks))
    total = len(stock_list)
    success = 0
    failed = 0
    
    print(f"\n--- 開始估價 (共 {total} 檔) ---")
    
    for i, sid in enumerate(stock_list):
        print(f"  [{i+1}/{total}] {sid}...", end=" ")
        try:
            data = engine.get_valuation_data(sid)
            if "error" in data:
                print(f"⚠ {data['error']}")
                failed += 1
            else:
                # Upsert 到 Supabase
                etf_sources = ",".join(sorted(stock_to_etfs.get(sid, [])))
                row = {
                    "stock_id": sid,
                    "current_price": data["current_price"],
                    "eps_low": data["eps_predict"]["low"],
                    "eps_high": data["eps_predict"]["high"],
                    "cash_dividend_low": data["dividend_predict"]["cash_low"],
                    "cash_dividend_high": data["dividend_predict"]["cash_high"],
                    "stock_dividend_low": data["dividend_predict"]["stock_low"],
                    "stock_dividend_high": data["dividend_predict"]["stock_high"],
                    "buy_low": data["valuation"]["buy_low"],
                    "buy_high": data["valuation"]["buy_high"],
                    "sell_low": data["valuation"]["sell_low"],
                    "sell_high": data["valuation"]["sell_high"],
                    "signal": data["signal"],
                    "etf_sources": etf_sources,
                    "updated_at": datetime.datetime.now().isoformat()
                }
                sb.table("stock_valuations").upsert(row).execute()
                print(f"✅ ${data['current_price']} | {data['signal'] or '-'}")
                success += 1
        except Exception as e:
            print(f"❌ {e}")
            failed += 1
        
        # 避免 FinMind API 速率限制
        time.sleep(0.5)
    
    print(f"\n=== 完成！成功: {success} / 失敗: {failed} / 總計: {total} ===")


if __name__ == "__main__":
    main()
