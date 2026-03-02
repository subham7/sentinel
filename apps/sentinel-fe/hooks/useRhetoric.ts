'use client'

import { useState, useEffect } from 'react'
import type { RhetoricScore } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface UseRhetoricResult {
  data:    RhetoricScore | null
  pending: boolean
  loading: boolean
}

export function useRhetoric(slug: string): UseRhetoricResult {
  const [data,    setData]    = useState<RhetoricScore | null>(null)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)

    async function fetchRhetoric() {
      try {
        const res = await fetch(`${API}/api/conflicts/${slug}/rhetoric`)
        if (res.status === 202) {
          setPending(true)
        } else if (res.ok) {
          const d = await res.json() as RhetoricScore
          setData(d)
          setPending(false)
        }
      } catch {
        setPending(true)
      } finally {
        setLoading(false)
      }
    }

    void fetchRhetoric()
    // Refresh every 4h
    const t = setInterval(() => void fetchRhetoric(), 4 * 60 * 60_000)
    return () => clearInterval(t)
  }, [slug])

  return { data, pending, loading }
}
