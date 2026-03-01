import { ALL_CONFLICTS, classifyCallsign, sideFromHex, typeFromIcaoCode } from '@sentinel/shared'
import type { Aircraft, AircraftSide, AircraftType, ConflictConfig } from '@sentinel/shared'
import { cacheGet, cacheSet } from '../services/cache.js'
import { CircuitBreaker } from '../services/circuit-breaker.js'
import { insertTrail, pruneOldTrails } from '../db/queries.js'

const breaker  = new CircuitBreaker('adsb.fi', 3, 5 * 60_000)
const TRAIL_MAX = 20
const DELAY_MS  = 1100   // 1.1s between per-point requests

// ── Raw ADS-B shape from adsb.fi ──────────────────────────────────────────────

interface AdsbAc {
  hex:       string
  flight?:   string
  lat?:      number
  lon?:      number
  alt_baro?: number | string   // can be "ground"
  track?:    number
  gs?:       number
  t?:        string            // ICAO type code (e.g. "F35", "KC135")
  mil?:      boolean
  dbFlags?:  number            // bit 0 = military
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inBounds(
  ac:     { lat?: number; lon?: number },
  bounds: ConflictConfig['map']['bounds'],
): boolean {
  return (
    typeof ac.lat === 'number' &&
    typeof ac.lon === 'number' &&
    ac.lat >= bounds.latMin &&
    ac.lat <= bounds.latMax &&
    ac.lon >= bounds.lonMin &&
    ac.lon <= bounds.lonMax
  )
}

async function fetchAdsb(url: string): Promise<AdsbAc[]> {
  const raw = await breaker.exec(() =>
    fetch(url, {
      headers: { 'User-Agent': 'SENTINEL/1.0 sentinel-geoint' },
      signal:  AbortSignal.timeout(12_000),
    }).then(r => {
      if (!r.ok) throw new Error(`adsb.fi HTTP ${r.status} for ${url}`)
      return r.json()
    }),
  )
  // Both /api/v2/mil and /api/v3/... return { ac: [...] }
  return (raw as Record<string, unknown>).ac as AdsbAc[] ?? []
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Classification ─────────────────────────────────────────────────────────────

function classify(ac: AdsbAc): { side: AircraftSide; type: AircraftType; mil: boolean } {
  const callsign = ac.flight?.trim().toUpperCase() ?? ''
  const hexSide  = sideFromHex(ac.hex)
  const csPat    = classifyCallsign(callsign)

  const side: AircraftSide = csPat?.side ?? hexSide

  let type: AircraftType = typeFromIcaoCode(ac.t ?? '')
  if (type === 'unknown' && csPat?.type) type = csPat.type

  const mil =
    ac.mil === true ||
    (ac.dbFlags !== undefined && (ac.dbFlags & 1) !== 0) ||
    (side !== 'UNKNOWN' && type !== 'unknown')

  return { side, type, mil }
}

// ── Main worker loop ──────────────────────────────────────────────────────────

export async function runADSBWorker(): Promise<void> {
  console.log('[adsb] polling...')

  // 1. Fetch global military list
  let milGlobal: AdsbAc[] = []
  try {
    milGlobal = await fetchAdsb('https://opendata.adsb.fi/api/v2/mil')
    console.log(`[adsb] mil global: ${milGlobal.length} ac`)
  } catch (e) {
    console.warn('[adsb] /api/v2/mil error:', (e as Error).message)
  }

  // 2. Per-conflict processing
  for (const conflict of ALL_CONFLICTS) {
    if (!conflict.dataSources.adsb.enabled) continue

    const allRaw = new Map<string, AdsbAc>()

    // Seed from global mil list (pre-filtered to conflict bounds)
    for (const ac of milGlobal) {
      if (ac.hex && inBounds(ac, conflict.map.bounds)) {
        allRaw.set(ac.hex, ac)
      }
    }

    // Per-query-point fetches (catches non-military-flagged aircraft in theater)
    for (const { lat, lon, radiusNm } of conflict.dataSources.adsb.queryPoints) {
      await sleep(DELAY_MS)
      try {
        const url = `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${radiusNm}`
        const acs = await fetchAdsb(url)
        for (const ac of acs) {
          if (ac.hex && inBounds(ac, conflict.map.bounds)) {
            allRaw.set(ac.hex, ac)
          }
        }
      } catch (e) {
        console.warn(`[adsb] query-point error (${conflict.slug}):`, (e as Error).message)
      }
    }

    // 3. Read existing state to maintain trails
    const existing    = (await cacheGet<Aircraft[]>(`aircraft:${conflict.slug}`)) ?? []
    const existingMap = new Map<string, Aircraft>(existing.map(a => [a.icao24, a]))

    // 4. Build new aircraft state
    const aircraft: Aircraft[] = []
    const now = Date.now()

    for (const [hex, ac] of allRaw) {
      if (typeof ac.lat !== 'number' || typeof ac.lon !== 'number') continue

      const alt    = typeof ac.alt_baro === 'number' ? ac.alt_baro : 0
      const prev   = existingMap.get(hex)
      const newPos = [ac.lon, ac.lat] as [number, number]
      const trail  = prev
        ? [...prev.trail, newPos].slice(-TRAIL_MAX)
        : [newPos]

      const { side, type, mil } = classify(ac)

      const item: Aircraft = {
        icao24:   hex,
        callsign: ac.flight?.trim() ?? hex,
        lat:      ac.lat,
        lon:      ac.lon,
        altitude: alt,
        heading:  ac.track ?? 0,
        speed:    ac.gs ?? 0,
        type,
        side,
        mil,
        last_seen: now,
        trail,
      }

      aircraft.push(item)

      // Persist trail point (non-fatal)
      try {
        insertTrail(hex, conflict.slug, item, now)
      } catch { /* SQLite unavailable during early startup */ }
    }

    // 5. Write to cache (fresh 30s + stale 24h)
    await cacheSet(`aircraft:${conflict.slug}`, aircraft, 30)
    await cacheSet(`aircraft:${conflict.slug}:stale`, aircraft, 86400)

    // Strike package detection (us-iran only)
    if (conflict.slug === 'us-iran') {
      const fighters = aircraft.filter(a => a.side === 'US' && a.type === 'fighter').length
      const tankers  = aircraft.filter(a => a.side === 'US' && a.type === 'tanker').length
      if (fighters >= 3 && tankers >= 1) {
        console.warn(`[adsb] STRIKE PACKAGE: ${fighters} fighters + ${tankers} tankers in ${conflict.slug}`)
      }
    }

    console.log(`[adsb] ${conflict.slug}: ${aircraft.length} ac cached`)
  }

  // Prune old trail rows periodically (non-fatal)
  try {
    pruneOldTrails(24)
  } catch { /* SQLite unavailable */ }
}

export function startADSBWorker(intervalMs = 30_000): ReturnType<typeof setInterval> {
  // Run immediately, then every intervalMs
  void runADSBWorker()
  return setInterval(() => void runADSBWorker(), intervalMs)
}
