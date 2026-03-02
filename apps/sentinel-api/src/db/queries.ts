import type { Aircraft, Vessel, Incident, TelegramMedia } from '@sentinel/shared'
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

export function getIncidentTrend(
  slug: string,
  days: number,
): { date: string; count: number; avgSeverity: number }[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  return getDb().prepare(`
    SELECT
      substr(timestamp, 1, 10) AS date,
      COUNT(*) AS count,
      ROUND(AVG(severity), 2) AS avgSeverity
    FROM incidents
    WHERE conflict_slugs LIKE ? AND timestamp > ?
    GROUP BY date
    ORDER BY date ASC
  `).all(`%"${slug}"%`, cutoff) as { date: string; count: number; avgSeverity: number }[]
}

export function getIncidentCategoryBreakdown(
  slug: string,
  days: number,
): { category: string; count: number }[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  return getDb().prepare(`
    SELECT category, COUNT(*) AS count
    FROM incidents
    WHERE conflict_slugs LIKE ? AND timestamp > ?
    GROUP BY category
    ORDER BY count DESC
  `).all(`%"${slug}"%`, cutoff) as { category: string; count: number }[]
}

// ── Nuclear site status (IAEA worker) ──────────────────────────────────────

export function upsertNuclearSiteStatus(
  siteId:       string,
  conflictSlug: string,
  name:         string,
  status:       string,
  notes:        string,
): void {
  getDb().prepare(`
    INSERT INTO nuclear_site_status (site_id, conflict_slug, name, status, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(site_id) DO UPDATE SET
      status     = excluded.status,
      notes      = excluded.notes,
      updated_at = excluded.updated_at
  `).run(siteId, conflictSlug, name, status, notes)
}

interface NuclearStatusRow {
  site_id:    string
  status:     string
  notes:      string | null
  updated_at: number
}

export function getNuclearSiteStatuses(conflictSlug: string): { siteId: string; status: string; notes: string | null; updatedAt: number }[] {
  const rows = getDb().prepare(
    'SELECT site_id, status, notes, updated_at FROM nuclear_site_status WHERE conflict_slug = ?'
  ).all(conflictSlug) as NuclearStatusRow[]
  return rows.map(r => ({ siteId: r.site_id, status: r.status, notes: r.notes, updatedAt: r.updated_at }))
}

// ── AIS ship-to-ship transfer events ───────────────────────────────────────

export function upsertSTSEvent(
  conflictSlug: string,
  mmsiA:        string,
  mmsiB:        string,
  lat:          number,
  lon:          number,
  startedAt:    number,
): void {
  // Insert only if no open event for this pair in the last 3h
  const cutoff = startedAt - 3 * 3600
  const existing = getDb().prepare(`
    SELECT id FROM ais_sts_events
    WHERE conflict_slug = ? AND ((mmsi_a = ? AND mmsi_b = ?) OR (mmsi_a = ? AND mmsi_b = ?))
      AND started_at > ? AND ended_at IS NULL
  `).get(conflictSlug, mmsiA, mmsiB, mmsiB, mmsiA, cutoff)
  if (existing) return

  getDb().prepare(`
    INSERT INTO ais_sts_events (conflict_slug, mmsi_a, mmsi_b, lat, lon, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(conflictSlug, mmsiA, mmsiB, lat, lon, startedAt)
}

export function closeSTSEvents(
  conflictSlug: string,
  mmsiA: string,
  mmsiB: string,
  endedAt: number,
): void {
  getDb().prepare(`
    UPDATE ais_sts_events SET ended_at = ?, duration_min = (? - started_at) / 60
    WHERE conflict_slug = ? AND ((mmsi_a = ? AND mmsi_b = ?) OR (mmsi_a = ? AND mmsi_b = ?))
      AND ended_at IS NULL
  `).run(endedAt, endedAt, conflictSlug, mmsiA, mmsiB, mmsiB, mmsiA)
}

export function getOpenSTSCount(): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) AS n FROM ais_sts_events WHERE ended_at IS NULL'
  ).get() as { n: number } | undefined
  return row?.n ?? 0
}

// ── Telegram media ──────────────────────────────────────────────────────────

interface MediaRow {
  id: string; conflict_slug: string; channel: string; message_id: number
  media_type: string; url: string; thumbnail_url: string | null
  posted_at: string; caption: string | null; view_count: number
}

export function telegramMediaExists(id: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM telegram_media WHERE id = ?').get(id)
}

export function insertTelegramMedia(item: {
  id: string; conflict_slug: string; channel: string; message_id: number
  media_type: string; url: string; thumbnail_url: string | null
  posted_at: string; caption: string | null; view_count: number
}): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO telegram_media
      (id, conflict_slug, channel, message_id, media_type, url, thumbnail_url, posted_at, caption, view_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id, item.conflict_slug, item.channel, item.message_id,
    item.media_type, item.url, item.thumbnail_url,
    item.posted_at, item.caption, item.view_count,
  )
}

export function getRecentMedia(slug: string, limit: number, offset: number): TelegramMedia[] {
  const rows = getDb().prepare(`
    SELECT id, conflict_slug, channel, message_id, media_type, url, thumbnail_url,
           posted_at, caption, view_count
    FROM telegram_media
    WHERE conflict_slug = ? AND is_visible = 1
    ORDER BY posted_at DESC
    LIMIT ? OFFSET ?
  `).all(slug, limit, offset) as MediaRow[]
  return rows.map(r => ({
    id:            r.id,
    conflict_slug: r.conflict_slug,
    channel:       r.channel,
    message_id:    r.message_id,
    media_type:    r.media_type as 'photo' | 'video',
    url:           r.url,
    thumbnail_url: r.thumbnail_url,
    posted_at:     r.posted_at,
    caption:       r.caption,
    view_count:    r.view_count,
  }))
}

export function getMediaCount(slug: string): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) AS n FROM telegram_media WHERE conflict_slug = ? AND is_visible = 1'
  ).get(slug) as { n: number } | undefined
  return row?.n ?? 0
}

export function pruneOldMedia(maxAgeDays = 30): void {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString()
  getDb().prepare('DELETE FROM telegram_media WHERE posted_at < ?').run(cutoff)
}
