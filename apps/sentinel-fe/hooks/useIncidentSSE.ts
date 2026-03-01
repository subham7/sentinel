'use client'

import { useState, useEffect, useRef } from 'react'
import type { Incident } from '@sentinel/shared'
import { useVisibility } from './useVisibility'
import { useInactivity } from './useInactivity'

type SSEStatus = 'connecting' | 'connected' | 'error'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const MAX_ITEMS = 200

export function useIncidentSSE(slug: string) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [status,    setStatus]    = useState<SSEStatus>('connecting')
  const esRef       = useRef<EventSource | null>(null)
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deadRef     = useRef(false)

  const visible  = useVisibility()
  const inactive = useInactivity()

  function disconnect() {
    if (reconnTimer.current) clearTimeout(reconnTimer.current)
    esRef.current?.close()
    esRef.current = null
  }

  function connect() {
    if (deadRef.current || !slug) return
    disconnect()

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
      if (!deadRef.current) {
        reconnTimer.current = setTimeout(connect, 5000)
      }
    }
  }

  // Mount / unmount
  useEffect(() => {
    if (!slug) return
    deadRef.current = false
    connect()
    return () => {
      deadRef.current = true
      disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Pause when hidden or inactive; resume immediately when active again
  useEffect(() => {
    if (!slug) return
    if (!visible || inactive) {
      disconnect()
      setStatus('connecting')
    } else {
      connect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, inactive, slug])

  return { incidents, status }
}
