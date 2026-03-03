/**
 * Country Instability Index (CII)
 *
 * Composite 0–100 score from live incident data + 30-day trend.
 * Formula: (baseline×0.4) + (unrest×0.2) + (security×0.2) + (velocity×0.2)
 */

import type { Incident } from '@sentinel/shared'
import type { TrendPoint } from '@/hooks/useIncidentTrend'

export type CIILevel = 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW'

export interface CIIScore {
  score:    number    // 0–100 composite
  level:    CIILevel
  color:    string
  baseline: number   // 0–100 component — today vs 30d avg
  unrest:   number   // 0–100 component — high-sev proportion
  security: number   // 0–100 component — military-category proportion
  velocity: number   // 0–100 component — 2h event-rate acceleration
}

const MILITARY_CATEGORIES = new Set([
  'armed_conflict', 'missile', 'drone', 'naval', 'explosion',
])

export function levelFromScore(score: number): { level: CIILevel; color: string } {
  if (score >= 75) return { level: 'CRITICAL', color: '#ef4444' }
  if (score >= 55) return { level: 'HIGH',     color: '#f97316' }
  if (score >= 35) return { level: 'ELEVATED', color: '#eab308' }
  if (score >= 15) return { level: 'MODERATE', color: '#84cc16' }
  return               { level: 'LOW',      color: '#22c55e' }
}

export function computeCII(incidents: Incident[], trend: TrendPoint[]): CIIScore {
  const now  = Date.now()
  const MS2H = 2 * 60 * 60 * 1000

  // ── baseline: today's count vs 30-day average ─────────────────────────
  let baseline = 0
  if (trend.length >= 2) {
    const avg30      = trend.reduce((s, t) => s + t.count, 0) / trend.length
    const todayPoint = trend[trend.length - 1]
    if (avg30 > 0 && todayPoint) {
      baseline = Math.min(100, (todayPoint.count / avg30) * 50)
    }
  } else if (incidents.length > 0) {
    // Rough proxy when trend not yet loaded
    baseline = Math.min(100, incidents.length * 2)
  }

  // ── unrest: proportion of severity ≥ 4 incidents ──────────────────────
  let unrest = 0
  if (incidents.length > 0) {
    const highSev = incidents.filter(i => i.severity >= 4).length
    unrest = (highSev / incidents.length) * 100
  }

  // ── security: proportion of military-category incidents ───────────────
  let security = 0
  if (incidents.length > 0) {
    const milCount = incidents.filter(i => MILITARY_CATEGORIES.has(i.category)).length
    security = (milCount / incidents.length) * 100
  }

  // ── velocity: 2h event-rate relative to prior 2h ──────────────────────
  let velocity = 0
  const recent2h = incidents.filter(i => now - new Date(i.timestamp).getTime() < MS2H).length
  const prev2h   = incidents.filter(i => {
    const age = now - new Date(i.timestamp).getTime()
    return age >= MS2H && age < MS2H * 2
  }).length
  if (prev2h > 0) {
    velocity = Math.min(100, (recent2h / prev2h) * 50)
  } else if (recent2h > 0) {
    // No prior-window reference — treat each new event as accelerating
    velocity = Math.min(100, recent2h * 5)
  }

  const score = (baseline * 0.4) + (unrest * 0.2) + (security * 0.2) + (velocity * 0.2)
  const { level, color } = levelFromScore(score)

  return {
    score:    Math.round(score),
    level,
    color,
    baseline: Math.round(baseline),
    unrest:   Math.round(unrest),
    security: Math.round(security),
    velocity: Math.round(velocity),
  }
}
