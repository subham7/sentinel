'use client'

import { useState, useEffect, useRef } from 'react'
import type { ConflictConfig } from '@sentinel/shared'

interface Props {
  conflict: ConflictConfig
}

const PANEL_ACCENT = '#00b0ff'

export default function LiveTVPanel({ conflict }: Props) {
  const streams = conflict.liveStreams ?? []
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-pause after 5 minutes of embed play
  useEffect(() => {
    if (activeIdx === null) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setActiveIdx(null)
    }, 5 * 60 * 1000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [activeIdx])

  // IntersectionObserver: pause when panel scrolled out of view
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (!entry?.isIntersecting) setActiveIdx(null) },
      { threshold: 0.1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (streams.length === 0) {
    return (
      <div style={{
        padding: '20px 12px', textAlign: 'center',
        fontSize: 10, color: 'var(--text-muted)',
        fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
      }}>
        // NO LIVE STREAMS CONFIGURED
      </div>
    )
  }

  const activeStream = activeIdx !== null ? streams[activeIdx] : null

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 10px 0 0',
        height: 40, flexShrink: 0,
        background: 'var(--bg-elevated)',
        borderTop: `2px solid ${PANEL_ACCENT}`,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ width: 3, alignSelf: 'stretch', background: PANEL_ACCENT, flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px' }}>
            <span style={{
              fontFamily: "'Orbitron', monospace",
              fontSize: 11, fontWeight: 700,
              color: 'var(--text-primary)', letterSpacing: '0.1em',
            }}>
              LIVE FEEDS
            </span>
            <span style={{
              fontSize: 9, color: PANEL_ACCENT,
              background: `${PANEL_ACCENT}18`,
              border: `1px solid ${PANEL_ACCENT}50`,
              borderRadius: 2, padding: '1px 6px',
              fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
            }}>
              {streams.length} CH
            </span>
          </div>
        </div>
        {activeIdx !== null && (
          <button
            onClick={() => setActiveIdx(null)}
            title="Close stream"
            style={{
              background: 'transparent', border: '1px solid var(--border-bright)',
              borderRadius: 2, color: '#94a3b8', cursor: 'pointer',
              fontSize: 15, lineHeight: 1, padding: '3px 7px',
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Active embed */}
      {activeStream && (
        <div style={{
          flexShrink: 0,
          position: 'relative',
          paddingTop: '56.25%',   // 16:9 aspect ratio
          background: '#000',
          borderBottom: '1px solid var(--border)',
        }}>
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/live_stream?channel=${activeStream.channelId}&autoplay=1&mute=0`}
            title={activeStream.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              border: 'none',
            }}
          />
          {/* Channel label overlay */}
          <div style={{
            position: 'absolute', bottom: 6, left: 6,
            background: 'rgba(0,0,0,0.7)',
            padding: '2px 8px', borderRadius: 2,
            fontSize: 9, color: '#e2e8f0',
            fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.1em',
            pointerEvents: 'none',
          }}>
            {activeStream.name.toUpperCase()}
          </div>
        </div>
      )}

      {/* Channel list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {streams.map((s, i) => {
          const isActive = activeIdx === i
          return (
            <div
              key={s.channelId}
              onClick={() => setActiveIdx(isActive ? null : i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                borderLeft: `3px solid ${isActive ? PANEL_ACCENT : 'transparent'}`,
                background: isActive ? `${PANEL_ACCENT}0d` : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {/* Play / stop icon */}
              <span style={{
                fontSize: 14,
                color: isActive ? PANEL_ACCENT : 'var(--text-muted)',
                flexShrink: 0,
              }}>
                {isActive ? '■' : '▶'}
              </span>

              {/* Name + live dot */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.06em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.name}
                </div>
                {s.language && (
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 1 }}>
                    {s.language.toUpperCase()}
                  </div>
                )}
              </div>

              {/* LIVE badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#ef4444',
                  animation: 'pulse-opacity 2s ease-in-out infinite',
                  display: 'inline-block',
                }} />
                <span style={{
                  fontSize: 8, color: '#ef4444',
                  letterSpacing: '0.1em',
                  fontFamily: "'Share Tech Mono', monospace",
                }}>
                  LIVE
                </span>
              </div>
            </div>
          )
        })}

        <div style={{
          padding: '8px 12px',
          fontSize: 8, color: 'var(--text-muted)',
          letterSpacing: '0.06em', lineHeight: 1.5,
          borderTop: '1px solid var(--border)',
        }}>
          Streams auto-close after 5 min · YouTube © respective channels
        </div>
      </div>
    </div>
  )
}
