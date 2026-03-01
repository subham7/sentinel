'use client'

// Iranian Rial parallel market rate widget
// Shown only on us-iran theater dashboard

import type { RialRateData } from '@sentinel/shared'

interface Props {
  data:    RialRateData | null
  pending: boolean
}

export default function RialWidget({ data, pending }: Props) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Header */}
      <div style={{
        fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>₪ IRR / USD</span>
        {data && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}Z
          </span>
        )}
      </div>

      {pending && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          // BONBAST UNAVAILABLE
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

      {data && (() => {
        const change    = data.change_24h
        const changeClr = change > 0 ? '#ef4444' : change < 0 ? '#22c55e' : 'var(--text-muted)'
        const sign      = change > 0 ? '+' : ''
        // Format: 630,000,000 → "630,000,000"
        const formatted = data.usd_irr.toLocaleString()

        return (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: 2 }}>
                  1 USD (PARALLEL MKT)
                </div>
                <div style={{
                  fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700,
                  color: 'var(--text-primary)',
                }}>
                  {formatted} IRR
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>24H CHG</div>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 12, fontWeight: 700,
                  color: changeClr,
                }}>
                  {sign}{change.toFixed(2)}%
                </div>
              </div>
            </div>
            {/* Depreciation indicator bar */}
            <div style={{
              marginTop: 6, height: 2, background: 'var(--bg-elevated)', borderRadius: 1, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 1,
                // Map 300k–1.5M range to bar width (% depreciation proxy)
                width: `${Math.min(100, Math.max(5, ((data.usd_irr - 300_000) / 1_200_000) * 100)).toFixed(0)}%`,
                background: change > 1 ? '#ef4444' : change > 0 ? '#f97316' : '#22c55e',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>
              SOURCE: BONBAST.COM
            </div>
          </>
        )
      })()}
    </div>
  )
}
