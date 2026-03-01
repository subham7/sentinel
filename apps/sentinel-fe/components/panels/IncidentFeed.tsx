'use client'

import type { Incident } from '@sentinel/shared'

const SEV_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
}

const SEV_LABELS: Record<number, string> = {
  1: 'INFO', 2: 'LOW', 3: 'MED', 4: 'HIGH', 5: 'CRIT',
}

const SOURCE_LABELS: Record<string, string> = {
  gdelt: 'GDL', acled: 'ACL', telegram: 'TG', manual: 'MAN',
}

const CAT_ICONS: Record<string, string> = {
  armed_conflict: '⚔', explosion: '💥', missile: '🚀', drone: '✈',
  cyber: '⚡', naval: '⚓', protest: '✊', diplomatic: '🤝', nuclear: '☢', other: '●',
}

function timeAgo(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

interface Props {
  incidents: Incident[]
  onFlyTo?:  (lat: number, lon: number) => void
  status:    'connecting' | 'connected' | 'error'
}

export default function IncidentFeed({ incidents, onFlyTo, status }: Props) {
  const statusColor = status === 'connected' ? '#22c55e' : status === 'error' ? '#ef4444' : '#eab308'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
      borderTop: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: 10, color: 'var(--text-secondary)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          fontFamily: "'Share Tech Mono', monospace",
        }}>
          Incident Feed
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
            background: statusColor,
            animation: status === 'connected' ? 'pulse-opacity 2s ease-in-out infinite' : undefined,
          }} />
          <span style={{
            fontSize: 9, color: statusColor,
            fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.1em',
          }}>
            {status === 'connected' ? `${incidents.length} EVENTS` : status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {incidents.length === 0 ? (
          <div style={{
            padding: '16px 12px', textAlign: 'center',
            fontSize: 10, color: 'var(--text-muted)',
            fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
          }}>
            {status === 'connecting' ? 'CONNECTING...' : '// NO INCIDENTS'}
          </div>
        ) : incidents.map(inc => {
          const color = SEV_COLORS[inc.severity] ?? '#94a3b8'
          return (
            <div
              key={inc.id}
              onClick={() => inc.lat && inc.lon && onFlyTo?.(inc.lat, inc.lon)}
              style={{
                padding: '6px 12px 6px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                borderLeft: `3px solid ${color}`,
                cursor: inc.lat && inc.lon ? 'pointer' : 'default',
                fontFamily: "'Share Tech Mono', monospace",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Top row: severity badge + source + time */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    fontSize: 8, color: color,
                    padding: '1px 4px',
                    background: `${color}18`,
                    border: `1px solid ${color}40`,
                    borderRadius: 2, letterSpacing: '0.1em',
                  }}>
                    {SEV_LABELS[inc.severity]}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {CAT_ICONS[inc.category]} {SOURCE_LABELS[inc.source] ?? inc.source}
                  </span>
                </div>
                <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {timeAgo(inc.timestamp)}
                </span>
              </div>

              {/* Title */}
              <div style={{
                fontSize: 10, color: 'var(--text-primary)', lineHeight: 1.4,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {inc.title}
              </div>

              {/* Location */}
              {inc.location_name && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                  {inc.location_name}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
