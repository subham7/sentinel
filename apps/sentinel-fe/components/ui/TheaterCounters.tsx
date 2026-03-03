'use client'

import { useState, useEffect, useCallback } from 'react'
import CountUp from 'react-countup'

interface CounterData {
  aircraft_tracked: number
  vessels_tracked:  number
  dark_vessels:     number
  incidents_30d:    number
}

interface Props {
  slug: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const COUNTERS: {
  key:   keyof CounterData
  label: string
  color: string
  icon:  string
}[] = [
  { key: 'dark_vessels',  label: 'AIS DARK',     color: '#f97316', icon: '◉' },
  { key: 'incidents_30d', label: '30D INCIDENTS', color: '#eab308', icon: '◈' },
]

export default function TheaterCounters({ slug }: Props) {
  const [data, setData] = useState<CounterData | null>(null)

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/conflicts/${slug}/counters`)
      .then(r => r.ok ? r.json() as Promise<CounterData> : null)
      .then(d => { if (d) setData(d) })
      .catch(() => { /* non-fatal */ })
  }, [slug])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  if (!data) return null

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:             0,
      background:     'var(--bg-surface)',
      borderBottom:   '1px solid var(--border)',
      flexShrink:      0,
      height:          36,
      overflowX:      'auto',
    }}>
      {COUNTERS.map(({ key, label, color, icon }) => {
        const val = data[key]
        return (
          <div
            key={key}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:             6,
              padding:        '0 16px',
              borderRight:    '1px solid var(--border)',
              height:         '100%',
              flexShrink:      0,
              whiteSpace:     'nowrap',
            }}
          >
            <span style={{ fontSize: 10, color, opacity: 0.7 }}>{icon}</span>
            <span style={{
              fontFamily:    "'Orbitron', monospace",
              fontSize:       13,
              fontWeight:     700,
              color,
              letterSpacing: '0.04em',
              minWidth:       28,
              textAlign:     'right',
            }}>
              <CountUp
                end={val}
                duration={0.8}
                separator=","
                preserveValue
              />
            </span>
            <span style={{
              fontSize:       8,
              color:         'var(--text-muted)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {label}
            </span>
          </div>
        )
      })}

      <div style={{ marginLeft: 'auto', padding: '0 16px' }}>
        <span style={{
          fontSize: 8, color: 'var(--text-muted)',
          fontFamily: "'Share Tech Mono', monospace",
          letterSpacing: '0.08em',
        }}>
          30D WINDOW
        </span>
      </div>
    </div>
  )
}
