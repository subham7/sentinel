'use client'

import type { RhetoricScore } from '@sentinel/shared'

interface Props {
  data:    RhetoricScore | null
  pending: boolean
  loading: boolean
}

const LABEL_COLORS: Record<string, string> = {
  ROUTINE:     '#22c55e',
  ELEVATED:    '#eab308',
  THREATENING: '#f97316',
  CRISIS:      '#ef4444',
  IMMINENT:    '#dc2626',
}

// ── Gauge geometry ─────────────────────────────────────────────────────────
// Semicircle: left = score 0, top = score 50, right = score 100
// SVG y increases downward, so "up" = decreasing y

const W  = 160
const H  = 84
const CX = W / 2         // 80
const CY = H - 14        // 70 — pivot near bottom, leaving room for scale labels
const R  = 52            // arc radius

// Convert score 0–100 to a point on the semicircle arc
// score=0  → left  (CX-R, CY)
// score=50 → top   (CX,   CY-R)
// score=100 → right (CX+R, CY)
function scoreToPoint(score: number) {
  const angle = Math.PI * (1 - score / 100)   // PI (left) → 0 (right)
  return {
    x: CX + R * Math.cos(angle),
    y: CY - R * Math.sin(angle),   // minus because SVG y is inverted
  }
}

const leftPt  = scoreToPoint(0)    // (CX-R, CY)
const rightPt = scoreToPoint(100)  // (CX+R, CY)

// Full semicircle track: left → right going clockwise (upward via top)
// In SVG (y-down), sweep-flag=1 = clockwise = goes UPWARD through the TOP ✓
// sweep-flag=0 = counterclockwise = goes DOWNWARD through the bottom (off-screen) ✗
const TRACK_PATH = `M ${leftPt.x} ${leftPt.y} A ${R} ${R} 0 0 1 ${rightPt.x} ${rightPt.y}`

// Filled arc from left to score position (clockwise = top arc, largeArc=0 = ≤180°)
function fillPath(score: number): string {
  if (score <= 0) return ''
  const end = scoreToPoint(Math.min(score, 100))
  return `M ${leftPt.x} ${leftPt.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
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
        textTransform: 'uppercase', marginBottom: 4,
      }}>
        ◈ Rhetoric Gauge
      </div>

      {loading ? (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', padding: '4px 0' }}>
          // SCORING...
        </div>
      ) : pending || !data ? (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', padding: '4px 0' }}>
          // NO TELEGRAM DATA
        </div>
      ) : (() => {
        const labelColor = LABEL_COLORS[data.label] ?? '#94a3b8'
        const needlePt   = scoreToPoint(data.score)
        // Shorten needle slightly so it ends inside the arc
        const needleLen  = R * 0.82
        const angle      = Math.PI * (1 - data.score / 100)
        const needleEnd  = {
          x: CX + needleLen * Math.cos(angle),
          y: CY - needleLen * Math.sin(angle),
        }

        return (
          <div>
            <svg
              width={W}
              height={H}
              style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
            >
              {/* Background track (full semicircle) */}
              <path
                d={TRACK_PATH}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={8}
                strokeLinecap="round"
              />

              {/* Filled arc (score) */}
              {data.score > 0 && (
                <path
                  d={fillPath(data.score)}
                  fill="none"
                  stroke={labelColor}
                  strokeWidth={8}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              )}

              {/* Needle */}
              <line
                x1={CX} y1={CY}
                x2={needleEnd.x} y2={needleEnd.y}
                stroke={labelColor}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <circle cx={CX} cy={CY} r={3.5} fill={labelColor} />

              {/* Score number (above needle pivot) */}
              <text
                x={CX}
                y={CY - R * 0.38}
                textAnchor="middle"
                fontSize={20}
                fontWeight={700}
                fill={labelColor}
                fontFamily="Orbitron, monospace"
              >
                {data.score}
              </text>

              {/* Scale labels at the ends of the arc */}
              <text
                x={leftPt.x + 2}
                y={CY + 12}
                textAnchor="start"
                fontSize={7}
                fill="rgba(255,255,255,0.25)"
                fontFamily="Share Tech Mono, monospace"
              >
                0
              </text>
              <text
                x={rightPt.x - 2}
                y={CY + 12}
                textAnchor="end"
                fontSize={7}
                fill="rgba(255,255,255,0.25)"
                fontFamily="Share Tech Mono, monospace"
              >
                100
              </text>
            </svg>

            {/* Label badge */}
            <div style={{ textAlign: 'center', marginTop: 2 }}>
              <span style={{
                fontSize: 10, color: labelColor, letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '2px 8px',
                background: `${labelColor}18`,
                border: `1px solid ${labelColor}44`,
                borderRadius: 2,
              }}>
                {data.label}
              </span>
            </div>

            {/* Key phrases */}
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
