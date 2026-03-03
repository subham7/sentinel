'use client'

// MarketsPanel — Sprint 3 Prediction Markets
// Displays Polymarket + Kalshi contracts relevant to the active conflict.
// Each card shows: question, probability gauge, 24h volume, close time,
// source badge, and matched keywords that triggered inclusion.

import { useMarketsData } from '@/hooks/useMarketsData'
import type { PredictionMarket } from '@sentinel/shared'

// ── Probability arc ───────────────────────────────────────────────────────────

function ProbArc({ p }: { p: number }) {
  // Semi-circular arc, 0% = full left, 100% = full right
  const pct   = Math.min(1, Math.max(0, p))
  const color = pct >= 0.7 ? '#22c55e' : pct >= 0.4 ? '#eab308' : '#ef4444'

  // SVG arc: cx=28, cy=28, r=22, sweep left→right across top
  const r = 22
  const cx = 28, cy = 28
  const startAngle = Math.PI          // 180° — left
  const endAngle   = 0                // 0°   — right
  const totalAngle = Math.PI          // 180° sweep

  function arcPt(angle: number) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  const start   = arcPt(startAngle)
  const end     = arcPt(endAngle)
  const filled  = arcPt(startAngle + totalAngle * pct)

  const bgPath   = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`
  const fillAngle = startAngle + totalAngle * pct
  const largeArc  = pct > 0.5 ? 1 : 0
  const fillPath  = `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${filled.x} ${filled.y}`

  return (
    <svg width="56" height="36" viewBox="0 0 56 36" style={{ flexShrink: 0 }}>
      {/* Track */}
      <path d={bgPath}   fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" strokeLinecap="round" />
      {/* Fill */}
      {pct > 0 && (
        <path d={fillPath} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
      )}
      {/* Label */}
      <text x="28" y="30" textAnchor="middle"
        style={{ fill: color, fontSize: 11, fontFamily: "'Share Tech Mono', monospace", fontWeight: 700 }}
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

// ── Market card ───────────────────────────────────────────────────────────────

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function fmtClose(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now  = Date.now()
  const diff = d.getTime() - now
  if (diff < 0) return 'CLOSED'
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'TODAY'
  if (days === 1) return 'TOMORROW'
  return `${days}d`
}

const SOURCE_COLOR: Record<string, string> = {
  polymarket: '#8b5cf6',
  kalshi:     '#0ea5e9',
}

function MarketCard({ m }: { m: PredictionMarket }) {
  const srcColor = SOURCE_COLOR[m.source] ?? '#94a3b8'
  const closeLabel = fmtClose(m.close_time)
  const closeIsUrgent = closeLabel === 'TODAY' || closeLabel === 'TOMORROW'

  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      style={{ textDecoration: 'none' }}
    >
      <div
        className="flex flex-col gap-1.5 px-3 py-2"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          transition: 'background 0.1s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Top row: source + close time */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-mono uppercase px-1.5 py-0.5"
            style={{
              color:        srcColor,
              background:   `${srcColor}22`,
              border:       `1px solid ${srcColor}55`,
              borderRadius: 2,
              letterSpacing: '0.08em',
            }}
          >
            {m.source}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: closeIsUrgent ? '#f97316' : '#475569' }}
          >
            {closeLabel}
          </span>
        </div>

        {/* Question + probability */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-mono text-[#e2e8f0] leading-tight line-clamp-2">
              {m.question}
            </p>
          </div>
          <ProbArc p={m.probability} />
        </div>

        {/* Bottom row: volume + keywords */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {m.matched_keywords.slice(0, 3).map(kw => (
              <span
                key={kw}
                className="text-[10px] font-mono text-[#475569] px-1"
                style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}
              >
                {kw}
              </span>
            ))}
          </div>
          <span className="text-[10px] font-mono text-[#475569] shrink-0">
            {fmtVolume(m.volume_24h)}<span style={{ color: '#2d3a4a' }}>/24h</span>
          </span>
        </div>
      </div>
    </a>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  slug: string
}

export function MarketsPanel({ slug }: Props) {
  const { data, loading } = useMarketsData(slug)
  const markets = data?.markets ?? []

  return (
    <div
      style={{
        background:   'var(--bg-surface, #0d1224)',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow:     'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#94a3b8]">
          PREDICTION MARKETS
        </span>
        {loading && (
          <span className="text-[10px] font-mono text-[#475569]">LOADING…</span>
        )}
        {!loading && data && (
          <span className="text-[10px] font-mono text-[#475569]">
            {markets.length} CONTRACTS
          </span>
        )}
      </div>

      {/* Markets list */}
      {!loading && markets.length === 0 && (
        <div className="px-3 py-4 text-[11px] font-mono text-[#475569]">
          // NO RELEVANT MARKETS FOUND
        </div>
      )}

      {markets.map(m => (
        <MarketCard key={m.id} m={m} />
      ))}

      {/* Footer — source attribution */}
      {markets.length > 0 && (
        <div
          className="px-3 py-1.5 flex gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-[10px] font-mono text-[#2d3a4a]">
            Sources: Polymarket · Kalshi · Updated 15min
          </span>
        </div>
      )}
    </div>
  )
}
