'use client'

import { useState, useEffect, useCallback } from 'react'

export type FreshnessStatus = 'fresh' | 'stale' | 'error' | 'disabled'

export interface FreshnessSource {
  id:        string
  label:     string
  status:    FreshnessStatus
  updatedAt: string | null
  error:     string | null
}

// Per-source "fresh" threshold — how old before we consider it stale
const FRESH_THRESHOLD_MS: Record<string, number> = {
  adsb:     2  * 60_000,          // 30s poll → stale after 2 min
  ais:      2  * 60_000,          // 15s write → stale after 2 min
  gdelt:    20 * 60_000,          // 15 min poll → stale after 20 min
  acled:    26 * 60 * 60_000,     // 24h poll → stale after 26h
  telegram: 10 * 60_000,          // 4 min poll → stale after 10 min
  iaea:      8 * 24 * 60 * 60_000, // weekly → stale after 8 days
}

const STALE_THRESHOLD_MS: Record<string, number> = {
  adsb:     10 * 60_000,
  ais:      10 * 60_000,
  gdelt:    60 * 60_000,
  acled:    72 * 60 * 60_000,
  telegram: 30 * 60_000,
  iaea:     14 * 24 * 60 * 60_000,
}

const SOURCE_LABELS: Record<string, string> = {
  adsb:     'ADS-B',
  ais:      'AIS',
  gdelt:    'GDELT',
  acled:    'ACLED',
  telegram: 'TELEGRAM',
  iaea:     'IAEA',
}

interface ApiSource {
  id:        string
  updatedAt: string | null
  result:    'ok' | 'error' | null
  error:     string | null
}

function computeStatus(src: ApiSource): FreshnessStatus {
  if (!src.updatedAt) return 'disabled'
  if (src.result === 'error') return 'error'

  const age = Date.now() - new Date(src.updatedAt).getTime()
  const freshMs = FRESH_THRESHOLD_MS[src.id] ?? 60_000
  const staleMs = STALE_THRESHOLD_MS[src.id] ?? 300_000

  if (age <= freshMs) return 'fresh'
  if (age <= staleMs) return 'stale'
  return 'error'
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function useDataFreshness(pollIntervalMs = 60_000): FreshnessSource[] {
  const [sources, setSources] = useState<FreshnessSource[]>([])

  const fetch_ = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/health/freshness`)
      if (!resp.ok) return
      const json = (await resp.json()) as { sources: ApiSource[] }
      setSources(
        json.sources.map(src => ({
          id:        src.id,
          label:     SOURCE_LABELS[src.id] ?? src.id.toUpperCase(),
          status:    computeStatus(src),
          updatedAt: src.updatedAt,
          error:     src.error,
        })),
      )
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    void fetch_()
    const id = setInterval(() => void fetch_(), pollIntervalMs)
    return () => clearInterval(id)
  }, [fetch_, pollIntervalMs])

  return sources
}
