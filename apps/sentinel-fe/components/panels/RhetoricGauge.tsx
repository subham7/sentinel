'use client'

import type { RhetoricScore } from '@sentinel/shared'

interface Props {
  data:    RhetoricScore | null
  pending: boolean
  loading: boolean
}

const LABEL_COLORS: Record<string, string> = {
  ROUTINE:    '#22c55e',
  ELEVATED:   '#eab308',
  THREATENING:'#f97316',
  CRISIS:     '#ef4444',
  IMMINENT:   '#dc2626',
}

// Semicircular gauge via SVG arc
// 0 = left (score 0), 180° = right (score 100)
function polarToXY(angleDeg: number, r: number, cx: number, cy: number) {
  const rad = (angleDeg - 180) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(score: number, cx: number, cy: number, r: number): string {
  const clampedScore = Math.min(100, Math.max(0, score))
  const angleDeg = (clampedScore / 100) * 180  // 0° (left) → 180° (right)
  const start    = polarToXY(0, r, cx, cy)
  const end      = polarToXY(angleDeg, r, cx, cy)
  const largeArc = angleDeg > 90 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export default function RhetoricGauge({ data, pending, loading }: Props) {
  const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" }

  return (
    <div style={{
      padding: '8px 12px', borderBottom: '1px solid var(--border)',
      flexShrink: 0, ...mono,
    }}>
      <div style={{
        fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        ◈ Rhetoric Gauge
      </div>

      {loading ? (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          // SCORING...
        </div>
      ) : pending || !data ? (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          // NO TELEGRAM DATA
        </div>
      ) : (() => {
        const cx = 80
        const cy = 64
        const r  = 54
        const trackPath = `M ${polarToXY(0, r, cx, cy).x} ${polarToXY(0, r, cx, cy).y} A ${r} ${r} 0 1 1 ${polarToXY(180, r, cx, cy).x} ${polarToXY(180, r, cx, cy).y}`
        const fillPath  = arcPath(data.score, cx, cy, r)
        const labelColor = LABEL_COLORS[data.label] ?? '#94a3b8'
        const needlePt  = polarToXY((data.score / 100) * 180, r * 0.85, cx, cy)

        return (
          <div>
            <svg width={160} height={72} style={{ display: 'block', margin: '0 auto' }}>
              {/* Background track */}
              <path
                d={trackPath}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={8}
                strokeLinecap="round"
              />
              {/* Filled arc */}
              <path
                d={fillPath}
                fill="none"
                stroke={labelColor}
                strokeWidth={8}
                strokeLinecap="round"
                opacity={0.85}
              />
              {/* Needle */}
              <line
                x1={cx}
                y1={cy}
                x2={needlePt.x}
                y2={needlePt.y}
                stroke={labelColor}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <circle cx={cx} cy={cy} r={3} fill={labelColor} />
              {/* Score label */}
              <text
                x={cx}
                y={cy - 10}
                textAnchor="middle"
                fontSize={18}
                fontWeight={700}
                fill={labelColor}
                fontFamily="Orbitron, monospace"
              >
                {data.score}
              </text>
              {/* Scale labels */}
              <text x={8}   y={cy + 14} fontSize={7} fill="rgba(255,255,255,0.3)" fontFamily="Share Tech Mono, monospace">0</text>
              <text x={142} y={cy + 14} fontSize={7} fill="rgba(255,255,255,0.3)" fontFamily="Share Tech Mono, monospace">100</text>
            </svg>

            <div style={{ textAlign: 'center', marginTop: -2 }}>
              <span style={{
                fontSize: 10, color: labelColor, letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '1px 6px',
                background: `${labelColor}18`,
                border: `1px solid ${labelColor}44`,
                borderRadius: 2,
              }}>
                {data.label}
              </span>
            </div>

            {data.key_phrases.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {data.key_phrases.slice(0, 3).map(phrase => (
                  <div key={phrase} style={{
                    fontSize: 9, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: 1,
                  }}>
                    · {phrase}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.06em' }}>
              {data.post_count} posts · {new Date(data.generated_at).toUTCString().slice(0, 16)}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
