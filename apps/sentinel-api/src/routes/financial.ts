// Financial intelligence routes
// GET /api/financial/fred/:series    — FRED macro signals (VIX, OVX, Gold)
// GET /api/financial/equities        — Defense sector equities watchlist
// GET /api/financial/currencies      — ILS/USD + RUB/USD with alert flags
// GET /api/signals/portwatch         — IMF PortWatch chokepoint disruption index

import type { FastifyInstance } from 'fastify'
import { cacheGet, cacheSet } from '../services/cache.js'
import type {
  FredData, FredPoint,
  EquitiesData, EquityQuote,
  CurrenciesData, CurrencyRate,
  PortWatchData, PortWatchChokepoint,
} from '@sentinel/shared'

// ── FRED / Yahoo Finance macro signals ────────────────────────────────────────

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

const FRED_META: Record<string, { title: string; yahooSymbol: string }> = {
  VIXCLS:           { title: 'CBOE Volatility Index (VIX)',         yahooSymbol: '^VIX'  },
  OVXCLS:           { title: 'CBOE Crude Oil Volatility (OVX)',      yahooSymbol: '^OVX'  },
  GOLDAMGBD228NLBM: { title: 'Gold Price USD/oz (London AM Fix)',    yahooSymbol: 'GC=F'  },
}

// Fetch via FRED API (requires key)
async function fetchFredSeries(seriesId: string, apiKey: string): Promise<FredData | null> {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=30`
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!resp.ok) return null
    const json = await resp.json() as { observations: { date: string; value: string }[] }
    const rows = (json.observations ?? []).filter(o => o.value !== '.')
    if (!rows.length) return null
    const value      = parseFloat(rows[0]?.value ?? '0')
    const prev       = parseFloat(rows[1]?.value ?? String(value))
    const change_pct = prev ? Math.round(((value - prev) / prev) * 10000) / 100 : 0
    const history: FredPoint[] = rows.slice(0, 30).reverse()
      .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    return { series_id: seriesId, title: FRED_META[seriesId]?.title ?? seriesId, value, prev, change_pct, history, updated_at: Date.now() }
  } catch { return null }
}

// Fallback: Yahoo Finance chart (no API key required)
async function fetchYahooMacro(seriesId: string): Promise<FredData | null> {
  const meta = FRED_META[seriesId]
  if (!meta) return null
  try {
    const { default: YFClass } = await import('yahoo-finance2')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yf = new (YFClass as any)({ suppressNotices: ['yahooSurvey'] })
    // Get quote for current value + change
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yf.quote(meta.yahooSymbol)
    const value      = (q.regularMarketPrice as number) ?? 0
    const prev       = (q.regularMarketPreviousClose as number) ?? value
    const change_pct = prev ? Math.round(((value - prev) / prev) * 10000) / 100 : 0

    // Historical chart (90 days, daily) for sparkline — v3 API uses period1
    const period1 = new Date(Date.now() - 90 * 86_400_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart: any = await yf.chart(meta.yahooSymbol, { period1, interval: '1d' })
    const history: FredPoint[] = (chart.quotes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((pt: any) => pt.close != null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((pt: any) => ({
        date:  new Date((pt.date as Date)).toISOString().slice(0, 10),
        value: Math.round((pt.close as number) * 100) / 100,
      }))
      .slice(-30)

    return { series_id: seriesId, title: meta.title, value, prev, change_pct, history, updated_at: Date.now() }
  } catch (e) {
    console.warn(`[financial] Yahoo fallback for ${seriesId}:`, (e as Error).message)
    return null
  }
}

// ── Equities (Yahoo Finance v2) ────────────────────────────────────────────────

const DEFENSE_WATCHLIST = ['LMT', 'RTX', 'NOC', 'BA', 'GD', 'KTOS', 'LHX', 'ITA', 'ESLT']

// Determine market status based on NYSE hours (ET)
function getMarketStatus(): EquitiesData['market_status'] {
  const now = new Date()
  // Convert to ET (UTC-5 / UTC-4 DST)
  const etOffset = isDST(now) ? -4 : -5
  const et = new Date(now.getTime() + etOffset * 3_600_000)
  const day = et.getUTCDay() // 0=Sun, 6=Sat
  const h   = et.getUTCHours()
  const m   = et.getUTCMinutes()
  const mins = h * 60 + m

  if (day === 0 || day === 6) return 'CLOSED'
  if (mins < 4 * 60)          return 'CLOSED'
  if (mins < 9 * 60 + 30)     return 'PRE_MARKET'
  if (mins < 16 * 60)         return 'REGULAR'
  if (mins < 20 * 60)         return 'POST_MARKET'
  return 'CLOSED'
}

function isDST(d: Date): boolean {
  const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset()
  const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset()
  return d.getTimezoneOffset() < Math.max(jan, jul)
}

async function fetchEquities(): Promise<EquitiesData | null> {
  try {
    const { default: YFClass } = await import('yahoo-finance2')
    // v3 API: construct instance with suppressNotices
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yf = new (YFClass as any)({ suppressNotices: ['yahooSurvey'] })
    const quotes = await yf.quote(DEFENSE_WATCHLIST)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: EquityQuote[] = (Array.isArray(quotes) ? quotes : [quotes]).map((q: any) => ({
      ticker:     q.symbol as string,
      name:       ((q.shortName ?? q.symbol) as string).slice(0, 24),
      price:      (q.regularMarketPrice as number) ?? 0,
      change_pct: Math.round(((q.regularMarketChangePercent as number) ?? 0) * 100) / 100,
    }))

    return {
      quotes:        result,
      market_status: getMarketStatus(),
      updated_at:    Date.now(),
    }
  } catch (e) {
    console.warn('[financial] equities error:', (e as Error).message)
    return null
  }
}

// ── Currencies ────────────────────────────────────────────────────────────────

async function fetchCurrencies(): Promise<CurrenciesData | null> {
  // ExchangeRate-API (no key required for basic endpoint)
  try {
    const resp = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return null
    const json = await resp.json() as { rates: Record<string, number> }
    const rates = json.rates

    const prev = await cacheGet<CurrenciesData>('financial:currencies')

    function makeRate(pair: string, symbol: string): CurrencyRate {
      const rate  = rates[symbol] ?? 0
      const old   = prev?.rates.find(r => r.pair === pair)?.rate ?? rate
      const chg   = old ? Math.round(((rate - old) / old) * 10000) / 100 : 0
      return { pair, rate: Math.round(rate * 10000) / 10000, change_pct: chg, alert: Math.abs(chg) >= 2 }
    }

    return {
      rates: [
        makeRate('ILS/USD', 'ILS'),
        makeRate('RUB/USD', 'RUB'),
        makeRate('EUR/USD', 'EUR'),
      ],
      updated_at: Date.now(),
    }
  } catch (e) {
    console.warn('[financial] currencies error:', (e as Error).message)
    return null
  }
}

// ── PortWatch ─────────────────────────────────────────────────────────────────
// IMF PortWatch — ArcGIS REST API, no auth
// Chokepoint location codes: 1=Suez, 5=Hormuz, 7=Bab-el-Mandeb

const PORTWATCH_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/ChokePoint_Info_v2/FeatureServer/0/query'

const CHOKEPOINTS = [
  { name: 'Strait of Hormuz',    code: 5 },
  { name: 'Suez Canal',          code: 1 },
  { name: 'Bab el-Mandeb',       code: 7 },
]

async function fetchPortWatch(): Promise<PortWatchData | null> {
  try {
    const params = new URLSearchParams({
      where:      `locationCode IN (1,5,7)`,
      outFields:  'locationCode,disruptionIndex,vesselCount,locationName',
      f:          'json',
      resultRecordCount: '10',
    })
    const resp = await fetch(`${PORTWATCH_URL}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return null
    const json = await resp.json() as { features?: { attributes: Record<string, unknown> }[] }
    const features = json.features ?? []

    const chokepoints: PortWatchChokepoint[] = CHOKEPOINTS.map(cp => {
      const feat = features.find(f => Number(f.attributes['locationCode']) === cp.code)
      const idx  = feat ? Number(feat.attributes['disruptionIndex'] ?? 0) : 0
      const cnt  = feat ? Number(feat.attributes['vesselCount']     ?? 0) : 0
      return {
        name:             cp.name,
        location_code:    cp.code,
        disruption_index: Math.round(idx * 1000) / 1000,
        vessel_count:     cnt,
        status:           idx > 0.30 ? 'DISRUPTED' : idx > 0.15 ? 'ELEVATED' : 'NORMAL',
      }
    })

    return { chokepoints, updated_at: Date.now() }
  } catch (e) {
    console.warn('[portwatch] fetch error:', (e as Error).message)
    return null
  }
}

// ── Route registration ─────────────────────────────────────────────────────────

export async function registerFinancialRoutes(app: FastifyInstance): Promise<void> {

  // FRED macro signals
  app.get<{ Params: { series: string } }>('/api/financial/fred/:series', async (req, reply) => {
    const seriesId = req.params.series.toUpperCase()
    const allowed = Object.keys(FRED_META)
    if (!allowed.includes(seriesId)) {
      return reply.status(400).send({ error: `Unknown series. Allowed: ${allowed.join(', ')}` })
    }

    const cacheKey = `financial:fred:${seriesId}`
    const cached = await cacheGet<FredData>(cacheKey)
    if (cached) return { ...cached, cache: 'HIT' }

    // Try FRED first (if API key configured), then fall back to Yahoo Finance
    const apiKey = process.env.FRED_API_KEY
    let data: FredData | null = null

    if (apiKey) {
      data = await fetchFredSeries(seriesId, apiKey)
    }

    // Yahoo Finance fallback (no API key required)
    if (!data) {
      data = await fetchYahooMacro(seriesId)
    }

    if (!data) {
      const stale = await cacheGet<FredData>(`${cacheKey}:stale`)
      if (stale) return { ...stale, cache: 'STALE' }
      return reply.status(503).send({ error: 'Macro data fetch failed (FRED + Yahoo)' })
    }

    await cacheSet(cacheKey,           data, 3_600)         // 1h cache
    await cacheSet(`${cacheKey}:stale`, data, 7 * 86_400)
    return { ...data, cache: 'MISS' }
  })

  // Defense equities
  app.get('/api/financial/equities', async (_req, reply) => {
    const cached = await cacheGet<EquitiesData>('financial:equities')
    if (cached) {
      // Re-check market status on each request (cheap)
      return { ...cached, market_status: getMarketStatus(), cache: 'HIT' }
    }

    const data = await fetchEquities()
    if (!data) {
      const stale = await cacheGet<EquitiesData>('financial:equities:stale')
      if (stale) return { ...stale, market_status: getMarketStatus(), cache: 'STALE' }
      return reply.status(503).send({ error: 'Equities fetch failed' })
    }

    const ttl = getMarketStatus() === 'REGULAR' ? 300 : 900
    await cacheSet('financial:equities',       data, ttl)
    await cacheSet('financial:equities:stale', data, 86_400)
    return { ...data, cache: 'MISS' }
  })

  // Currency signals
  app.get('/api/financial/currencies', async (_req, reply) => {
    const cached = await cacheGet<CurrenciesData>('financial:currencies')
    if (cached) return { ...cached, cache: 'HIT' }

    const data = await fetchCurrencies()
    if (!data) {
      const stale = await cacheGet<CurrenciesData>('financial:currencies:stale')
      if (stale) return { ...stale, cache: 'STALE' }
      return reply.status(503).send({ error: 'Currency fetch failed' })
    }

    await cacheSet('financial:currencies',       data, 1_800)
    await cacheSet('financial:currencies:stale', data, 86_400)
    return { ...data, cache: 'MISS' }
  })

  // PortWatch chokepoint monitor
  app.get('/api/signals/portwatch', async (_req, reply) => {
    const cached = await cacheGet<PortWatchData>('signals:portwatch')
    if (cached) return { ...cached, cache: 'HIT' }

    const data = await fetchPortWatch()
    if (!data) {
      const stale = await cacheGet<PortWatchData>('signals:portwatch:stale')
      if (stale) return { ...stale, cache: 'STALE' }
      return reply.status(503).send({ error: 'PortWatch fetch failed' })
    }

    await cacheSet('signals:portwatch',       data, 86_400)
    await cacheSet('signals:portwatch:stale', data, 7 * 86_400)
    return { ...data, cache: 'MISS' }
  })

  // Oil futures curve (served from cache written by economic worker)
  app.get('/api/financial/oil-futures', async (_req, reply) => {
    const cached = await cacheGet('economic:oil_futures')
    if (cached) return { ...cached, cache: 'HIT' }
    const stale  = await cacheGet('economic:oil_futures:stale')
    if (stale)  return { ...stale,  cache: 'STALE' }
    return reply.status(202).send({ pending: true })
  })
}
