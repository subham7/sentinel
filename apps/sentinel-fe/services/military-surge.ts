// Browser-side military surge detection using Welford streaming mean/variance
// Baseline stored in localStorage per conflict slug

import type { Aircraft, Vessel } from '@sentinel/shared'

export type SurgeSeverity = 'elevated' | 'high' | 'critical'

export interface SurgeAlert {
  metric:   'aircraft' | 'vessels'
  severity: SurgeSeverity
  zScore:   number
  current:  number
  mean:     number
}

interface WelfordState {
  n:          number
  mean:       number
  M2:         number
  lastSample: number  // unix ms
}

interface Baseline {
  aircraft: WelfordState
  vessels:  WelfordState
}

const STORAGE_KEY = (slug: string) => `surge_baseline_${slug}`
const MAX_AGE_MS  = 30 * 24 * 3_600_000  // 30 days

// ── Welford online algorithm ──────────────────────────────────────────────────

function welfordUpdate(state: WelfordState, value: number): WelfordState {
  const n    = state.n + 1
  const delta  = value - state.mean
  const mean   = state.mean + delta / n
  const delta2 = value - mean
  const M2     = state.M2 + delta * delta2
  return { n, mean, M2, lastSample: Date.now() }
}

function welfordVariance(state: WelfordState): number {
  if (state.n < 2) return 1   // Not enough data — avoid div-by-zero
  return state.M2 / (state.n - 1)
}

function welfordStdDev(state: WelfordState): number {
  return Math.sqrt(welfordVariance(state))
}

function zScore(state: WelfordState, value: number): number {
  const std = welfordStdDev(state)
  if (std === 0) return 0
  return (value - state.mean) / std
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadBaseline(slug: string): Baseline {
  const empty: WelfordState = { n: 0, mean: 0, M2: 0, lastSample: 0 }
  if (typeof window === 'undefined') return { aircraft: { ...empty }, vessels: { ...empty } }
  try {
    const raw  = localStorage.getItem(STORAGE_KEY(slug))
    if (!raw) return { aircraft: { ...empty }, vessels: { ...empty } }
    const data = JSON.parse(raw) as Baseline
    // Prune stale baselines (>30 days)
    const now  = Date.now()
    if (data.aircraft.lastSample && now - data.aircraft.lastSample > MAX_AGE_MS) {
      data.aircraft = { ...empty }
    }
    if (data.vessels.lastSample && now - data.vessels.lastSample > MAX_AGE_MS) {
      data.vessels = { ...empty }
    }
    return data
  } catch {
    return { aircraft: { ...empty }, vessels: { ...empty } }
  }
}

function saveBaseline(slug: string, baseline: Baseline): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY(slug), JSON.stringify(baseline))
  } catch {
    // Quota exceeded or private mode — non-fatal
  }
}

// ── Strike package detection ──────────────────────────────────────────────────

export function detectStrikePackage(aircraft: Aircraft[]): boolean {
  const hasTanker  = aircraft.some(a => a.type === 'tanker')
  const fighters   = aircraft.filter(a => a.type === 'fighter').length
  const hasISR     = aircraft.some(a => a.type === 'isr')
  return hasTanker && fighters >= 2 && hasISR
}

// ── Surge detection ───────────────────────────────────────────────────────────

export function detectSurge(
  slug:     string,
  aircraft: Aircraft[],
  vessels:  Vessel[],
): SurgeAlert[] {
  const baseline = loadBaseline(slug)

  // Update Welford state with current observations
  const acCount  = aircraft.length
  const vsCount  = vessels.length

  baseline.aircraft = welfordUpdate(baseline.aircraft, acCount)
  baseline.vessels  = welfordUpdate(baseline.vessels,  vsCount)
  saveBaseline(slug, baseline)

  // Need at least 5 samples before surfacing alerts (avoid false positives at startup)
  const alerts: SurgeAlert[] = []

  if (baseline.aircraft.n >= 5) {
    const z = zScore(baseline.aircraft, acCount)
    if (z >= 1.5) {
      alerts.push({
        metric:   'aircraft',
        severity: z >= 3.0 ? 'critical' : z >= 2.0 ? 'high' : 'elevated',
        zScore:   Math.round(z * 10) / 10,
        current:  acCount,
        mean:     Math.round(baseline.aircraft.mean),
      })
    }
  }

  if (baseline.vessels.n >= 5) {
    const z = zScore(baseline.vessels, vsCount)
    if (z >= 1.5) {
      alerts.push({
        metric:   'vessels',
        severity: z >= 3.0 ? 'critical' : z >= 2.0 ? 'high' : 'elevated',
        zScore:   Math.round(z * 10) / 10,
        current:  vsCount,
        mean:     Math.round(baseline.vessels.mean),
      })
    }
  }

  return alerts
}
