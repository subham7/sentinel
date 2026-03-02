'use client'

import { useState, useEffect } from 'react'
import { DIPLOMATIC_EVENTS } from '@sentinel/shared'
import type { DiplomaticEvent } from '@sentinel/shared'

const TYPE_ICONS: Record<string, string> = {
  vote:       '●',
  talks:      '◈',
  ceasefire:  '►',
  inspection: '◌',
  deadline:   '⚠',
  summit:     '◆',
}

const TYPE_LABELS: Record<string, string> = {
  vote:       'VOTE',
  talks:      'TALKS',
  ceasefire:  'CEASEFIRE',
  inspection: 'INSPECTION',
  deadline:   'DEADLINE',
  summit:     'SUMMIT',
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'PASSED'
  const secs = Math.floor(ms / 1000)
  const d    = Math.floor(secs / 86400)
  const h    = Math.floor((secs % 86400) / 3600)
  const m    = Math.floor((secs % 3600) / 60)
  const s    = secs % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

function EventItem({ event }: { event: DiplomaticEvent }) {
  const [countdown, setCountdown] = useState('')
  const eventMs = new Date(event.date).getTime()

  useEffect(() => {
    if (!event.countdownEnabled) return
    function update() { setCountdown(formatCountdown(eventMs - Date.now())) }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [event.countdownEnabled, eventMs])

  const remaining = eventMs - Date.now()
  const isPast    = remaining <= 0
  const isUrgent  = remaining > 0 && remaining < 48 * 3600_000
  const isCritical = remaining > 0 && remaining < 12 * 3600_000

  const borderColor = isPast ? '#1e293b'
    : isCritical ? '#ef4444'
    : isUrgent   ? '#eab308'
    : 'rgba(255,255,255,0.1)'

  const textColor = isPast ? '#475569'
    : isCritical ? '#ef4444'
    : isUrgent   ? '#eab308'
    : '#94a3b8'

  const eventDate = new Date(event.date)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '5px 12px',
      borderLeft: `2px solid ${borderColor}`,
      flexShrink: 0,
      opacity: isPast ? 0.45 : 1,
      minWidth: 160, maxWidth: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9, color: textColor }}>{TYPE_ICONS[event.type] ?? '●'}</span>
        <span style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 8, color: '#475569', letterSpacing: '0.1em',
        }}>
          {TYPE_LABELS[event.type] ?? event.type.toUpperCase()}
        </span>
      </div>

      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color: isPast ? '#475569' : 'var(--text-secondary)',
        lineHeight: 1.3,
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      }}>
        {event.title}
      </div>

      <div style={{
        fontFamily: "'Orbitron', monospace",
        fontSize: 9, fontWeight: 700,
        color: textColor,
        letterSpacing: '0.06em',
      }}>
        {isPast
          ? '— PASSED'
          : event.countdownEnabled
            ? `in ${countdown}`
            : eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
      </div>
    </div>
  )
}

export default function DiplomaticTimeline() {
  const events = DIPLOMATIC_EVENTS
    .filter(e => new Date(e.date).getTime() > Date.now() - 7 * 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (!events.length) return null

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        padding: '6px 0 6px 12px', gap: 0,
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          paddingRight: 10, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          marginRight: 0,
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 8, color: 'var(--text-muted)',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            fontFamily: "'Share Tech Mono', monospace",
            writingMode: 'vertical-rl', textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            lineHeight: 1,
          }}>
            DIPLOMATIC
          </span>
        </div>
        <div style={{
          display: 'flex', gap: 0, overflowX: 'auto',
          scrollbarWidth: 'none', flex: 1,
        }}>
          {events.map(e => <EventItem key={e.id} event={e} />)}
        </div>
      </div>
    </div>
  )
}
