'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Search, ArrowUpDown, Settings, X, Plus, Loader2, RotateCcw } from 'lucide-react'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

type Stock = {
  stock_id: string
  company_name: string | null
  current_price: number | null
  buy_low: number | null
  buy_high: number | null
  sell_low: number | null
  sell_high: number | null
  cash_dividend_low: number | null
  cash_dividend_high: number | null
  stock_dividend_low: number | null
  stock_dividend_high: number | null
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

const FONT_SIZES = [
  { label: '小', value: 16 },
  { label: '中', value: 20 },
  { label: '大', value: 24 },
  { label: '特大', value: 32 },
]

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
  const [fontSize, setFontSize] = useState(20)
  const [buyYield, setBuyYield] = useState(6.25) // 100/16
  const [sellYield, setSellYield] = useState(3.125) // 100/32
  const [showSettings, setShowSettings] = useState(false)
  const [newEtfId, setNewEtfId] = useState('')
  const [addingEtf, setAddingEtf] = useState(false)
  const [addMsg, setAddMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 從 localStorage 與 API 讀取偏好
  useEffect(() => {
    const savedSize = localStorage.getItem('etf-font-size')
    if (savedSize) setFontSize(Number(savedSize))
    
    // 優先從 API 讀取全域設定
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings')
        const data = await res.json()
        if (data.buy_multiplier) {
          const by = 100 / data.buy_multiplier
          setBuyYield(Number(by.toFixed(3)))
          localStorage.setItem('etf-buy-yield', String(by))
        }
        if (data.sell_multiplier) {
          const sy = 100 / data.sell_multiplier
          setSellYield(Number(sy.toFixed(3)))
          localStorage.setItem('etf-sell-yield', String(sy))
        }
        if (data.buy_multiplier) return // 已從 API 載入
      } catch (err) {
        console.error('Failed to load settings from API:', err)
      }
      
      const savedBY = localStorage.getItem('etf-buy-yield')
      if (savedBY) setBuyYield(Number(savedBY))
      const savedSY = localStorage.getItem('etf-sell-yield')
      if (savedSY) setSellYield(Number(savedSY))
    }
    
    loadSettings()
  }, [])

  const updateFontSize = (size: number) => {
    setFontSize(size)
    localStorage.setItem('etf-font-size', String(size))
  }

  const syncSettings = async (key: string, val: number) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val }),
      })
    } catch (err) {
      console.error('Failed to sync settings to API:', err)
    }
  }

  const updateBuyYield = (val: number) => {
    setBuyYield(val)
    localStorage.setItem('etf-buy-yield', String(val))
    syncSettings('buy_multiplier', 100 / val)
  }

  const updateSellYield = (val: number) => {
    setSellYield(val)
    localStorage.setItem('etf-sell-yield', String(val))
    syncSettings('sell_multiplier', 100 / val)
  }

  const resetSettings = () => {
    updateBuyYield(6.25)
    updateSellYield(3.125)
  }

  useEffect(() => {
    async function load() {
      const sb = getSupabase()
      const [etfRes, stockRes] = await Promise.all([
        sb.from('tracked_etfs').select('*'),
        sb.from('stock_valuations').select('*'),
      ])
      setEtfs(etfRes.data || [])
      setStocks(stockRes.data || [])
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

  const [addProgress, setAddProgress] = useState(0)
  const [addStep, setAddStep] = useState('')

  const addEtf = async () => {
    const id = newEtfId.trim()
    if (!id) return
    setAddingEtf(true)
    setAddMsg(null)
    setAddProgress(0)
    setAddStep('連線中...')

    try {
      const res = await fetch('/api/etf/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etf_id: id }),
      })

      if (!res.ok) {
        const data = await res.json()
        setAddMsg({ type: 'err', text: data.error })
        setAddingEtf(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n').filter(l => l.startsWith('data: '))

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.progress) setAddProgress(data.progress)
              if (data.step) setAddStep(data.step)

              if (data.done) {
                if (data.error) {
                  setAddMsg({ type: 'err', text: data.error })
                } else {
                  setAddMsg({ type: 'ok', text: data.step })
                  setNewEtfId('')
                  // 重新載入資料
                  const sb = getSupabase()
                  const [etfRes, stockRes] = await Promise.all([
                    sb.from('tracked_etfs').select('*'),
                    sb.from('stock_valuations').select('*'),
                  ])
                  setEtfs(etfRes.data || [])
                  setStocks(stockRes.data || [])
                  setSelectedEtfs(new Set((etfRes.data || []).map((e: Etf) => e.etf_id)))
                }
              }
            } catch { /* skip parse errors */ }
          }
        }
      }
    } catch {
      setAddMsg({ type: 'err', text: '網路錯誤，請稍後再試' })
    }
    setAddingEtf(false)
    setAddProgress(0)
    setAddStep('')
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
    let list = stocks.map(s => {
      // 核心估價重算邏輯 (與 Python ValuationEngine 同步)
      const calcPrice = (cash: number, stock: number, yieldPct: number) => {
        const mult = 100 / yieldPct
        const adj = 1 + (stock / 10)
        if (adj === 0) return 0
        return (cash * mult) / adj
      }

      const bl = calcPrice(s.cash_dividend_low || 0, s.stock_dividend_low || 0, buyYield)
      const bh = calcPrice(s.cash_dividend_high || 0, s.stock_dividend_high || 0, buyYield)
      const sl = calcPrice(s.cash_dividend_low || 0, s.stock_dividend_low || 0, sellYield)
      const sh = calcPrice(s.cash_dividend_high || 0, s.stock_dividend_high || 0, sellYield)

      // 重新判斷訊號
      let sig = ''
      const p = s.current_price
      if (p !== null) {
        if (p < bl) sig = '買'
        else if (p >= bl && p <= bh) sig = '追蹤 (買)'
        else if (p >= sl && p <= sh) sig = '追蹤 (賣)'
        else if (p > sh) sig = '賣'
      }

      return {
        ...s,
        buy_low: bl,
        buy_high: bh,
        sell_low: sl,
        sell_high: sh,
        signal: sig
      }
    }).filter(s => {
      if (selectedEtfs.size > 0) {
        const sources = s.etf_sources || ''
        const match = Array.from(selectedEtfs).some(id => sources.includes(id))
        if (!match) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return s.stock_id.includes(q) || (s.company_name || '').toLowerCase().includes(q)
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
  }, [stocks, selectedEtfs, search, sortKey, sortDir, buyYield, sellYield])

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
    <main className="min-h-screen bg-[#F8FAFC]">
      <div style={{ 
        maxWidth: 1440, 
        margin: '0 auto', 
        padding: '32px 40px', 
        fontSize 
      }}>
        {/* Header */}
        <header style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: fontSize * 1.6, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
              ETF 成份股篩選器
            </h1>
            <p style={{ fontSize: fontSize * 0.9, color: '#64748B' }}>
              高股息 ETF 成份股估值追蹤 · 共 {filtered.length} 檔
            </p>
          </div>

          {/* Settings button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: showSettings ? '#F1F5F9' : 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#475569',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <Settings size={18} />
              設定
            </button>

            {showSettings && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 12,
                background: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                zIndex: 50,
                minWidth: 340,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>⚙️ 估值參數動態調整</span>
                    <button 
                      onClick={resetSettings}
                      title="重置為初始值"
                      style={{
                        padding: 6,
                        borderRadius: 6,
                        color: '#94A3B8',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        marginLeft: 4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#3B82F6'; e.currentTarget.style.background = '#EFF6FF' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'none' }}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  <button onClick={() => setShowSettings(false)} style={{ cursor: 'pointer', color: '#94A3B8', background: 'none', border: 'none' }}>
                    <X size={20} />
                  </button>
                </div>

                {/* Buy Yield Slider */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>買入目標殖利率</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#3B82F6' }}>{buyYield.toFixed(2)}%</div>
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>相當於 {(100 / buyYield).toFixed(1)} 倍</div>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="3" 
                    max="12" 
                    step="0.25"
                    value={buyYield}
                    onChange={(e) => updateBuyYield(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#3B82F6' }}
                  />
                </div>

                {/* Sell Yield Slider */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>賣出目標殖利率</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#EF4444' }}>{sellYield.toFixed(2)}%</div>
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>相當於 {(100 / sellYield).toFixed(1)} 倍</div>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="8" 
                    step="0.125"
                    value={sellYield}
                    onChange={(e) => updateSellYield(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#EF4444' }}
                  />
                </div>

                <div style={{ height: 1, background: '#F1F5F9', margin: '0 -24px 20px' }} />

                {/* Font Size Selector */}
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#475569', display: 'block', marginBottom: 12 }}>介面字體大小</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {FONT_SIZES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => updateFontSize(s.value)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: 8,
                          border: fontSize === s.value ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                          background: fontSize === s.value ? '#EFF6FF' : 'white',
                          color: fontSize === s.value ? '#3B82F6' : '#475569',
                          fontWeight: fontSize === s.value ? 700 : 500,
                          cursor: 'pointer',
                          fontSize: 13,
                          transition: 'all 0.15s',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
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
            placeholder="搜尋股票代號或公司名..."
            className="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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

          {/* 新增 ETF */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              placeholder="輸入 ETF 代號"
              value={newEtfId}
              onChange={e => setNewEtfId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEtf()}
              disabled={addingEtf}
              style={{
                width: 120,
                padding: '6px 12px',
                borderRadius: 9999,
                border: '1px solid #E2E8F0',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={addEtf}
              disabled={addingEtf || !newEtfId.trim()}
              style={{
                padding: '6px 12px',
                borderRadius: 9999,
                border: '1px solid #3B82F6',
                background: '#3B82F6',
                color: 'white',
                fontSize: 13,
                fontWeight: 500,
                cursor: addingEtf || !newEtfId.trim() ? 'not-allowed' : 'pointer',
                opacity: addingEtf || !newEtfId.trim() ? 0.5 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                transition: 'opacity 0.2s',
              }}
            >
              {addingEtf ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              匯入
            </button>
          </div>
        </div>

        {/* 進度條 */}
        {addingEtf && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>{addStep}</span>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{addProgress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${addProgress}%`,
                borderRadius: 3,
                background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* 匯入結果訊息 */}
        {addMsg && (
          <div style={{
            marginTop: 8,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            background: addMsg.type === 'ok' ? '#ECFDF5' : '#FEF2F2',
            color: addMsg.type === 'ok' ? '#059669' : '#DC2626',
          }}>
            {addMsg.text}
          </div>
        )}
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
          <table className="data-table" style={{ fontSize }}>
            <thead>
              <tr>
                <th onClick={() => handleSort('stock_id')} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    代號 <ArrowUpDown size={12} />
                  </span>
                </th>
                <th>公司名</th>
                <th onClick={() => handleSort('signal')} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    訊號 <ArrowUpDown size={12} />
                  </span>
                </th>
                <th style={{ textAlign: 'right' }} onClick={() => handleSort('current_price')} className="cursor-pointer">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    現價 <ArrowUpDown size={12} />
                  </span>
                </th>
                <th style={{ textAlign: 'center' }}>買入區間</th>
                <th style={{ textAlign: 'center' }}>賣出區間</th>
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
                  <td style={{ color: '#334155' }}>
                    {stock.company_name || '—'}
                  </td>
                  <td>
                    <span className={getSignalClass(stock.signal)}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <circle cx="4" cy="4" r="4" fill={getSignalDot(stock.signal)} />
                      </svg>
                      {stock.signal || '—'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                    {stock.current_price?.toLocaleString() ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#059669' }}>
                    {stock.buy_low?.toFixed(1)} – {stock.buy_high?.toFixed(1)}
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#DC2626' }}>
                    {stock.sell_low?.toFixed(1)} – {stock.sell_high?.toFixed(1)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(stock.etf_sources || '').split(',').map(id => id.trim()).filter(Boolean).map(id => (
                        <span key={id} style={{
                          fontSize: fontSize * 0.75,
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
      <footer style={{ marginTop: 16, fontSize: fontSize * 0.8, color: '#94A3B8' }}>
        最後更新：{stocks[0]?.updated_at ? new Date(stocks[0].updated_at).toLocaleString('zh-TW') : '—'}
      </footer>
      </div>
    </main>
  )
}
