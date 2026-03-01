// GDELT GEO API worker — polls every 15 minutes per enabled conflict
// Endpoint: https://api.gdeltproject.org/api/v2/geo/geo (no auth required)

import { createHash } from 'node:crypto'
import { ALL_CONFLICTS } from '@sentinel/shared'
import type { Incident, ConflictConfig } from '@sentinel/shared'
import { classifyText }       from '../services/classification.js'
import { isDuplicateIncident } from '../services/deduplication.js'
import { incidentExists, insertIncident } from '../db/queries.js'
import { emitIncident }       from '../services/incident-bus.js'

const GDELT_GEO = 'https://api.gdeltproject.org/api/v2/geo/geo'
const POLL_MS   = 15 * 60 * 1000   // 15 minutes

interface GdeltFeature {
  type:       'Feature'
  geometry:   { type: 'Point'; coordinates: [number, number] }
  properties: {
    name:        string
    url:         string
    urltone:     number
    numarticles: number
    dateadded:   string   // YYYYMMDDHHMMSS UTC
  }
}

function parseDateadded(s: string): string {
  // "20260301143000" → "2026-03-01T14:30:00Z"
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`
}

function inBounds(lat: number, lon: number, c: ConflictConfig): boolean {
  const b = c.map.bounds
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax
}

async function pollConflict(conflict: ConflictConfig): Promise<number> {
  const { keywords } = conflict.dataSources.gdelt
  if (!keywords.length) return 0

  const query = keywords.slice(0, 4).join(' OR ')
  const url   = `${GDELT_GEO}?query=${encodeURIComponent(query)}&format=geojson&maxrows=250&timespan=15min`

  let geojson: { features?: GdeltFeature[] }
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!resp.ok) return 0
    geojson = await resp.json() as { features?: GdeltFeature[] }
  } catch {
    return 0
  }

  const features = geojson.features ?? []
  let inserted   = 0

  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates
    if (!inBounds(lat, lon, conflict)) continue

    const p         = f.properties
    const id        = `gdelt-${createHash('sha256').update(p.url).digest('hex').slice(0, 16)}`
    if (incidentExists(id)) continue

    const timestamp = parseDateadded(p.dateadded)
    const text      = p.name

    const cls = await classifyText(text)
    if (!cls || !cls.is_conflict_related) continue

    if (isDuplicateIncident(lat, lon, timestamp, cls.event_type)) continue

    const incident: Incident = {
      id,
      conflict_slugs: [conflict.slug],
      source:         'gdelt',
      timestamp,
      lat, lon,
      location_name:  cls.location.place || p.name.slice(0, 80),
      category:       cls.event_type,
      severity:       cls.severity,
      title:          p.name.slice(0, 200),
      summary:        cls.summary,
      actors:         cls.actors,
      source_url:     p.url,
      confidence:     cls.confidence,
    }

    insertIncident(incident)
    emitIncident(incident)
    inserted++
  }

  return inserted
}

async function poll(): Promise<void> {
  for (const conflict of ALL_CONFLICTS) {
    if (!conflict.dataSources.gdelt.enabled) continue
    try {
      const n = await pollConflict(conflict)
      if (n > 0) console.log(`[gdelt] ${conflict.slug}: +${n} incidents`)
    } catch (e) {
      console.warn(`[gdelt] ${conflict.slug} error:`, (e as Error).message)
    }
    await new Promise(r => setTimeout(r, 2000))  // 2s between conflicts
  }
}

export function startGDELTWorker(): void {
  console.log('[gdelt] worker started (15-min poll)')
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
