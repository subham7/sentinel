// Economic data worker — EIA oil prices + Rial rate + internet disruption
// Oil: hourly poll from EIA API (requires EIA_API_KEY)
// Rial: 30-min scrape of bonbast.com parallel market rate
// Both non-fatal if data source unavailable

import { cacheGet, cacheSet, writeFreshness } from '../services/cache.js'
import type { OilPriceData, OilFuturesData, RialRateData } from '@sentinel/shared'

const OIL_POLL_MS  = 60 * 60 * 1000   // 1 hour
const RIAL_POLL_MS = 30 * 60 * 1000   // 30 minutes
const EIA_BASE     = 'https://api.eia.gov/v2/petroleum/pri/spt/data/'

// ── Oil (EIA) ─────────────────────────────────────────────────────────────────

function eiaUrl(series: string, length: number, apiKey: string): string {
  return `${EIA_BASE}?frequency=daily&data[0]=value&facets[series][]=${series}&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=${length}&api_key=${apiKey}`
}

async function fetchEiaSeries(series: string, length: number, apiKey: string): Promise<number[]> {
  const resp = await fetch(eiaUrl(series, length, apiKey), { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) return []
  const json = await resp.json() as { response: { data: { value: string }[] } }
  return json.response.data.map(r => parseFloat(r.value)).filter(v => !isNaN(v) && v > 0)
}

async function pollOil(): Promise<void> {
  const apiKey = process.env.EIA_API_KEY
  if (!apiKey) return

  try {
    // Brent history (60d) + WTI futures curve (RCLC1–RCLC4, 2 each for change)
    const [brentPrices, rclc1, rclc2, rclc3, rclc4] = await Promise.all([
      fetchEiaSeries('RBRTE', 60,  apiKey),
      fetchEiaSeries('RCLC1', 2,   apiKey),
      fetchEiaSeries('RCLC2', 1,   apiKey),
      fetchEiaSeries('RCLC3', 1,   apiKey),
      fetchEiaSeries('RCLC4', 1,   apiKey),
    ])

    const brent     = brentPrices[0] ?? 0
    const brentPrev = brentPrices[1] ?? brent
    const wti       = rclc1[0] ?? 0
    const wtiPrev   = rclc1[1] ?? wti

    const data: OilPriceData = {
      brent,
      wti,
      brent_change: Math.round((brent - brentPrev) * 100) / 100,
      wti_change:   Math.round((wti   - wtiPrev)   * 100) / 100,
      history:      brentPrices.slice(0, 60).reverse(),
      updated_at:   Date.now(),
    }

    await cacheSet('economic:oil',       data, 3_600)
    await cacheSet('economic:oil:stale', data, 86_400)

    // Futures curve + war premium (backwardation = geopolitical risk priced in)
    const m1 = rclc1[0] ?? 0
    const m2 = rclc2[0] ?? 0
    const m3 = rclc3[0] ?? 0
    const m4 = rclc4[0] ?? 0

    if (m1 > 0 && m3 > 0) {
      const warPremium = Math.round(((m1 - m3) / m3) * 10000) / 100
      const futures: OilFuturesData = {
        spot: m1, m2, m3, m4,
        war_premium: warPremium,
        updated_at: Date.now(),
      }
      await cacheSet('economic:oil_futures',       futures, 3_600)
      await cacheSet('economic:oil_futures:stale', futures, 86_400)
      console.log(`[economic] oil: Brent $${brent.toFixed(2)}, war premium ${warPremium >= 0 ? '+' : ''}${warPremium.toFixed(2)}%`)
    } else {
      console.log(`[economic] oil: Brent $${brent.toFixed(2)} (${data.brent_change >= 0 ? '+' : ''}${data.brent_change.toFixed(2)})`)
    }

    await writeFreshness('economic_oil', 'ok')
  } catch (e) {
    console.warn('[economic] oil poll error:', (e as Error).message)
    await writeFreshness('economic_oil', 'error', (e as Error).message)
  }
}

// ── Rial (bonbast.com) ────────────────────────────────────────────────────────

async function pollRial(): Promise<void> {
  // Strategy 1: bonbast.com JSON endpoint (POST, returns Toman rates)
  // Strategy 2: bonbast.com HTML page scraping
  // 1 Toman = 10 Rial; bonbast rates are in Toman

  let usd_irr = 0

  // Strategy 1 — POST to /json
  try {
    const resp = await fetch('https://www.bonbast.com/json', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':      'https://www.bonbast.com/',
        'Origin':       'https://www.bonbast.com',
      },
      body:   'action=default',
      signal: AbortSignal.timeout(15_000),
    })
    if (resp.ok) {
      const json = await resp.json() as Record<string, unknown>
      // bonbast returns { usd1: <buy in Toman>, usd2: <sell in Toman>, ... }
      const val = Number(json['usd1'] ?? json['usd'] ?? 0)
      if (val > 10_000) usd_irr = val * 10   // Toman → Rial
    }
  } catch { /* strategy 1 failed, try strategy 2 */ }

  // Strategy 2 — HTML scrape
  if (!usd_irr) {
    try {
      const resp = await fetch('https://www.bonbast.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal:  AbortSignal.timeout(15_000),
      })
      if (resp.ok) {
        const html = await resp.text()
        // Various patterns bonbast has used over time
        const patterns = [
          /id=["']?usd2["'][^>]*>\s*([\d,]+)/i,
          /class=["'][^"']*usd[^"']*["'][^>]*>\s*<[^>]+>\s*([\d,]+)/i,
          /USD.*?<td[^>]*>\s*([\d,]+)\s*<\/td>/i,
          /"usd1":\s*"?([\d,]+)"?/i,
        ]
        for (const re of patterns) {
          const m = html.match(re)
          if (m?.[1]) {
            const raw = parseInt(m[1].replace(/,/g, ''), 10)
            if (raw > 10_000 && raw < 10_000_000) {
              // If raw looks like Toman (5-6 digits), multiply by 10
              usd_irr = raw < 1_000_000 ? raw * 10 : raw
              break
            }
          }
        }
      }
    } catch { /* strategy 2 failed */ }
  }

  if (!usd_irr) {
    console.warn('[economic] rial: could not parse rate from bonbast.com')
    return
  }

  // Sanity: parallel market USD/IRR should be between 300,000 and 5,000,000
  if (usd_irr < 300_000 || usd_irr > 5_000_000) {
    console.warn(`[economic] rial: implausible rate ${usd_irr}, discarding`)
    return
  }

  const prev       = await cacheGet<RialRateData>('economic:rial')
  const change_24h = prev?.usd_irr
    ? Math.round(((usd_irr - prev.usd_irr) / prev.usd_irr) * 10000) / 100
    : 0

  const data: RialRateData = { usd_irr, change_24h, updated_at: Date.now() }
  await cacheSet('economic:rial',       data, 1_800)
  await cacheSet('economic:rial:stale', data, 86_400)
  console.log(`[economic] rial: 1 USD = ${usd_irr.toLocaleString()} IRR (${change_24h >= 0 ? '+' : ''}${change_24h.toFixed(2)}%)`)
  await writeFreshness('economic_rial', 'ok')
}

// ── Worker entry point ────────────────────────────────────────────────────────

export function startEconomicWorker(): void {
  const hasEIA = !!process.env.EIA_API_KEY
  console.log(`[economic] worker started${hasEIA ? '' : ' (EIA_API_KEY absent — oil disabled)'}, rial: 30min`)

  if (hasEIA) {
    void pollOil()
    setInterval(() => void pollOil(), OIL_POLL_MS)
  }

  void pollRial()
  setInterval(() => void pollRial(), RIAL_POLL_MS)
}
