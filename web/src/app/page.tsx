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
  consecutive_yoy: number | null
  etf_sources: string | null
  updated_at: string | null
}

type Etf = {
  etf_id: string
  name: string
}

type SortKey = 'stock_id' | 'current_price' | 'signal' | 'consecutive_yoy'
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
  if (!signal) return 'var(--text-muted)'
  if (signal === '買') return 'var(--accent-green)'
  if (signal === '賣') return 'var(--accent-red)'
  if (signal.includes('追蹤')) return 'var(--accent-amber)'
  return 'var(--text-muted)'
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
  const [buyYield, setBuyYield] = useState(6.25)
  const [sellYield, setSellYield] = useState(3.125)
  const [showSettings, setShowSettings] = useState(false)
  const [newEtfId, setNewEtfId] = useState('')
  const [addingEtf, setAddingEtf] = useState(false)
  const [addMsg, setAddMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    const savedSize = localStorage.getItem('etf-font-size')
    if (savedSize) setFontSize(Number(savedSize))

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
        if (data.buy_multiplier) return
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

      let sig = ''
      const p = s.current_price
      if (p !== null) {
        if (p < bl) sig = '買'
        else if (p >= bl && p <= bh) sig = '追蹤 (買)'
        else if (p >= sl && p <= sh) sig = '追蹤 (賣)'
        else if (p > sh) sig = '賣'
      }

      return { ...s, buy_low: bl, buy_high: bh, sell_low: sl, sell_high: sh, signal: sig }
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
      } else if (sortKey === 'consecutive_yoy') {
        cmp = (a.consecutive_yoy || 0) - (b.consecutive_yoy || 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [stocks, selectedEtfs, search, sortKey, sortDir, buyYield, sellYield])

  if (loading) {
    return (
      <main className="loading-container">
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>載入資料中...</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="page-container" style={{ fontSize }}>

        {/* ── Header ── */}
        <header className="page-header">
          <div>
            <h1 className="page-title">ETF 成份股篩選器</h1>
            <p className="page-subtitle">
              高股息 ETF 成份股估值追蹤 · 共 {filtered.length} 檔
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`settings-btn ${showSettings ? 'active' : ''}`}
            >
              <Settings size={18} />
              設定
            </button>

            {showSettings && (
              <div className="settings-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div className="settings-title">
                    ⚙️ 估值參數調整
                    <button onClick={resetSettings} title="重置為初始值" className="settings-reset-btn">
                      <RotateCcw size={15} />
                    </button>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="settings-close-btn">
                    <X size={18} />
                  </button>
                </div>

                {/* Buy Yield */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="settings-label">買入目標殖利率</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="yield-value" style={{ color: 'var(--accent-blue)' }}>{buyYield.toFixed(2)}%</div>
                      <div className="yield-sub">相當於 {(100 / buyYield).toFixed(1)} 倍</div>
                    </div>
                  </div>
                  <input
                    type="range" min="3" max="12" step="0.25"
                    value={buyYield}
                    onChange={(e) => updateBuyYield(Number(e.target.value))}
                    className="yield-slider buy"
                  />
                </div>

                {/* Sell Yield */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="settings-label">賣出目標殖利率</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="yield-value" style={{ color: 'var(--accent-red)' }}>{sellYield.toFixed(2)}%</div>
                      <div className="yield-sub">相當於 {(100 / sellYield).toFixed(1)} 倍</div>
                    </div>
                  </div>
                  <input
                    type="range" min="1" max="8" step="0.125"
                    value={sellYield}
                    onChange={(e) => updateSellYield(Number(e.target.value))}
                    className="yield-slider sell"
                  />
                </div>

                <div className="settings-divider" />

                {/* Font Size */}
                <div>
                  <span className="settings-label" style={{ display: 'block', marginBottom: 10 }}>介面字體大小</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {FONT_SIZES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => updateFontSize(s.value)}
                        className={`font-size-btn ${fontSize === s.value ? 'active' : ''}`}
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

        {/* ── Search + ETF Chips ── */}
        <div style={{ marginBottom: 24 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="搜尋股票代號或公司名..."
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="etf-chips">
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

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="text"
                placeholder="ETF 代號"
                value={newEtfId}
                onChange={e => setNewEtfId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEtf()}
                disabled={addingEtf}
                className="add-etf-input"
              />
              <button
                onClick={addEtf}
                disabled={addingEtf || !newEtfId.trim()}
                className="add-etf-btn"
              >
                {addingEtf ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                匯入
              </button>
            </div>
          </div>

          {/* Progress */}
          {addingEtf && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{addStep}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{addProgress}%</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${addProgress}%` }} />
              </div>
            </div>
          )}

          {addMsg && (
            <div className={`result-msg ${addMsg.type === 'ok' ? 'ok' : 'err'}`}>
              {addMsg.text}
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="table-wrapper">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize }}>
              <thead>
                <tr>
                  <th className="sortable-th" onClick={() => handleSort('stock_id')}>
                    <span className="th-content">代號 <ArrowUpDown size={12} /></span>
                  </th>
                  <th>公司名</th>
                  <th className="sortable-th" onClick={() => handleSort('signal')}>
                    <span className="th-content">訊號 <ArrowUpDown size={12} /></span>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('current_price')} style={{ textAlign: 'right' }}>
                    <span className="th-content" style={{ justifyContent: 'flex-end' }}>現價 <ArrowUpDown size={12} /></span>
                  </th>
                  <th style={{ textAlign: 'center' }}>買入區間</th>
                  <th style={{ textAlign: 'center' }}>賣出區間</th>
                  <th className="sortable-th" onClick={() => handleSort('consecutive_yoy')} style={{ textAlign: 'center' }}>
                    <span className="th-content" style={{ justifyContent: 'center' }}>連增月數 <ArrowUpDown size={12} /></span>
                  </th>
                  <th>所屬 ETF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock) => (
                  <tr key={stock.stock_id}>
                    <td>
                      <span className="cell-stock-id">{stock.stock_id}</span>
                    </td>
                    <td className="cell-company">
                      {stock.company_name || '—'}
                    </td>
                    <td>
                      <span className={getSignalClass(stock.signal)}>
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                          <circle cx="4" cy="4" r="4" fill={getSignalDot(stock.signal)} />
                        </svg>
                        {stock.signal || '—'}
                      </span>
                    </td>
                    <td className="cell-price">
                      {stock.current_price?.toLocaleString() ?? '—'}
                    </td>
                    <td className="cell-range-green">
                      {stock.buy_low?.toFixed(1)} – {stock.buy_high?.toFixed(1)}
                    </td>
                    <td className="cell-range-red">
                      {stock.sell_low?.toFixed(1)} – {stock.sell_high?.toFixed(1)}
                    </td>
                    <td className={`cell-yoy ${(stock.consecutive_yoy || 0) >= 6 ? 'strong' : 'normal'}`}>
                      {stock.consecutive_yoy ?? 0}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(stock.etf_sources || '').split(',').map(id => id.trim()).filter(Boolean).map(id => (
                          <span key={id} className="etf-tag">{id}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="page-footer">
          最後更新：{stocks[0]?.updated_at ? new Date(stocks[0].updated_at).toLocaleString('zh-TW') : '—'}
        </footer>
      </div>
    </main>
  )
}
