'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface NuclearStatusEntry {
  siteId:    string
  status:    string
  notes:     string | null
  updatedAt: number | null
  source:    'iaea' | 'config'
}

/** Returns a siteId → status map, fetched once on mount. Non-fatal on error. */
export function useNuclearStatus(slug: string): Map<string, string> {
  const [statusMap, setStatusMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!slug) return
    fetch(`${API}/api/conflicts/${slug}/nuclear`)
      .then(r => r.ok ? r.json() : null)
      .then((body: { sites?: NuclearStatusEntry[] } | null) => {
        if (!body?.sites?.length) return
        const map = new Map<string, string>()
        for (const site of body.sites) {
          if (site.source === 'iaea') map.set(site.siteId, site.status)
        }
        if (map.size > 0) setStatusMap(map)
      })
      .catch(() => {})  // fallback to static config data in TheaterMap
  }, [slug])

  return statusMap
}
