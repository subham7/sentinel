'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Vessel } from '@sentinel/shared'
import { useVisibility } from './useVisibility'
import { useInactivity } from './useInactivity'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const WS_BASE  = API_BASE.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws'))

export type WsStatus = 'connecting' | 'live' | 'stale' | 'error'

export interface UseVesselWSResult {
  vessels:   Vessel[]
  status:    WsStatus
  darkCount: number
}

export function useVesselWebSocket(slug: string): UseVesselWSResult {
  const [vessels,   setVessels]   = useState<Vessel[]>([])
  const [status,    setStatus]    = useState<WsStatus>('connecting')
  const [darkCount, setDarkCount] = useState(0)

  const wsRef    = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retries  = useRef(0)
  const dead     = useRef(false)

  const visible  = useVisibility()
  const inactive = useInactivity()

  const connect = useCallback(() => {
    if (dead.current) return

    const ws = new WebSocket(`${WS_BASE}/ws/conflicts/${slug}/vessels`)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      retries.current = 0
      setStatus('live')
    }

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as { vessels?: Vessel[]; dark_count?: number }
        if (Array.isArray(data.vessels)) {
          setVessels(data.vessels)
          setDarkCount(data.dark_count ?? 0)
        }
        setStatus('live')
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      if (dead.current) return
      setStatus('stale')
      const delay = Math.min(30_000, 1000 * Math.pow(2, retries.current))
      retries.current++
      timerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      setStatus('error')
    }
  }, [slug])

  // Mount / unmount
  useEffect(() => {
    dead.current = false
    connect()
    return () => {
      dead.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Pause when hidden or inactive; resume immediately when active again
  useEffect(() => {
    if (!visible || inactive) {
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
      wsRef.current = null
      setStatus('stale')
    } else {
      retries.current = 0
      connect()
    }
  }, [visible, inactive, connect])

  return { vessels, status, darkCount }
}
