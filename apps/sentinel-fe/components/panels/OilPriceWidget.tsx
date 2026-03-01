'use client'

// Oil price widget — Brent + WTI spot prices with mini sparkline chart
// Shown only on us-iran theater dashboard

import type { OilPriceData } from '@sentinel/shared'

interface Props {
  data:    OilPriceData | null
  pending: boolean
}

// Simple SVG polyline sparkline from a number array (oldest → newest)
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null

  const w = 120, h = 30
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        opacity={0.8}
      />
    </svg>
  )
}

function ChangeLabel({ value }: { value: number }) {
  const color = value > 0 ? '#22c55e' : value < 0 ? '#ef4444' : 'var(--text-muted)'
  const sign  = value > 0 ? '+' : ''
  return (
    <span style={{ fontSize: 9, color, letterSpacing: '0.06em', fontFamily: "'Share Tech Mono', monospace" }}>
      {sign}{value.toFixed(2)}
    </span>
  )
}

export default function OilPriceWidget({ data, pending }: Props) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Header */}
      <div style={{
        fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>⬡ Oil Prices</span>
        {data && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}Z
          </span>
        )}
      </div>

      {pending && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          // NO DATA — EIA_API_KEY NOT CONFIGURED
        </div>
      )}

      {!data && !pending && (
        <div style={{
          fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em',
          animation: 'pulse-opacity 1.5s ease-in-out infinite',
        }}>
          // FETCHING...
        </div>
      )}

      {data && (
        <>
          {/* Brent row */}
          <div style={{ marginBottom: 6 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 2,
            }}>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>BRENT</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700,
                  color: 'var(--text-primary)',
                }}>
                  ${data.brent.toFixed(2)}
                </span>
                <ChangeLabel value={data.brent_change} />
              </div>
            </div>
            {data.history.length > 1 && (
              <Sparkline values={data.history} color="#00b0ff" />
            )}
          </div>

          {/* WTI row */}
          {data.wti > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>WTI</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontFamily: "'Orbitron', monospace", fontSize: 13, fontWeight: 700,
                  color: 'var(--text-primary)',
                }}>
                  ${data.wti.toFixed(2)}
                </span>
                <ChangeLabel value={data.wti_change} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
