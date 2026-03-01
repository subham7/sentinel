'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConflictConfig } from '@sentinel/shared'
import IntensityBar from './IntensityBar'

const INTENSITY_LABELS: Record<string, string> = {
  critical: 'CRITICAL',
  high:     'HIGH',
  elevated: 'ELEVATED',
  low:      'LOW',
}

const INTENSITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  elevated: '#eab308',
  low:      '#22c55e',
}

const STATUS_COLORS: Record<string, string> = {
  active:     '#ef4444',
  monitoring: '#eab308',
  frozen:     '#94a3b8',
}

interface Props {
  conflict:      ConflictConfig
  hovered?:      boolean
  onHover?:      (slug: string | null) => void
  aircraftCount?: number | undefined
}

export default function ConflictCard({ conflict, hovered, onHover, aircraftCount }: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const router = useRouter()

  const active = hovered || isHovered
  const intensityColor = INTENSITY_COLORS[conflict.intensity] ?? '#94a3b8'

  return (
    <div
      onClick={() => router.push(`/conflicts/${conflict.slug}`)}
      onMouseEnter={() => { setIsHovered(true); onHover?.(conflict.slug) }}
      onMouseLeave={() => { setIsHovered(false); onHover?.(null) }}
      style={{
        display:      'flex',
        flexDirection: 'column',
        background:   active ? 'var(--bg-overlay)' : 'var(--bg-surface)',
        border:       `1px solid ${active ? 'var(--border-bright)' : 'var(--border)'}`,
        borderLeft:   `3px solid ${conflict.card.accentColor}`,
        borderRadius:  4,
        cursor:       'pointer',
        transition:   'background 0.15s, border-color 0.15s',
        overflow:     'hidden',
        position:     'relative',
      }}
    >
      {/* Body */}
      <div style={{ padding: '14px 16px', flex: 1 }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{
              fontFamily:    "'Orbitron', monospace",
              fontSize:       16,
              fontWeight:     700,
              color:         'var(--text-primary)',
              letterSpacing: '0.05em',
              lineHeight:     1.2,
              marginBottom:   3,
            }}>
              {conflict.name}
            </div>
            <div style={{
              fontSize:      11,
              color:        'var(--text-secondary)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {conflict.shortName}
            </div>
          </div>
          {/* Status + intensity badges */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{
              padding:       '2px 6px',
              background:    `${STATUS_COLORS[conflict.status] ?? '#94a3b8'}22`,
              border:        `1px solid ${STATUS_COLORS[conflict.status] ?? '#94a3b8'}55`,
              borderRadius:   2,
              fontSize:       9,
              color:         STATUS_COLORS[conflict.status] ?? '#94a3b8',
              fontFamily:    "'Share Tech Mono', monospace",
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              {conflict.status}
            </span>
            <span style={{
              padding:       '2px 6px',
              background:    `${intensityColor}22`,
              border:        `1px solid ${intensityColor}55`,
              borderRadius:   2,
              fontSize:       9,
              color:          intensityColor,
              fontFamily:    "'Share Tech Mono', monospace",
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              animation:      conflict.intensity === 'critical' ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
            }}>
              {INTENSITY_LABELS[conflict.intensity]}
            </span>
          </div>
        </div>

        {/* Parties */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {conflict.parties.map(p => (
            <div key={p.shortCode} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14 }}>{p.flagEmoji}</span>
              <span style={{
                fontSize:      10,
                color:         p.color,
                fontFamily:   "'Share Tech Mono', monospace",
                letterSpacing: '0.08em',
              }}>
                {p.shortCode}
              </span>
            </div>
          ))}
        </div>

        {/* Key metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {conflict.card.keyMetrics.slice(0, 3).map((metric, i) => {
            // First metric is always "Aircraft tracked" — show live count if available
            const value = (i === 0 && aircraftCount !== undefined)
              ? String(aircraftCount)
              : '—'
            const isLive = i === 0 && aircraftCount !== undefined && aircraftCount > 0
            return (
              <div key={metric}>
                <div style={{
                  fontSize:      9,
                  color:        'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom:   3,
                }}>
                  {metric}
                </div>
                <div style={{
                  fontFamily:    "'Orbitron', monospace",
                  fontSize:       16,
                  fontWeight:     700,
                  color:          isLive ? '#00b0ff' : 'var(--text-primary)',
                }}>
                  {value}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA footer */}
      <div style={{
        padding:        '8px 16px',
        borderTop:     `1px solid var(--border)`,
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        background:     active ? 'rgba(255,255,255,0.03)' : 'transparent',
      }}>
        <span style={{
          fontSize:      10,
          color:        'var(--text-muted)',
          fontFamily:   "'Share Tech Mono', monospace",
          letterSpacing: '0.08em',
        }}>
          EST. {conflict.startDate.slice(0, 4)}
        </span>
        <span style={{
          fontSize:      10,
          color:         conflict.card.accentColor,
          fontFamily:   "'Share Tech Mono', monospace",
          letterSpacing: '0.1em',
        }}>
          VIEW THEATER →
        </span>
      </div>

      {/* Intensity bar at very bottom */}
      <IntensityBar intensity={conflict.intensity} />
    </div>
  )
}
