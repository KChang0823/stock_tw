import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

// 強制為 Server Component 且每次渲染都從 DB 抓最新資料
export const revalidate = 0

async function getEtfs() {
  const { data: etfs } = await supabase.from('tracked_etfs').select('*')
  
  // 獲取每個 ETF 的成份股統計
  const { data: stocks } = await supabase.from('stock_valuations').select('stock_id, signal, etf_sources')
  
  return etfs?.map(etf => {
    const etfStocks = stocks?.filter(s => s.etf_sources?.includes(etf.etf_id)) || []
    return {
      ...etf,
      count: etfStocks.length,
      buyCount: etfStocks.filter(s => s.signal === '買' || s.signal === '追蹤 (買)').length,
      sellCount: etfStocks.filter(s => s.signal === '賣' || s.signal === '追蹤 (賣)').length,
    }
  }) || []
}

export default async function Dashboard() {
  const etfs = await getEtfs()

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          ETF 價值戰情室
        </h1>
        <p className="text-zinc-500">基於預期股利殖利率位階的價值投資儀表板</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {etfs.map((etf) => (
          <Link key={etf.etf_id} href={`/etf/${etf.etf_id}`}>
            <div className="glass card-hover p-6 rounded-2xl cursor-pointer group">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-semibold group-hover:text-blue-400 transition-colors uppercase">
                    {etf.etf_id}
                  </h2>
                  <p className="text-zinc-400">{etf.name}</p>
                </div>
                <span className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-sm">
                  {etf.count} 檔成份股
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <TrendingUp className="w-4 h-4" /> 買進機會
                  </span>
                  <span className="font-mono">{etf.buyCount}</span>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-1000" 
                    style={{ width: `${(etf.buyCount / etf.count) * 100}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-rose-400">
                    <TrendingDown className="w-4 h-4" /> 賣出警戒
                  </span>
                  <span className="font-mono">{etf.sellCount}</span>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-rose-500 h-full transition-all duration-1000" 
                    style={{ width: `${(etf.sellCount / etf.count) * 100}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-zinc-800 flex justify-between items-center bg-transparent">
                <span className="text-xs text-zinc-600">檢視詳細成份股表格</span>
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
