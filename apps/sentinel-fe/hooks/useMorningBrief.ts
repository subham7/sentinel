'use client'

import { useState, useEffect } from 'react'
import type { MorningBrief } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface UseMorningBriefResult {
  brief:   MorningBrief | null
  pending: boolean
  loading: boolean
}

export function useMorningBrief(slug: string): UseMorningBriefResult {
  const [brief,   setBrief]   = useState<MorningBrief | null>(null)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)

    async function fetchBrief() {
      try {
        const res = await fetch(`${API}/api/conflicts/${slug}/morning-brief`)
        if (res.status === 202) {
          setPending(true)
          setBrief(null)
        } else if (res.ok) {
          const data = await res.json() as MorningBrief
          setBrief(data)
          setPending(false)
        }
      } catch {
        setPending(true)
      } finally {
        setLoading(false)
      }
    }

    void fetchBrief()
    // Refresh every 30 min
    const t = setInterval(() => void fetchBrief(), 30 * 60_000)
    return () => clearInterval(t)
  }, [slug])

  return { brief, pending, loading }
}
