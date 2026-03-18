import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, TrendingDown, TrendingUp, Info } from 'lucide-react'

export const revalidate = 0

async function getEtfDetails(id: string) {
  const { data: etf } = await supabase.from('tracked_etfs').select('*').eq('etf_id', id).single()
  const { data: stocks } = await supabase.from('stock_valuations').select('*').ilike('etf_sources', `%${id}%`)
  
  return { etf, stocks: stocks || [] }
}

export default async function EtfPage({ params }: { params: { id: string } }) {
  const { etf, stocks } = await getEtfDetails(params.id)

  if (!etf) return <div>ETF not found</div>

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <Link href="/" className="inline-flex items-center text-zinc-400 hover:text-white mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> 返回總覽
      </Link>

      <header className="mb-12">
        <div className="flex items-end gap-4 mb-4">
          <h1 className="text-5xl font-bold uppercase">{etf.etf_id}</h1>
          <p className="text-2xl text-zinc-500 pb-1">{etf.name}</p>
        </div>
        <div className="flex gap-4">
          <div className="glass px-4 py-2 rounded-full text-xs text-zinc-400">
            成份股數量: {stocks.length}
          </div>
          <div className="glass px-4 py-2 rounded-full text-xs text-emerald-400">
            買進訊號: {stocks.filter(s => s.signal === '買' || s.signal === '追蹤 (買)').length}
          </div>
        </div>
      </header>

      <div className="glass rounded-3xl overflow-hidden border border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="p-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">代號</th>
                <th className="p-4 text-xs font-medium text-zinc-500 uppercase tracking-wider text-right">現價</th>
                <th className="p-4 text-xs font-medium text-zinc-500 uppercase tracking-wider text-center">買入區間 (低-高)</th>
                <th className="p-4 text-xs font-medium text-zinc-500 uppercase tracking-wider text-center">賣出區間 (低-高)</th>
                <th className="p-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">訊號</th>
                <th className="p-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">估價位階</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {stocks.sort((a, b) => (a.signal === '買' ? -1 : 1)).map((stock) => (
                <tr key={stock.stock_id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="p-4 font-mono font-medium">{stock.stock_id}</td>
                  <td className="p-4 text-right font-mono text-zinc-300">
                    {stock.current_price?.toLocaleString()}
                  </td>
                  <td className="p-4 text-center font-mono text-emerald-500/80 text-sm">
                    {stock.buy_low?.toFixed(2)} - {stock.buy_high?.toFixed(2)}
                  </td>
                  <td className="p-4 text-center font-mono text-rose-500/80 text-sm">
                    {stock.sell_low?.toFixed(2)} - {stock.sell_high?.toFixed(2)}
                  </td>
                  <td className="p-4">
                    {stock.signal && (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        stock.signal === '買' ? 'bg-emerald-500/20 text-emerald-400' :
                        stock.signal === '賣' ? 'bg-rose-500/20 text-rose-400' :
                        stock.signal.includes('追蹤') ? 'bg-amber-500/20 text-amber-400' :
                        'bg-zinc-800 text-zinc-500'
                      }`}>
                        {stock.signal}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="w-32 h-1.5 bg-zinc-800 rounded-full relative overflow-hidden">
                      {/* 簡易位階視覺化藍色指標 */}
                      <div 
                        className="absolute h-full bg-blue-500 transition-all duration-500"
                        style={{ 
                          left: '0%', 
                          width: `${Math.min(100, Math.max(0, (stock.current_price / stock.sell_high) * 100))}%` 
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="mt-8 flex items-center gap-2 text-zinc-600 text-xs">
        <Info className="w-3 h-3" />
        數據更新於: {stocks[0]?.updated_at ? new Date(stocks[0].updated_at).toLocaleString('zh-TW') : 'N/A'}
      </footer>
    </main>
  )
}
