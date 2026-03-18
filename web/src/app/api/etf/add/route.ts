import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { etf_id } = await req.json()

    if (!etf_id || !/^\d{4,5}$/.test(etf_id)) {
      return NextResponse.json({ error: '請輸入有效的 ETF 代號（4~5 位數字）' }, { status: 400 })
    }

    // 1. 從 MoneyDJ 抓成份股
    const url = `https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=${etf_id}.TW`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `MoneyDJ 回傳 ${resp.status}` }, { status: 502 })
    }

    const html = await resp.text()

    // 用 regex 找所有 etfid=XXXX.TW 格式的連結
    const matches = html.matchAll(/etfid=(\d{4,5})\.TW/g)
    const stockIds = [...new Set(
      Array.from(matches, m => m[1]).filter(id => id !== etf_id)
    )].sort()

    if (stockIds.length === 0) {
      return NextResponse.json({ error: `找不到 ${etf_id} 的成份股，請確認代號是否正確` }, { status: 404 })
    }

    // 2. Upsert tracked_etfs
    await supabase.from('tracked_etfs').upsert({
      etf_id,
      name: `${etf_id}`,
    }, { onConflict: 'etf_id' })

    // 3. 清除舊成份股，寫入新的
    await supabase.from('etf_constituents').delete().eq('etf_id', etf_id)
    const rows = stockIds.map(sid => ({ etf_id, stock_id: sid }))
    await supabase.from('etf_constituents').insert(rows)

    // 4. 為還沒有估值資料的成份股建立空白記錄，讓前端先看得到
    const { data: existing } = await supabase
      .from('stock_valuations')
      .select('stock_id')
      .in('stock_id', stockIds)

    const existingIds = new Set((existing || []).map(r => r.stock_id))
    const newStocks = stockIds.filter(id => !existingIds.has(id))

    if (newStocks.length > 0) {
      // 更新現有股票的 etf_sources
      for (const sid of stockIds.filter(id => existingIds.has(id))) {
        const { data: row } = await supabase
          .from('stock_valuations')
          .select('etf_sources')
          .eq('stock_id', sid)
          .single()

        const sources = new Set((row?.etf_sources || '').split(',').filter(Boolean))
        sources.add(etf_id)
        await supabase
          .from('stock_valuations')
          .update({ etf_sources: [...sources].sort().join(',') })
          .eq('stock_id', sid)
      }

      // 新增空白記錄
      const emptyRows = newStocks.map(sid => ({
        stock_id: sid,
        company_name: '',
        etf_sources: etf_id,
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('stock_valuations').insert(emptyRows)
    }

    return NextResponse.json({
      etf_id,
      constituents_count: stockIds.length,
      new_stocks: newStocks.length,
      message: `成功匯入 ${etf_id}，共 ${stockIds.length} 檔成份股`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
