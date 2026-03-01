import type { Aircraft, Vessel, Incident } from '@sentinel/shared'
import { getDb } from './index.js'

export function insertTrail(
  icao24:      string,
  conflictSlug: string,
  ac:          Aircraft,
  timestampMs: number,
): void {
  getDb()
    .prepare(`
      INSERT OR IGNORE INTO aircraft_trails
        (icao24, conflict_slug, callsign, lat, lon, altitude, heading, speed, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      icao24,
      conflictSlug,
      ac.callsign,
      ac.lat,
      ac.lon,
      ac.altitude,
      ac.heading,
      ac.speed,
      Math.floor(timestampMs / 1000),
    )
}

export function pruneOldTrails(maxAgeHours = 24): void {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600
  getDb()
    .prepare('DELETE FROM aircraft_trails WHERE timestamp < ?')
    .run(cutoff)
}

export function insertVesselTrail(
  mmsi:         string,
  conflictSlug: string,
  v:            Vessel,
  timestampMs:  number,
): void {
  getDb()
    .prepare(`
      INSERT OR IGNORE INTO vessel_trails
        (mmsi, conflict_slug, name, lat, lon, heading, speed, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      mmsi,
      conflictSlug,
      v.name,
      v.lat,
      v.lon,
      v.heading,
      v.speed,
      Math.floor(timestampMs / 1000),
    )
}

export function pruneOldVesselTrails(maxAgeHours = 24): void {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600
  getDb()
    .prepare('DELETE FROM vessel_trails WHERE timestamp < ?')
    .run(cutoff)
}

// ── Incidents ─────────────────────────────────────────────────────────────────

interface IncidentRow {
  id: string; conflict_slugs: string; source: string; timestamp: string
  lat: number | null; lon: number | null; location_name: string | null
  category: string; severity: number; title: string; summary: string | null
  actors: string | null; source_url: string | null; confidence: number | null
}

export function incidentExists(id: string): boolean {
  return getDb().prepare('SELECT 1 FROM incidents WHERE id = ?').get(id) !== undefined
}

export function insertIncident(inc: Incident): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO incidents
      (id, conflict_slugs, source, timestamp, lat, lon, location_name,
       category, severity, title, summary, actors, source_url, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    inc.id, JSON.stringify(inc.conflict_slugs), inc.source, inc.timestamp,
    inc.lat, inc.lon, inc.location_name, inc.category, inc.severity,
    inc.title, inc.summary, JSON.stringify(inc.actors),
    inc.source_url ?? null, inc.confidence,
  )
}

export function getRecentIncidents(slug: string, hoursBack = 24, limit = 200): Incident[] {
  const cutoff = new Date(Date.now() - hoursBack * 3_600_000).toISOString()
  const rows = getDb().prepare(`
    SELECT * FROM incidents
    WHERE conflict_slugs LIKE ? AND timestamp > ?
    ORDER BY timestamp DESC LIMIT ?
  `).all(`%"${slug}"%`, cutoff, limit) as IncidentRow[]

  return rows.map(r => ({
    id:             r.id,
    conflict_slugs: JSON.parse(r.conflict_slugs) as string[],
    source:         r.source as Incident['source'],
    timestamp:      r.timestamp,
    lat:            r.lat ?? 0,
    lon:            r.lon ?? 0,
    location_name:  r.location_name ?? '',
    category:       r.category as Incident['category'],
    severity:       r.severity as Incident['severity'],
    title:          r.title,
    summary:        r.summary ?? '',
    actors:         r.actors ? (JSON.parse(r.actors) as string[]) : [],
    ...(r.source_url ? { source_url: r.source_url } : {}),
    confidence:     r.confidence ?? 0.5,
  }))
}

export function pruneOldIncidents(maxAgeDays = 30): void {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString()
  getDb().prepare('DELETE FROM incidents WHERE timestamp < ?').run(cutoff)
}
