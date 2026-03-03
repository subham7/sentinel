// Economic data worker — EIA oil prices + Rial rate + internet disruption
// Oil: hourly poll from EIA API (requires EIA_API_KEY)
// Rial: 30-min scrape of bonbast.com parallel market rate
// Both non-fatal if data source unavailable

import { cacheGet, cacheSet, writeFreshness } from '../services/cache.js'
import type { OilPriceData, OilFuturesData, RialRateData } from '@sentinel/shared'

const OIL_POLL_MS  = 60 * 60 * 1000   // 1 hour
const RIAL_POLL_MS = 30 * 60 * 1000   // 30 minutes
const EIA_SPT_BASE = 'https://api.eia.gov/v2/petroleum/pri/spt/data/'  // spot prices
const EIA_FUT_BASE = 'https://api.eia.gov/v2/petroleum/pri/fut/data/'  // futures prices

// ── Oil (EIA) ─────────────────────────────────────────────────────────────────

function eiaUrl(base: string, series: string, length: number, apiKey: string): string {
  return `${base}?frequency=daily&data[0]=value&facets[series][]=${series}&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=${length}&api_key=${apiKey}`
}

async function fetchEiaSeries(base: string, series: string, length: number, apiKey: string): Promise<number[]> {
  try {
    const resp = await fetch(eiaUrl(base, series, length, apiKey), { signal: AbortSignal.timeout(30_000) })
    if (!resp.ok) return []
    const json = await resp.json() as { response: { data: { value: string }[] } }
    return (json.response?.data ?? []).map(r => parseFloat(r.value)).filter(v => !isNaN(v) && v > 0)
  } catch {
    return []
  }
}

async function pollOil(): Promise<void> {
  const apiKey = process.env.EIA_API_KEY
  if (!apiKey) return

  try {
    // Spot prices: RBRTE=Brent (60d history), RWTC=WTI spot (2 for day change)
    // Futures prices (separate endpoint): RCLC1-4 = WTI front/2nd/3rd/4th month
    const [brentPrices, wtiPrices, rclc1, rclc2, rclc3, rclc4] = await Promise.all([
      fetchEiaSeries(EIA_SPT_BASE, 'RBRTE', 60, apiKey),
      fetchEiaSeries(EIA_SPT_BASE, 'RWTC',   2, apiKey),
      fetchEiaSeries(EIA_FUT_BASE, 'RCLC1',  1, apiKey),
      fetchEiaSeries(EIA_FUT_BASE, 'RCLC2',  1, apiKey),
      fetchEiaSeries(EIA_FUT_BASE, 'RCLC3',  1, apiKey),
      fetchEiaSeries(EIA_FUT_BASE, 'RCLC4',  1, apiKey),
    ])

    const brent     = brentPrices[0] ?? 0
    const brentPrev = brentPrices[1] ?? brent
    const wti       = wtiPrices[0] ?? 0
    const wtiPrev   = wtiPrices[1] ?? wti

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

    // Futures curve: use RCLC1-4 if available, else fall back to WTI spot
    // War premium = (spot - 3rd month) / 3rd month × 100
    // Positive = backwardation (front expensive vs forward = supply fear)
    const spot = (rclc1[0] ?? 0) > 0 ? (rclc1[0] ?? 0) : wti
    const m2v  = (rclc2[0] ?? 0) > 0 ? (rclc2[0] ?? 0) : spot
    const m3v  = (rclc3[0] ?? 0) > 0 ? (rclc3[0] ?? 0) : spot
    const m4v  = (rclc4[0] ?? 0) > 0 ? (rclc4[0] ?? 0) : spot

    if (spot > 0) {
      const warPremium = m3v > 0 ? Math.round(((spot - m3v) / m3v) * 10000) / 100 : 0
      const futures: OilFuturesData = {
        spot, m2: m2v, m3: m3v, m4: m4v,
        war_premium: warPremium,
        updated_at: Date.now(),
      }
      await cacheSet('economic:oil_futures',       futures, 3_600)
      await cacheSet('economic:oil_futures:stale', futures, 86_400)
      console.log(`[economic] oil: Brent $${brent.toFixed(2)}, WTI $${wti.toFixed(2)}, war premium ${warPremium >= 0 ? '+' : ''}${warPremium.toFixed(2)}%`)
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
