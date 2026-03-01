// Spatial + temporal deduplication for incidents
// Prevents the same event from appearing twice due to multiple sources covering it

import type { IncidentCategory } from '@sentinel/shared'
import { getDb } from '../db/index.js'

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Returns true if a similar incident already exists within radiusKm and windowHours
 * of the same category. Used to suppress duplicate coverage of the same event.
 */
export function isDuplicateIncident(
  lat:          number,
  lon:          number,
  timestampIso: string,
  category:     IncidentCategory,
  radiusKm      = 30,
  windowHours   = 2,
): boolean {
  try {
    const db     = getDb()
    const cutoff = new Date(Date.parse(timestampIso) - windowHours * 3_600_000).toISOString()
    const rows   = db.prepare(`
      SELECT lat, lon FROM incidents
      WHERE category = ? AND timestamp > ? AND lat IS NOT NULL AND lon IS NOT NULL
    `).all(category, cutoff) as { lat: number; lon: number }[]

    return rows.some(r => haversineKm(lat, lon, r.lat, r.lon) < radiusKm)
  } catch {
    return false
  }
}
