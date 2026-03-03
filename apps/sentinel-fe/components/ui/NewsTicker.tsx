'use client'

import type { Incident } from '@sentinel/shared'

const SEV_COLORS: Record<number, string> = {
  4: '#f97316',
  5: '#ef4444',
}

const SOURCE_LABELS: Record<string, string> = {
  gdelt:    'GDELT',
  acled:    'ACLED',
  telegram: 'TG',
  manual:   'MANUAL',
}

interface Props {
  incidents: Incident[]
}

// Pause-on-hover helpers
function pauseTicker(e: React.MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget.querySelector<HTMLDivElement>('.ticker-track')
  if (el) el.style.animationPlayState = 'paused'
}
function resumeTicker(e: React.MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget.querySelector<HTMLDivElement>('.ticker-track')
  if (el) el.style.animationPlayState = 'running'
}

export default function NewsTicker({ incidents }: Props) {
  const items = incidents.filter(i => i.severity >= 4)
  if (items.length === 0) return null

  // Duplicate for seamless loop: translate 0 → -50% then repeat
  const all = [...items, ...items]
  const duration = Math.max(30, items.length * 8)

  return (
    <div style={{
      height: 26,
      display: 'flex',
      alignItems: 'stretch',
      background: 'rgba(10,14,26,0.97)',
      borderBottom: '1px solid rgba(239,68,68,0.25)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* FLASH badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        background: '#ef4444',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.18em',
          fontFamily: "'Orbitron', monospace",
        }}>
          FLASH
        </span>
      </div>

      {/* Scroll track */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        onMouseEnter={pauseTicker}
        onMouseLeave={resumeTicker}
      >
        <div
          className="ticker-track"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '100%',
            whiteSpace: 'nowrap',
            animation: `ticker-scroll ${duration}s linear infinite`,
          }}
        >
          {all.map((item, idx) => {
            const color = SEV_COLORS[item.severity] ?? '#eab308'
            const src   = SOURCE_LABELS[item.source] ?? item.source.toUpperCase()
            return (
              <span
                key={`${item.id}-${idx}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingRight: 48,
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 11,
                }}
              >
                {/* Source badge */}
                <span style={{
                  fontSize: 8, color, letterSpacing: '0.1em',
                  border: `1px solid ${color}55`,
                  background: `${color}18`,
                  padding: '1px 4px',
                  borderRadius: 2,
                  flexShrink: 0,
                }}>
                  {src}
                </span>
                {/* Title */}
                <span style={{ color: 'var(--text-primary)' }}>
                  {item.title}
                </span>
                {/* Separator */}
                <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 14, lineHeight: 1 }}>
                  ◆
                </span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
