'use client'

import { useEffect, useState, useCallback } from 'react'
import type { MarketsData } from '@sentinel/shared'

const API        = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REFETCH_MS = 15 * 60 * 1000   // 15 min (matches worker poll interval)

export function useMarketsData(slug: string): { data: MarketsData | null; loading: boolean } {
  const [data,    setData]    = useState<MarketsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/conflicts/${slug}/markets`)
      if (r.ok || r.status === 202) {
        const json = await r.json() as MarketsData & { pending?: boolean }
        if (!json.pending) setData(json)
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), REFETCH_MS)
    return () => clearInterval(id)
  }, [load])

  return { data, loading }
}
