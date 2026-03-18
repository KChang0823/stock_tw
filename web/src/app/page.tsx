'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Search, ArrowUpDown } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

type Stock = {
  stock_id: string
  current_price: number | null
  buy_low: number | null
  buy_high: number | null
  sell_low: number | null
  sell_high: number | null
  signal: string | null
  etf_sources: string | null
  updated_at: string | null
}

type Etf = {
  etf_id: string
  name: string
}

type SortKey = 'stock_id' | 'current_price' | 'signal'
type SortDir = 'asc' | 'desc'

function getSignalClass(signal: string | null) {
  if (!signal) return 'signal-neutral'
  if (signal === '買') return 'signal-buy'
  if (signal === '賣') return 'signal-sell'
  if (signal.includes('追蹤')) return 'signal-watch'
  return 'signal-neutral'
}

function getSignalDot(signal: string | null) {
  if (!signal) return '#94A3B8'
  if (signal === '買') return '#059669'
  if (signal === '賣') return '#DC2626'
  if (signal.includes('追蹤')) return '#D97706'
  return '#94A3B8'
}

export default function Home() {
  const [etfs, setEtfs] = useState<Etf[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [selectedEtfs, setSelectedEtfs] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('signal')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [etfRes, stockRes] = await Promise.all([
        supabase.from('tracked_etfs').select('*'),
        supabase.from('stock_valuations').select('*'),
      ])
      setEtfs(etfRes.data || [])
      setStocks(stockRes.data || [])
      // 預設全選
      setSelectedEtfs(new Set((etfRes.data || []).map((e: Etf) => e.etf_id)))
      setLoading(false)
    }
    load()
  }, [])

  const toggleEtf = (id: string) => {
    setSelectedEtfs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const signalOrder: Record<string, number> = { '買': 0, '追蹤 (買)': 1, '追蹤 (賣)': 2, '賣': 3 }

  const filtered = useMemo(() => {
    let list = stocks.filter(s => {
      // ETF 篩選
      if (selectedEtfs.size > 0) {
        const sources = s.etf_sources || ''
        const match = Array.from(selectedEtfs).some(id => sources.includes(id))
        if (!match) return false
      }
      // 搜尋篩選
      if (search) {
        return s.stock_id.includes(search)
      }
      return true
    })

    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'stock_id') {
        cmp = a.stock_id.localeCompare(b.stock_id)
      } else if (sortKey === 'current_price') {
        cmp = (a.current_price || 0) - (b.current_price || 0)
      } else if (sortKey === 'signal') {
        cmp = (signalOrder[a.signal || ''] ?? 99) - (signalOrder[b.signal || ''] ?? 99)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [stocks, selectedEtfs, search, sortKey, sortDir])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ color: '#64748B', fontSize: 14 }}>載入資料中...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen" style={{ padding: '32px 40px' }}>
      {/* Header */}
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
          ETF 成份股篩選器
        </h1>
        <p style={{ fontSize: 14, color: '#64748B' }}>
          高股息 ETF 成份股估值追蹤 · 共 {filtered.length} 檔
        </p>
      </header>

      {/* Search + ETF Chips */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
            size={18}
          />
          <input
            type="text"
            placeholder="搜尋股票代號..."
            className="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {etfs.map(etf => (
            <button
              key={etf.etf_id}
              className={`etf-chip ${selectedEtfs.has(etf.etf_id) ? 'active' : ''}`}
              onClick={() => toggleEtf(etf.etf_id)}
            >
              {etf.etf_id}
              <span style={{ opacity: 0.7 }}>{etf.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('stock_id')} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    代號 <ArrowUpDown size={12} />
                  </span>
                </th>
                <th style={{ textAlign: 'right' }} onClick={() => handleSort('current_price')} className="cursor-pointer">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    現價 <ArrowUpDown size={12} />
                  </span>
                </th>
                <th style={{ textAlign: 'center' }}>買入區間</th>
                <th style={{ textAlign: 'center' }}>賣出區間</th>
                <th onClick={() => handleSort('signal')} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    訊號 <ArrowUpDown size={12} />
                  </span>
                </th>
                <th>所屬 ETF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((stock) => (
                <tr key={stock.stock_id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {stock.stock_id}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                    {stock.current_price?.toLocaleString() ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#059669' }}>
                    {stock.buy_low?.toFixed(1)} – {stock.buy_high?.toFixed(1)}
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#DC2626' }}>
                    {stock.sell_low?.toFixed(1)} – {stock.sell_high?.toFixed(1)}
                  </td>
                  <td>
                    <span className={getSignalClass(stock.signal)}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <circle cx="4" cy="4" r="4" fill={getSignalDot(stock.signal)} />
                      </svg>
                      {stock.signal || '—'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(stock.etf_sources || '').split(',').map(id => id.trim()).filter(Boolean).map(id => (
                        <span key={id} style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#F1F5F9',
                          color: '#475569',
                          fontWeight: 500,
                        }}>
                          {id}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ marginTop: 16, fontSize: 12, color: '#94A3B8' }}>
        最後更新：{stocks[0]?.updated_at ? new Date(stocks[0].updated_at).toLocaleString('zh-TW') : '—'}
      </footer>
    </main>
  )
}
