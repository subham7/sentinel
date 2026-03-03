'use client'

import type { MorningBrief } from '@sentinel/shared'

interface Props {
  brief:   MorningBrief | null
  pending: boolean
  loading: boolean
}

const CONF_COLORS: Record<string, string> = {
  HIGH:     '#22c55e',
  MODERATE: '#eab308',
  LOW:      '#f97316',
}

export default function MorningBriefPanel({ brief, pending, loading }: Props) {
  const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }

  return (
    <div style={{ padding: '8px 12px', ...mono }}>
      {/* Header */}
      <div style={{
        fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>◈ Morning Brief</span>
        {brief && (
          <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {brief.date} UTC
          </span>
        )}
      </div>

      {loading ? (
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em',
          animation: 'pulse-opacity 1.5s ease-in-out infinite',
        }}>
          // GENERATING BRIEF...
        </div>
      ) : pending || !brief ? (
        <div>
          <div style={{
            fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 8,
            animation: 'pulse-opacity 1.5s ease-in-out infinite',
          }}>
            // GENERATING BRIEF...
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Briefing is being generated — this usually takes 15–30 seconds.
          </div>
        </div>
      ) : (
        <div>
          {/* Overall confidence badge */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10,
          }}>
            {(() => {
              const color = CONF_COLORS[brief.overall_confidence] ?? '#94a3b8'
              return (
                <span style={{
                  fontSize: 9, color, letterSpacing: '0.12em', textTransform: 'uppercase',
                  background: `${color}18`, border: `1px solid ${color}44`,
                  padding: '2px 6px', borderRadius: 2,
                }}>
                  {brief.overall_confidence} CONFIDENCE
                </span>
              )
            })()}
            <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              via {brief.model}
            </span>
          </div>

          {/* BLUF */}
          {brief.bluf && (
            <div style={{
              padding: '8px 10px', marginBottom: 10,
              background: 'rgba(0,176,255,0.06)', borderLeft: '2px solid rgba(0,176,255,0.4)',
              borderRadius: 2,
            }}>
              <div style={{
                fontSize: 8, color: '#00b0ff', letterSpacing: '0.14em',
                textTransform: 'uppercase', marginBottom: 4,
              }}>
                BLUF — BOTTOM LINE UP FRONT
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {brief.bluf}
              </div>
            </div>
          )}

          {/* Key judgments */}
          {brief.judgments.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Key Judgments
              </div>
              {brief.judgments.map((j, i) => {
                const color = CONF_COLORS[j.confidence] ?? '#94a3b8'
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 8, marginBottom: 6,
                    paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{
                      flexShrink: 0, fontSize: 8, color,
                      background: `${color}18`, border: `1px solid ${color}33`,
                      padding: '1px 4px', borderRadius: 2,
                      letterSpacing: '0.08em', height: 'fit-content', marginTop: 1,
                    }}>
                      {j.confidence}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {j.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Evidence */}
          {brief.evidence && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 4,
              }}>
                Evidence
              </div>
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
                padding: '6px 8px',
                background: 'var(--bg-overlay)',
                borderRadius: 2,
              }}>
                {brief.evidence}
              </div>
            </div>
          )}

          {/* Outlook */}
          {brief.outlook && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 4,
              }}>
                Outlook (24–72h)
              </div>
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6,
                padding: '6px 8px',
                background: 'var(--bg-overlay)',
                borderRadius: 2,
              }}>
                {brief.outlook}
              </div>
            </div>
          )}

          {/* Sources */}
          {brief.sources && (
            <div style={{
              fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em',
              borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6,
            }}>
              SOURCES: {brief.sources}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
