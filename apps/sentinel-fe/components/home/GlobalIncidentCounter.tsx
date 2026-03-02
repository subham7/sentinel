'use client'

import { useEffect, useRef, useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface GlobalStats {
  activeTheaters: number
  incidents24h:   number
  liveTracks:     number
  vesselsDark:    number
}

function AnimatedCount({ value }: { value: number | null }) {
  const [displayed, setDisplayed] = useState<number | null>(null)
  const prevRef = useRef<number>(0)

  useEffect(() => {
    if (value === null) return
    const start = prevRef.current
    const end   = value
    if (start === end) { setDisplayed(end); return }
    const duration  = 600
    const startTime = performance.now()
    function step(now: number) {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(start + (end - start) * eased))
      if (t < 1) requestAnimationFrame(step)
      else prevRef.current = end
    }
    requestAnimationFrame(step)
  }, [value])

  if (displayed === null && value === null) return <>—</>
  const v = displayed ?? value ?? 0
  return <>{v.toLocaleString()}</>
}

export default function GlobalIncidentCounter() {
  const [stats, setStats] = useState<GlobalStats | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/stats/global`)
        if (res.ok) setStats(await res.json() as GlobalStats)
      } catch { /* API not ready */ }
    }
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [])

  const items = [
    { label: 'ACTIVE THEATERS', value: stats?.activeTheaters ?? null, color: '#ef4444' },
    { label: '24H INCIDENTS',   value: stats?.incidents24h   ?? null, color: '#f97316' },
    { label: 'LIVE TRACKS',     value: stats?.liveTracks     ?? null, color: '#00b0ff' },
    { label: 'VESSELS DARK',    value: stats?.vesselsDark    ?? null, color: '#eab308' },
  ]

  return (
    <div style={{
      display: 'flex', flexShrink: 0, overflowX: 'auto',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      scrollbarWidth: 'none',
    }}>
      {items.map((item, i) => (
        <div key={item.label} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 14px',
          borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 9, color: 'var(--text-muted)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {item.label}:
          </span>
          <span style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: 13, fontWeight: 700,
            color: item.color,
            minWidth: 32, textAlign: 'right',
          }}>
            <AnimatedCount value={item.value} />
          </span>
        </div>
      ))}
    </div>
  )
}
