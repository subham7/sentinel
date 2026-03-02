'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export interface TrendPoint {
  date:        string
  count:       number
  avgSeverity: number
}

export function useIncidentTrend(slug: string, days = 30): TrendPoint[] {
  const [trend, setTrend] = useState<TrendPoint[]>([])

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    fetch(`${API}/api/conflicts/${slug}/incidents/trend?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { trend?: TrendPoint[] } | null) => {
        if (!cancelled && data?.trend) setTrend(data.trend)
      })
      .catch(() => { /* non-fatal */ })

    // Refresh every hour
    const t = setInterval(() => {
      fetch(`${API}/api/conflicts/${slug}/incidents/trend?days=${days}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { trend?: TrendPoint[] } | null) => {
          if (!cancelled && data?.trend) setTrend(data.trend)
        })
        .catch(() => { /* non-fatal */ })
    }, 60 * 60_000)

    return () => { cancelled = true; clearInterval(t) }
  }, [slug, days])

  return trend
}
