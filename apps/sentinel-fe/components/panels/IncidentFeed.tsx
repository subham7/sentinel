'use client'

import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Incident } from '@sentinel/shared'
import { getTier, TIER_META, rssFeedLabel, isRssPropagandaRisk } from '@sentinel/shared'

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
  gnews: 'GNEWS', newsdata: 'NWSD',
}

function getSourceLabel(inc: Incident): string {
  if (inc.source === 'rss') return rssFeedLabel(inc.source_id)
  return SOURCE_LABELS[inc.source] ?? inc.source.toUpperCase()
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

export type FeedSize = 'collapsed' | 'normal' | 'expanded'

interface Props {
  incidents:    Incident[]
  onFlyTo?:     (lat: number, lon: number) => void
  status:       'connecting' | 'connected' | 'error'
  size:         FeedSize
  onChangeSize: (s: FeedSize) => void
}

const FEED_ACCENT = '#f97316'

export default function IncidentFeed({ incidents, onFlyTo, status, size, onChangeSize }: Props) {
  const isLive = status === 'connected'
  const dotColor = isLive ? '#22c55e' : status === 'error' ? '#ef4444' : '#eab308'
  const [analystMode, setAnalystMode] = useState(false)

  const visibleIncidents = analystMode
    ? incidents.filter(i => getTier(i.source_url, i.source) <= 2)
    : incidents

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visibleIncidents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 62,
    overscan: 5,
  })

  // ── Header ──────────────────────────────────────────────────────────────
  const header = (
    <div
      onClick={size === 'collapsed' ? () => onChangeSize('normal') : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 10px 0 0',
        height: 40, flexShrink: 0,
        background: 'var(--bg-elevated)',
        borderTop: `2px solid ${FEED_ACCENT}`,
        borderBottom: size === 'collapsed' ? 'none' : '1px solid var(--border)',
        cursor: size === 'collapsed' ? 'pointer' : 'default',
      }}
    >
      {/* Left: accent bar + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 3, alignSelf: 'stretch', background: FEED_ACCENT, flexShrink: 0,
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', minWidth: 0 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: dotColor,
            animation: isLive ? 'pulse-opacity 2s ease-in-out infinite' : undefined,
          }} />
          <span style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: 10, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}>
            INCIDENTS
          </span>
          {size === 'collapsed' && (
            <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
              — click to open
            </span>
          )}
        </div>
      </div>

      {/* Right: count + analyst filter + expand / collapse */}
      {size !== 'collapsed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, paddingRight: 2 }}>
          {/* Event count badge */}
          {incidents.length > 0 && (
            <span style={{
              fontSize: 9, color: FEED_ACCENT,
              background: `${FEED_ACCENT}18`,
              border: `1px solid ${FEED_ACCENT}50`,
              borderRadius: 2, padding: '2px 5px',
              fontFamily: "'Share Tech Mono', monospace",
              letterSpacing: '0.06em', whiteSpace: 'nowrap',
            }}>
              {incidents.length}
            </span>
          )}
          {/* Analyst mode toggle: T1-2 only */}
          <button
            title={analystMode ? 'Show all sources' : 'Analyst mode — T1 + T2 sources only'}
            onClick={() => setAnalystMode(v => !v)}
            style={{
              background:   analystMode ? '#00b0ff22' : 'transparent',
              border:       `1px solid ${analystMode ? '#00b0ff60' : 'var(--border-bright)'}`,
              borderRadius: 2,
              color:        analystMode ? '#00b0ff' : '#94a3b8',
              cursor:       'pointer',
              fontSize:     8,
              letterSpacing: '0.1em',
              padding:      '3px 6px',
              fontFamily:   "'Share Tech Mono', monospace",
              whiteSpace:   'nowrap',
            }}
          >
            T1-2
          </button>
          {/* Expand / shrink toggle */}
          <button
            title={size === 'expanded' ? 'Restore default size' : 'Expand feed'}
            onClick={() => onChangeSize(size === 'expanded' ? 'normal' : 'expanded')}
            style={{
              background: size === 'expanded' ? `${FEED_ACCENT}22` : 'transparent',
              border: `1px solid ${size === 'expanded' ? FEED_ACCENT + '60' : 'var(--border-bright)'}`,
              borderRadius: 2,
              color: size === 'expanded' ? FEED_ACCENT : '#94a3b8',
              cursor: 'pointer',
              fontSize: 15, lineHeight: 1,
              padding: '3px 7px',
              fontFamily: "'Share Tech Mono', monospace",
            }}
            onMouseEnter={e => { if (size !== 'expanded') { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = 'var(--border-bright)' } }}
            onMouseLeave={e => { if (size !== 'expanded') { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'var(--border-bright)' } }}
          >
            {size === 'expanded' ? '↓' : '↑'}
          </button>

          {/* Collapse to header */}
          <button
            title="Collapse feed (F)"
            onClick={() => onChangeSize('collapsed')}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-bright)',
              borderRadius: 2,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 15, lineHeight: 1,
              padding: '3px 7px',
              fontFamily: "'Share Tech Mono', monospace",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )

  if (size === 'collapsed') return header

  // ── Feed list ────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, overflow: 'hidden',
    }}>
      {header}

      <div ref={parentRef} style={{ overflowY: 'auto', flex: 1 }}>
        {visibleIncidents.length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontSize: 10, color: 'var(--text-muted)',
            fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
          }}>
            {status === 'connecting' ? 'CONNECTING...' : analystMode ? '// NO T1-T2 SOURCES' : '// NO INCIDENTS'}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vItem => {
              const inc = visibleIncidents[vItem.index]
              if (!inc) return null
              const color  = SEV_COLORS[inc.severity] ?? '#94a3b8'
              const tier   = getTier(inc.source_url, inc.source)
              const tierM  = TIER_META[tier]
              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <div
                    onClick={() => inc.lat && inc.lon && onFlyTo?.(inc.lat, inc.lon)}
                    style={{
                      padding: '7px 12px 7px 10px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: `3px solid ${color}`,
                      cursor: inc.lat && inc.lon ? 'pointer' : 'default',
                      fontFamily: "'Share Tech Mono', monospace",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{
                          fontSize: 8, color,
                          padding: '1px 4px',
                          background: `${color}18`,
                          border: `1px solid ${color}40`,
                          borderRadius: 2, letterSpacing: '0.1em',
                        }}>
                          {SEV_LABELS[inc.severity]}
                        </span>
                        {/* Credibility tier badge */}
                        <span
                          title={`Source credibility: ${tierM.label}${inc.source_url ? ` (${(() => { try { return new URL(inc.source_url!).hostname } catch { return '' } })()})` : ''}`}
                          style={{
                            fontSize: 7, color: tierM.color,
                            padding: '1px 4px',
                            background: tierM.bgColor,
                            border: `1px solid ${tierM.borderColor}`,
                            borderRadius: 2, letterSpacing: '0.08em',
                          }}
                        >
                          {tierM.label}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          {CAT_ICONS[inc.category] ?? '●'} {getSourceLabel(inc)}
                        </span>
                        {/* ⚠ STATE MEDIA badge for T4 propaganda-risk feeds */}
                        {tier === 4 && (inc.source === 'rss'
                          ? isRssPropagandaRisk(inc.source_id)
                          : inc.source === 'telegram') && (
                          <span style={{
                            fontSize: 7, color: '#ef4444',
                            padding: '1px 4px',
                            background: '#ef444418',
                            border: '1px solid #ef444440',
                            borderRadius: 2, letterSpacing: '0.08em',
                            whiteSpace: 'nowrap',
                          }}>
                            ⚠ STATE
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                        {timeAgo(inc.timestamp)}
                      </span>
                    </div>

                    {/* Title + optional source link */}
                    <div style={{
                      fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {inc.source_url ? (
                        <a
                          href={inc.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#00b0ff')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                        >
                          {inc.title}
                        </a>
                      ) : inc.title}
                    </div>

                    {/* Location */}
                    {inc.location_name && (
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                        {inc.location_name}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
