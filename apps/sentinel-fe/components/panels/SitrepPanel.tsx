'use client'

import type { SitrepReport } from '@sentinel/shared'

const THREAT_COLORS: Record<string, string> = {
  normal:   '#22c55e',
  elevated: '#eab308',
  high:     '#f97316',
  critical: '#ef4444',
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface SitrepPanelProps {
  report:  SitrepReport | null
  loading: boolean
  pending: boolean
  noKey?:  boolean
}

export default function SitrepPanel({ report, loading, pending, noKey }: SitrepPanelProps) {
  const panelStyle: React.CSSProperties = {
    padding:     '8px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink:   0,
    fontFamily:   "'Share Tech Mono', monospace",
  }

  const labelStyle: React.CSSProperties = {
    fontSize:      10,
    color:         'var(--text-secondary)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom:  6,
    display:       'flex',
    justifyContent:'space-between',
    alignItems:    'center',
  }

  const mutedStyle: React.CSSProperties = {
    fontSize:      10,
    color:         'var(--text-muted)',
    letterSpacing: '0.08em',
    animation:     'pulse-opacity 1.5s ease-in-out infinite',
  }

  return (
    <div style={panelStyle}>
      <div style={labelStyle}>
        <span>SITREP</span>
        {report && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {timeAgo(report.generated_at)}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && !report && !pending && (
        <div style={mutedStyle}>// GENERATING...</div>
      )}

      {/* Pending — no key or not yet generated */}
      {noKey && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          // NO SITREP — GROQ_API_KEY NOT CONFIGURED
        </div>
      )}

      {!noKey && pending && !report && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          // SITREP PENDING — NEXT GEN IN ~1H
        </div>
      )}

      {/* Report content */}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Threat level badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              padding:       '2px 6px',
              background:    `${THREAT_COLORS[report.threat_level] ?? '#94a3b8'}22`,
              border:        `1px solid ${THREAT_COLORS[report.threat_level] ?? '#94a3b8'}55`,
              borderRadius:  2,
              fontSize:      9,
              color:          THREAT_COLORS[report.threat_level] ?? '#94a3b8',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              THREAT: {report.threat_level.toUpperCase()}
            </span>
          </div>

          {/* Summary */}
          <p style={{
            fontSize:   11,
            color:      'var(--text-primary)',
            lineHeight: 1.5,
            margin:     0,
          }}>
            {report.summary}
          </p>

          {/* Key events */}
          {report.key_events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {report.key_events.map((evt, i) => (
                <div key={i} style={{
                  display:   'flex',
                  gap:       6,
                  fontSize:  10,
                  color:     'var(--text-secondary)',
                  lineHeight: 1.4,
                }}>
                  <span style={{ color: 'var(--text-accent)', flexShrink: 0 }}>●</span>
                  <span>{evt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Force posture */}
          {report.force_posture && (
            <div style={{
              padding:      '5px 8px',
              background:   'var(--bg-elevated)',
              borderLeft:   '2px solid var(--text-accent)',
              fontSize:      10,
              color:         'var(--text-secondary)',
              lineHeight:    1.4,
            }}>
              {report.force_posture}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
