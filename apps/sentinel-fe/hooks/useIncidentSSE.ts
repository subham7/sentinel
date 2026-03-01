'use client'

import { useState, useEffect, useRef } from 'react'
import type { Incident } from '@sentinel/shared'

type SSEStatus = 'connecting' | 'connected' | 'error'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const MAX_ITEMS = 200

export function useIncidentSSE(slug: string) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [status,    setStatus]    = useState<SSEStatus>('connecting')
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!slug) return

    function connect() {
      const es = new EventSource(`${API}/api/conflicts/${slug}/incidents/stream`)
      esRef.current = es

      es.addEventListener('init', (e: MessageEvent) => {
        setStatus('connected')
        const initial = JSON.parse(e.data) as Incident[]
        setIncidents(initial.slice(0, MAX_ITEMS))
      })

      es.addEventListener('incident', (e: MessageEvent) => {
        const inc = JSON.parse(e.data) as Incident
        setIncidents(prev => [inc, ...prev].slice(0, MAX_ITEMS))
      })

      es.onerror = () => {
        setStatus('error')
        es.close()
        // Reconnect after 5s
        setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [slug])

  return { incidents, status }
}
