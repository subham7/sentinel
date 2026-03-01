// Browser-side signal convergence detection
// Builds a 0.5°×0.5° grid and alerts when ≥3 distinct signal types overlap

import type { Aircraft, Vessel, Incident } from '@sentinel/shared'

export interface ConvergenceAlert {
  cellId:     string    // e.g. "26.5_51.0"
  centerLat:  number
  centerLon:  number
  signals:    ('aircraft' | 'vessel' | 'incident')[]
  entityCount: number
}

const GRID_DEG = 0.5

function cellKey(lat: number, lon: number): string {
  const cellLat = Math.floor(lat / GRID_DEG) * GRID_DEG
  const cellLon = Math.floor(lon / GRID_DEG) * GRID_DEG
  return `${cellLat}_${cellLon}`
}

function cellCenter(key: string): { lat: number; lon: number } {
  const [latStr, lonStr] = key.split('_')
  return {
    lat: parseFloat(latStr ?? '0') + GRID_DEG / 2,
    lon: parseFloat(lonStr ?? '0') + GRID_DEG / 2,
  }
}

export function detectConvergence(
  aircraft:  Aircraft[],
  vessels:   Vessel[],
  incidents: Incident[],
): ConvergenceAlert[] {
  // Map: cellId → { signal types present, total entity count }
  const cells = new Map<string, {
    signals: Set<'aircraft' | 'vessel' | 'incident'>
    count:   number
  }>()

  const ensure = (key: string) => {
    if (!cells.has(key)) cells.set(key, { signals: new Set(), count: 0 })
    return cells.get(key)!
  }

  for (const ac of aircraft) {
    const key  = cellKey(ac.lat, ac.lon)
    const cell = ensure(key)
    cell.signals.add('aircraft')
    cell.count++
  }

  for (const v of vessels) {
    const key  = cellKey(v.lat, v.lon)
    const cell = ensure(key)
    cell.signals.add('vessel')
    cell.count++
  }

  // Only include incidents from last 24h
  const cutoff = Date.now() - 24 * 3_600_000
  for (const inc of incidents) {
    if (new Date(inc.timestamp).getTime() < cutoff) continue
    if (!inc.lat || !inc.lon) continue
    const key  = cellKey(inc.lat, inc.lon)
    const cell = ensure(key)
    cell.signals.add('incident')
    cell.count++
  }

  const alerts: ConvergenceAlert[] = []
  for (const [key, cell] of cells.entries()) {
    if (cell.signals.size < 3) continue
    const center = cellCenter(key)
    alerts.push({
      cellId:      key,
      centerLat:   center.lat,
      centerLon:   center.lon,
      signals:     Array.from(cell.signals),
      entityCount: cell.count,
    })
  }

  // Sort by entity count descending
  return alerts.sort((a, b) => b.entityCount - a.entityCount)
}
