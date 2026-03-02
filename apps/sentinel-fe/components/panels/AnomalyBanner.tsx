'use client'

import { useState } from 'react'
import type { AnomalyAlert } from '@/services/anomaly.service'

interface Props {
  alerts: AnomalyAlert[]
  slug:   string
}

export default function AnomalyBanner({ alerts, slug }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter(a => !dismissed.has(`${slug}:${a.type}`))
  if (visible.length === 0) return null

  const top = visible[0]!
  const color = top.type === 'SPIKE' ? '#f97316' : '#eab308'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '6px 12px',
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`,
      margin: '4px 8px',
      borderRadius: 2,
      fontFamily: "'Share Tech Mono', monospace",
      flexShrink: 0,
    }}>
      <div>
        <div style={{
          fontSize: 9, color, letterSpacing: '0.12em', textTransform: 'uppercase',
          marginBottom: 2,
        }}>
          ⚠ INCIDENT {top.type} DETECTED · {slug.toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {top.description}
        </div>
        {visible.length > 1 && (
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
            +{visible.length - 1} more anomaly detected
          </div>
        )}
      </div>
      <button
        onClick={() => setDismissed(prev => new Set([...prev, `${slug}:${top.type}`]))}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '2px 4px', flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}
