// ACLED worker — polls daily for conflict-relevant events
// Endpoint: https://api.acleddata.com/acled/read (OAuth2 Bearer token)
// ACLED updates weekly (Saturdays) but we check daily to catch new data

import { ALL_CONFLICTS }      from '@sentinel/shared'
import type { Incident, ConflictConfig } from '@sentinel/shared'
import { classifyText }        from '../services/classification.js'
import { isDuplicateIncident } from '../services/deduplication.js'
import { incidentExists, insertIncident } from '../db/queries.js'
import { emitIncident }        from '../services/incident-bus.js'
import { getACLEDToken }       from '../services/acled-auth.js'
import { writeFreshness }      from '../services/cache.js'

const ACLED_URL = 'https://api.acleddata.com/acled/read'
const POLL_MS   = 24 * 60 * 60 * 1000   // 24 hours

// ACLED event_type → IncidentCategory mapping
const TYPE_MAP: Record<string, Incident['category']> = {
  'Battles':                     'armed_conflict',
  'Explosions/Remote violence':  'explosion',
  'Violence against civilians':  'armed_conflict',
  'Protests':                    'protest',
  'Riots':                       'protest',
  'Strategic developments':      'diplomatic',
}

interface AcledEvent {
  data_id:        string
  event_date:     string    // YYYY-MM-DD
  event_type:     string
  sub_event_type: string
  actor1:         string
  actor2:         string
  country:        string
  latitude:       string
  longitude:      string
  location:       string
  notes:          string
  fatalities:     string
}

async function pollConflict(conflict: ConflictConfig, token: string): Promise<number> {
  const iso3s   = conflict.dataSources.acled.countries.join('|')
  const today   = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  const params = new URLSearchParams({
    iso3:             iso3s,
    event_date:       `${weekAgo}|${today}`,
    event_date_where: 'BETWEEN',
    _format:          'json',
    limit:            '500',
  })

  let events: AcledEvent[]
  try {
    const resp = await fetch(`${ACLED_URL}?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal:  AbortSignal.timeout(30_000),
    })
    if (!resp.ok) return 0
    const body = await resp.json() as { data?: AcledEvent[] }
    events = body.data ?? []
  } catch {
    return 0
  }

  let inserted = 0

  for (const ev of events) {
    const id  = `acled-${ev.data_id}`
    if (incidentExists(id)) continue

    const lat = parseFloat(ev.latitude)
    const lon = parseFloat(ev.longitude)
    if (isNaN(lat) || isNaN(lon)) continue

    const b = conflict.map.bounds
    if (lat < b.latMin || lat > b.latMax || lon < b.lonMin || lon > b.lonMax) continue

    const timestamp = `${ev.event_date}T12:00:00Z`
    const text      = `${ev.event_type}: ${ev.notes || ev.sub_event_type}`
    const fatalities = parseInt(ev.fatalities ?? '0', 10)

    const category = TYPE_MAP[ev.event_type] ?? 'other'
    const severity: Incident['severity'] =
      fatalities >= 50 ? 5 : fatalities >= 10 ? 4 : fatalities >= 1 ? 3 : 2

    if (isDuplicateIncident(lat, lon, timestamp, category, 15, 12)) continue

    // Run through classifier only for detailed summary / actor extraction
    const cls = await classifyText(text)

    const incident: Incident = {
      id,
      conflict_slugs: [conflict.slug],
      source:         'acled',
      timestamp,
      lat, lon,
      location_name:  ev.location,
      category,
      severity,
      title:          `${ev.event_type} — ${ev.location}`,
      summary:        cls?.summary ?? ev.notes?.slice(0, 300) ?? '',
      actors:         [ev.actor1, ev.actor2].filter(Boolean),
      confidence:     0.85,   // ACLED is high-quality curated data
    }

    insertIncident(incident)
    emitIncident(incident)
    inserted++

    await new Promise(r => setTimeout(r, 100))  // gentle throttle
  }

  return inserted
}

async function poll(): Promise<void> {
  let token: string
  try {
    token = await getACLEDToken()
  } catch (e) {
    console.warn('[acled] auth failed:', (e as Error).message)
    await writeFreshness('acled', 'error', (e as Error).message)
    return
  }

  let anyError = false
  for (const conflict of ALL_CONFLICTS) {
    if (!conflict.dataSources.acled.enabled) continue
    try {
      const n = await pollConflict(conflict, token)
      if (n > 0) console.log(`[acled] ${conflict.slug}: +${n} incidents`)
      else       console.log(`[acled] ${conflict.slug}: no new events`)
    } catch (e) {
      console.warn(`[acled] ${conflict.slug} error:`, (e as Error).message)
      anyError = true
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  await writeFreshness('acled', anyError ? 'error' : 'ok')
}

export function startACLEDWorker(): void {
  if (!process.env.ACLED_EMAIL || !process.env.ACLED_PASSWORD) {
    console.log('[acled] ACLED_EMAIL / ACLED_PASSWORD not set — worker disabled')
    return
  }
  console.log('[acled] worker started (24-hour poll, OAuth2)')
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
