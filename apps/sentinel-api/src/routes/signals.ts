// Internet connectivity signal routes
// GET /api/signals/internet/:countryCode   — IODA + OONI + optional Cloudflare Radar

import type { FastifyInstance } from 'fastify'
import { cacheGet, cacheSet } from '../services/cache.js'

export type InternetStatus = 'normal' | 'degraded' | 'disrupted' | 'blocked'

export interface CountryInternetStatus {
  iso2:        string
  status:      InternetStatus
  sources: {
    ioda:  { events: number; maxScore: number }
    ooni:  { anomalyRate: number; confirmed: number }
    cf?:   { change: number }   // netflow % change (negative = drop)
  }
  updatedAt: string
}

const IODA_BASE = 'https://api.ioda.caida.org/v2'
const OONI_BASE = 'https://api.ooni.io/api/v1'
const CF_BASE   = 'https://api.cloudflare.com/client/v4/radar'

const TTL_SEC   = 15 * 60   // 15-min cache
const STALE_SEC = 4 * 60 * 60  // 4-hour stale

function statusFromSignals(
  iodaScore: number,
  ooniRate:  number,
  cfChange:  number | null,
): InternetStatus {
  // BLOCKED: OONI confirms censorship of >40% of tested sites
  if (ooniRate > 0.40) return 'blocked'
  // DISRUPTED: significant routing/BGP disruption or heavy censorship
  if (iodaScore > 0.60 || ooniRate > 0.25) return 'disrupted'
  // DEGRADED: moderate anomalies or CF netflow drop >30%
  if (iodaScore > 0.25 || ooniRate > 0.10 || (cfChange !== null && cfChange < -30)) return 'degraded'
  return 'normal'
}

async function fetchIoda(cc: string): Promise<{ events: number; maxScore: number }> {
  const since = new Date()
  since.setHours(since.getHours() - 24)
  const url = `${IODA_BASE}/outages/events?relatedTo=country%2F${cc}&limit=20&format=json`
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`IODA ${r.status}`)
  const body = await r.json() as {
    data?: { data?: { score?: number; start?: number; end?: number }[] }
  }
  const rows = body.data?.data ?? []
  const nowMs = Date.now()
  const recent = rows.filter(e => {
    const end = (e.end ?? 0) * 1000
    return end === 0 || (nowMs - end) < 24 * 60 * 60 * 1000
  })
  const maxScore = recent.reduce((m, e) => Math.max(m, e.score ?? 0), 0)
  return { events: recent.length, maxScore }
}

async function fetchOoni(cc: string): Promise<{ anomalyRate: number; confirmed: number }> {
  const since = new Date()
  since.setDate(since.getDate() - 2)
  const url = `${OONI_BASE}/aggregation?probe_cc=${cc}&since=${since.toISOString().slice(0, 10)}&test_name=web_connectivity`
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`OONI ${r.status}`)
  const body = await r.json() as {
    result?: { anomaly_count?: number; confirmed_count?: number; measurement_count?: number }[]
  }
  const rows = body.result ?? []
  const totMeasurements = rows.reduce((s, x) => s + (x.measurement_count ?? 0), 0)
  const totAnomalies    = rows.reduce((s, x) => s + (x.anomaly_count ?? 0), 0)
  const confirmed       = rows.reduce((s, x) => s + (x.confirmed_count ?? 0), 0)
  const anomalyRate     = totMeasurements > 0 ? totAnomalies / totMeasurements : 0
  return { anomalyRate, confirmed }
}

async function fetchCloudflare(cc: string, token: string): Promise<{ change: number }> {
  const url = `${CF_BASE}/netflows/summary?dateRange=1d&format=json&location=${cc}`
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`CF ${r.status}`)
  const body = await r.json() as { result?: { summary?: { change?: number } } }
  return { change: body.result?.summary?.change ?? 0 }
}

export async function registerSignalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { countryCode: string } }>(
    '/api/signals/internet/:countryCode',
    async (req, reply) => {
      const cc = req.params.countryCode.toUpperCase()
      if (!/^[A-Z]{2}$/.test(cc)) return reply.status(400).send({ error: 'Invalid country code' })

      const cacheKey = `signals:internet:${cc}`
      const staleKey = `${cacheKey}:stale`

      const cached = await cacheGet<CountryInternetStatus>(cacheKey)
      if (cached) return reply.send(cached)

      try {
        const cfToken = process.env['CLOUDFLARE_RADAR_TOKEN']
        const [iodaResult, ooniResult, cfResult] = await Promise.allSettled([
          fetchIoda(cc),
          fetchOoni(cc),
          cfToken ? fetchCloudflare(cc, cfToken) : Promise.reject(new Error('no token')),
        ])

        const ioda = iodaResult.status === 'fulfilled' ? iodaResult.value : { events: 0, maxScore: 0 }
        const ooni = ooniResult.status === 'fulfilled' ? ooniResult.value : { anomalyRate: 0, confirmed: 0 }
        const cf   = cfResult.status   === 'fulfilled' ? cfResult.value   : undefined

        const status = statusFromSignals(ioda.maxScore, ooni.anomalyRate, cf?.change ?? null)

        const result: CountryInternetStatus = {
          iso2: cc,
          status,
          sources: {
            ioda,
            ooni,
            ...(cf ? { cf } : {}),
          },
          updatedAt: new Date().toISOString(),
        }

        await Promise.all([
          cacheSet(cacheKey, result, TTL_SEC),
          cacheSet(staleKey, result, STALE_SEC),
        ])

        return reply.send(result)
      } catch {
        const stale = await cacheGet<CountryInternetStatus>(staleKey)
        if (stale) return reply.send(stale)
        return reply.status(503).send({ error: 'Internet status unavailable' })
      }
    },
  )
}
