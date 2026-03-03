'use client'

import { useState, useEffect, useRef } from 'react'
import type { MorningBrief } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const POLL_PENDING_MS  = 15_000   // retry every 15s while generating
const POLL_FRESH_MS    = 30 * 60_000  // refresh every 30min once we have a brief

interface UseMorningBriefResult {
  brief:   MorningBrief | null
  pending: boolean
  loading: boolean
}

export function useMorningBrief(slug: string): UseMorningBriefResult {
  const [brief,   setBrief]   = useState<MorningBrief | null>(null)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    let cancelled = false

    async function fetchBrief() {
      try {
        const res = await fetch(`${API}/api/conflicts/${slug}/morning-brief`)
        if (cancelled) return

        if (res.status === 202) {
          setPending(true)
          setBrief(null)
          // Retry in 15s — the on-demand generation should complete by then
          timerRef.current = setTimeout(() => void fetchBrief(), POLL_PENDING_MS)
        } else if (res.ok) {
          const data = await res.json() as MorningBrief
          setBrief(data)
          setPending(false)
          // Schedule a normal 30-min refresh
          timerRef.current = setTimeout(() => void fetchBrief(), POLL_FRESH_MS)
        }
      } catch {
        if (!cancelled) {
          setPending(true)
          timerRef.current = setTimeout(() => void fetchBrief(), POLL_PENDING_MS)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchBrief()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [slug])

  return { brief, pending, loading }
}
