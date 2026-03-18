import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function sseMsg(step: string, progress: number, done = false, error = '') {
  return `data: ${JSON.stringify({ step, progress, done, error })}\n\n`
}

export async function POST(req: NextRequest) {
  const { etf_id } = await req.json()

  if (!etf_id || !/^\d{4,5}$/.test(etf_id)) {
    return new Response(
      JSON.stringify({ error: '請輸入有效的 ETF 代號（4~5 位數字）' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (step: string, progress: number, done = false, error = '') => {
        controller.enqueue(new TextEncoder().encode(sseMsg(step, progress, done, error)))
      }

      try {
        // Step 1: 抓成份股
        send('正在從 MoneyDJ 抓取成份股...', 10)
        const url = `https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=${etf_id}.TW`
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        })

        if (!resp.ok) {
          send('', 0, true, `MoneyDJ 回傳 ${resp.status}`)
          controller.close()
          return
        }

        const buffer = await resp.arrayBuffer()
        const decoder = new TextDecoder('big5')
        const html = decoder.decode(buffer)
        
        // 1. 抓成份股代號 (數字部分不會有編碼問題)
        const matches = html.matchAll(/etfid=(\d{4,5})\.TW/g)
        const stockIds = [...new Set(
          Array.from(matches, m => m[1]).filter(id => id !== etf_id)
        )].sort()

        if (stockIds.length === 0) {
          send('', 0, true, `找不到 ${etf_id} 的成份股，請確認代號是否正確`)
          controller.close()
          return
        }

        // 2. 獲取 ETF 中文名稱 (從 FinMind API 獲取，避免 Big5 亂碼)
        let etfName = etf_id
        try {
          const infoResp = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&data_id=${etf_id}`)
          const infoJson = await infoResp.json()
          if (infoJson.data && infoJson.data.length > 0) {
            etfName = infoJson.data[0].stock_name
          }
        } catch (e) {
          console.warn('Failed to fetch ETF name from FinMind:', e)
        }

        send(`找到 ${stockIds.length} 檔成份股 [${etfName}]，正在寫入資料庫...`, 30)

        // Step 2: Upsert tracked_etfs
        await supabase.from('tracked_etfs').upsert({
          etf_id,
          name: etfName,
        }, { onConflict: 'etf_id' })

        send('寫入成份股對照表...', 45)

        // Step 3: 更新 etf_constituents
        await supabase.from('etf_constituents').delete().eq('etf_id', etf_id)
        const rows = stockIds.map(sid => ({ etf_id, stock_id: sid }))
        await supabase.from('etf_constituents').insert(rows)

        send('更新估值記錄...', 60)

        // Step 4: 建立空白 stock_valuations
        const { data: existing } = await supabase
          .from('stock_valuations')
          .select('stock_id')
          .in('stock_id', stockIds)

        const existingIds = new Set((existing || []).map(r => r.stock_id))
        const newStocks = stockIds.filter(id => !existingIds.has(id))

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

        if (newStocks.length > 0) {
          const emptyRows = newStocks.map(sid => ({
            stock_id: sid,
            company_name: '',
            etf_sources: etf_id,
            updated_at: new Date().toISOString(),
          }))
          await supabase.from('stock_valuations').insert(emptyRows)
        }

        send('觸發估值更新 workflow...', 80)

        // Step 5: 觸發 GitHub Actions workflow
        const ghToken = process.env.GITHUB_PAT
        if (ghToken) {
          try {
            await fetch(
              'https://api.github.com/repos/KChang0823/stock_tw/actions/workflows/daily_update.yml/dispatches',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${ghToken}`,
                  Accept: 'application/vnd.github.v3+json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ref: 'main' }),
              }
            )
            send(`成功匯入 ${etf_id}（${stockIds.length} 檔），估值更新已排程`, 100, true)
          } catch {
            send(`成功匯入 ${etf_id}（${stockIds.length} 檔），但觸發 workflow 失敗`, 100, true)
          }
        } else {
          send(`成功匯入 ${etf_id}（${stockIds.length} 檔），請手動觸發估值更新`, 100, true)
        }

        controller.close()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        send('', 0, true, msg)
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
