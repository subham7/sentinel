'use client'

import { useState, useEffect } from 'react'
import type { SitrepReport } from '@sentinel/shared'

const API_BASE  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REFETCH_MS = 60 * 60 * 1000  // 60 minutes

export function useSitrepReport(slug: string): {
  report:  SitrepReport | null
  loading: boolean
  pending: boolean   // API returned 202 — not yet generated
} {
  const [report,  setReport]  = useState<SitrepReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchSitrep() {
      try {
        setLoading(true)
        const resp = await fetch(`${API_BASE}/api/conflicts/${slug}/sitrep`)
        if (cancelled) return

        if (resp.status === 202) {
          setPending(true)
          setReport(null)
          return
        }

        if (resp.ok) {
          const data = await resp.json() as SitrepReport
          if (!cancelled) {
            setReport(data)
            setPending(false)
          }
        }
      } catch {
        // Non-fatal — keep last report if any
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchSitrep()
    const timer = setInterval(() => void fetchSitrep(), REFETCH_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [slug])

  return { report, loading, pending }
}
