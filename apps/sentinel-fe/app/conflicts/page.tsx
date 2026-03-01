'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { ALL_CONFLICTS } from '@sentinel/shared'
import ConflictCard from '@/components/ui/ConflictCard'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const ConflictGlobe = dynamic(
  () => import('@/components/map/ConflictGlobe'),
  { ssr: false, loading: () => <GlobeSkeleton /> },
)

function GlobeSkeleton() {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#050a0f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
        color: '#475569', letterSpacing: '0.15em',
        animation: 'pulse-opacity 1.5s ease-in-out infinite',
      }}>
        INITIALISING GLOBE...
      </span>
    </div>
  )
}

function ZuluClock() {
  const [time, setTime] = useState<string>('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      const iso = now.toISOString()
      setTime(`${iso.slice(0, 10)} · ${iso.slice(11, 19)}Z`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <span style={{
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.08em',
    }}>
      {time}
    </span>
  )
}

interface ConflictStats {
  aircraft_count:  number
  vessel_count:    number
  incidents_24h:   number
  last_updated:    number | null
}

interface ApiConflict {
  slug:  string
  stats: ConflictStats
}

export default function ConflictsPage() {
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const [statsMap, setStatsMap]       = useState<Record<string, ConflictStats>>({})

  // Fetch live stats from API on mount, then every 30s
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${API_BASE}/api/conflicts`)
        if (!res.ok) return
        const data = await res.json() as { conflicts: ApiConflict[] }
        const map: Record<string, ConflictStats> = {}
        for (const c of data.conflicts) {
          map[c.slug] = c.stats
        }
        setStatsMap(map)
      } catch { /* API not up yet — keep empty */ }
    }
    void fetchStats()
    const t = setInterval(() => void fetchStats(), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 25px)',
      background: 'var(--bg-base)', overflow: 'hidden',
    }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 48,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontFamily: "'Orbitron', monospace", fontSize: 18, fontWeight: 700,
            color: '#00b0ff', letterSpacing: '0.1em',
          }}>
            ◈ SENTINEL
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-muted)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            Geospatial Intelligence Operations
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#22c55e', display: 'inline-block',
              animation: 'pulse-opacity 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 10, color: '#22c55e',
              fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.12em',
            }}>
              LIVE
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 9, color: 'var(--text-muted)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1,
            }}>
              Zulu Time
            </div>
            <ZuluClock />
          </div>
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Globe */}
        <div style={{ flex: 1, position: 'relative', background: '#030508' }}>
          <ConflictGlobe
            hoveredSlug={hoveredSlug}
            onHoverConflict={setHoveredSlug}
          />
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 9, color: 'var(--text-muted)',
            letterSpacing: '0.1em', pointerEvents: 'none',
          }}>
            CLICK CONFLICT ZONE TO OPEN THEATER
          </div>
        </div>

        {/* Conflict cards column */}
        <div style={{
          width: 380, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-base)', borderLeft: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <span style={{
              fontSize: 10, color: 'var(--text-secondary)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              Active Theaters
            </span>
            <span style={{
              fontFamily: "'Orbitron', monospace", fontSize: 13, fontWeight: 700, color: '#ef4444',
            }}>
              {ALL_CONFLICTS.filter(c => c.status === 'active').length}
            </span>
          </div>

          {/* Cards */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignContent: 'start',
          }}>
            {ALL_CONFLICTS.map(conflict => {
              const stats = statsMap[conflict.slug]
              return (
                <ConflictCard
                  key={conflict.slug}
                  conflict={conflict}
                  hovered={hoveredSlug === conflict.slug}
                  onHover={setHoveredSlug}
                  aircraftCount={stats?.aircraft_count}
                />
              )
            })}
          </div>

          {/* Bottom note */}
          <div style={{
            padding: '8px 16px', borderTop: '1px solid var(--border)',
            fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', flexShrink: 0,
          }}>
            {Object.keys(statsMap).length > 0
              ? `// LIVE — ${Object.values(statsMap).reduce((s, v) => s + v.aircraft_count, 0)} aircraft tracked`
              : '// CONNECTING TO API...'}
          </div>
        </div>
      </div>
    </div>
  )
}
