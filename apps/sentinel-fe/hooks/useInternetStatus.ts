'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type InternetStatus = 'normal' | 'degraded' | 'disrupted' | 'blocked'

export interface CountryInternetStatus {
  iso2:    string
  status:  InternetStatus
  sources: {
    ioda: { events: number; maxScore: number }
    ooni: { anomalyRate: number; confirmed: number }
    cf?:  { change: number }
  }
  updatedAt: string
}

export function useInternetStatus(
  countries: { iso2: string; name: string }[],
): Map<string, CountryInternetStatus> {
  const [results, setResults] = useState<Map<string, CountryInternetStatus>>(new Map())

  useEffect(() => {
    if (!countries.length) return
    let cancelled = false

    async function fetchAll() {
      const entries = await Promise.all(
        countries.map(async c => {
          try {
            const r = await fetch(`${API}/api/signals/internet/${c.iso2}`)
            if (!r.ok) return null
            const data = await r.json() as CountryInternetStatus
            return [c.iso2, data] as const
          } catch {
            return null
          }
        }),
      )
      if (cancelled) return
      const map = new Map<string, CountryInternetStatus>()
      for (const entry of entries) {
        if (entry) map.set(entry[0], entry[1])
      }
      setResults(map)
    }

    void fetchAll()
    const t = setInterval(fetchAll, 15 * 60_000)  // 15-min refresh
    return () => { cancelled = true; clearInterval(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries.map(c => c.iso2).join(',')])

  return results
}
