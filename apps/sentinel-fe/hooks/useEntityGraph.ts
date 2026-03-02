'use client'

import { useState, useEffect } from 'react'
import type { EntityGraph } from '@sentinel/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface UseEntityGraphResult {
  graph:   EntityGraph | null
  pending: boolean
  loading: boolean
}

export function useEntityGraph(slug: string): UseEntityGraphResult {
  const [graph,   setGraph]   = useState<EntityGraph | null>(null)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)

    async function fetchGraph() {
      try {
        const res = await fetch(`${API}/api/conflicts/${slug}/entity-graph`)
        if (res.status === 202) {
          setPending(true)
        } else if (res.ok) {
          const data = await res.json() as EntityGraph
          setGraph(data)
          setPending(false)
        }
      } catch {
        setPending(true)
      } finally {
        setLoading(false)
      }
    }

    void fetchGraph()
    // Refresh hourly
    const t = setInterval(() => void fetchGraph(), 60 * 60_000)
    return () => clearInterval(t)
  }, [slug])

  return { graph, pending, loading }
}
