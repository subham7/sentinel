'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getConflict } from '@sentinel/shared'
import type { ConflictConfig } from '@sentinel/shared'
import type { LayerState } from '@/components/map/TheaterMap'
import DataFreshness from '@/components/panels/DataFreshness'

const TheaterMap = dynamic(
  () => import('@/components/map/TheaterMap'),
  { ssr: false, loading: () => <MapSkeleton /> },
)

function MapSkeleton() {
  return (
    <div style={{
      width:          '100%',
      height:         '100%',
      background:     '#050810',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      <span style={{
        fontFamily:    "'Share Tech Mono', monospace",
        fontSize:       11,
        color:         '#475569',
        letterSpacing: '0.15em',
        animation:     'pulse-opacity 1.5s ease-in-out infinite',
      }}>
        INITIALISING THEATER MAP...
      </span>
    </div>
  )
}

function ZuluClock() {
  const [time, setTime] = useState('')
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
      fontFamily:    "'Share Tech Mono', monospace",
      fontSize:       12,
      color:         'var(--text-secondary)',
      letterSpacing: '0.06em',
    }}>
      {time}
    </span>
  )
}

const INTENSITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  elevated: '#eab308',
  low:      '#22c55e',
}

// ── Layer control panel ────────────────────────────────────

interface LayerControlProps {
  conflict: ConflictConfig
  layers:   LayerState
  onChange: (key: keyof LayerState, value: boolean) => void
}

function LayerControl({ conflict, layers, onChange }: LayerControlProps) {
  const [open, setOpen] = useState(false)

  const controls: { key: keyof LayerState; label: string; available: boolean }[] = [
    { key: 'bases',       label: 'Military Bases',  available: conflict.overlays.bases.length > 0 },
    { key: 'nuclear',     label: 'Nuclear Sites',   available: (conflict.overlays.nuclearSites?.length ?? 0) > 0 },
    { key: 'sam',         label: 'SAM Coverage',    available: (conflict.overlays.samSites?.length ?? 0) > 0 },
    { key: 'chokepoints', label: 'Chokepoints',     available: (conflict.overlays.chokepoints?.length ?? 0) > 0 },
  ]

  return (
    <div style={{
      position:   'absolute',
      top:         12,
      left:        12,
      zIndex:      10,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:            6,
          padding:       '5px 10px',
          background:   'var(--bg-elevated)',
          border:        '1px solid var(--border-bright)',
          borderRadius:   4,
          color:         'var(--text-secondary)',
          fontSize:       10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor:        'pointer',
        }}
      >
        ≡ LAYERS
      </button>

      {open && (
        <div style={{
          marginTop:  4,
          background: 'var(--bg-elevated)',
          border:     '1px solid var(--border)',
          borderRadius: 4,
          padding:    '8px 0',
          minWidth:    170,
        }}>
          <div style={{
            fontSize:      9,
            color:        'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding:      '0 12px 6px',
            borderBottom: '1px solid var(--border)',
            marginBottom:  4,
          }}>
            Static Overlays
          </div>
          {controls.map(({ key, label, available }) => (
            <label key={key} style={{
              display:       'flex',
              alignItems:    'center',
              gap:            8,
              padding:       '5px 12px',
              cursor:         available ? 'pointer' : 'default',
              opacity:        available ? 1 : 0.4,
            }}>
              <input
                type="checkbox"
                checked={layers[key]}
                disabled={!available}
                onChange={e => onChange(key, e.target.checked)}
                style={{ accentColor: '#00b0ff', width: 12, height: 12 }}
              />
              <span style={{
                fontSize:      10,
                color:         layers[key] ? 'var(--text-primary)' : 'var(--text-muted)',
                letterSpacing: '0.06em',
              }}>
                {label}
              </span>
              {!available && (
                <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  N/A
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Left sidebar: bases list ───────────────────────────────

function BasesPanel({ conflict }: { conflict: ConflictConfig }) {
  return (
    <div style={{
      width:          220,
      flexShrink:     0,
      background:    'var(--bg-surface)',
      borderRight:   '1px solid var(--border)',
      display:        'flex',
      flexDirection:  'column',
      overflow:       'hidden',
    }}>
      <div style={{
        padding:       '8px 12px',
        borderBottom:  '1px solid var(--border)',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        flexShrink:     0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Known Bases
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {conflict.overlays.bases.length}
        </span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {conflict.overlays.bases.map(base => {
          const PARTY_COLORS: Record<string, string> = {
            US: '#00b0ff', IR: '#ef4444', IL: '#22c55e',
            GCC: '#f59e0b', PS: '#ef4444', LB: '#f97316',
          }
          const color = PARTY_COLORS[base.party] ?? '#94a3b8'
          return (
            <div key={base.id} style={{
              padding:    '6px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              borderLeft: `2px solid ${color}`,
            }}>
              <div style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {base.name}
                </span>
                <span style={{
                  fontSize:      9,
                  color,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  {base.party}
                </span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                {base.type.toUpperCase()} · {base.country}
              </div>
            </div>
          )
        })}
      </div>

      {/* Phase 0 placeholder for track list */}
      <div style={{
        padding:    '8px 12px',
        borderTop:  '1px solid var(--border)',
        fontSize:    9,
        color:      'var(--text-muted)',
        letterSpacing: '0.08em',
        flexShrink:  0,
      }}>
        // AIR TRACKS — PHASE 1
      </div>
    </div>
  )
}

// ── Right sidebar: posture + nuclear watch ─────────────────

function PosturePanel({ conflict }: { conflict: ConflictConfig }) {
  const intensityColor = INTENSITY_COLORS[conflict.intensity] ?? '#94a3b8'
  const hasNuclear = (conflict.overlays.nuclearSites?.length ?? 0) > 0

  return (
    <div style={{
      width:          280,
      flexShrink:     0,
      background:    'var(--bg-surface)',
      borderLeft:    '1px solid var(--border)',
      display:        'flex',
      flexDirection:  'column',
      overflow:       'hidden',
    }}>
      {/* Theater posture */}
      <div style={{
        padding:      '8px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink:    0,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          Theater Posture
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Intensity',  value: conflict.intensity.toUpperCase(), color: intensityColor },
            { label: 'Status',     value: conflict.status.toUpperCase(),    color: '#22c55e' },
            { label: 'Parties',    value: conflict.parties.length,          color: 'var(--text-primary)' },
            { label: 'Theaters',   value: conflict.map.theaters.length,     color: 'var(--text-primary)' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                {label}
              </div>
              <div style={{
                fontFamily:    "'Orbitron', monospace",
                fontSize:       13,
                fontWeight:     700,
                color,
                letterSpacing: '0.04em',
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-theaters */}
      <div style={{
        padding:      '8px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink:    0,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          Sub-Theaters
        </div>
        {conflict.map.theaters.map(t => (
          <div key={t.id} style={{
            display:        'flex',
            justifyContent: 'space-between',
            padding:        '3px 0',
            borderBottom:   '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{t.name}</span>
          </div>
        ))}
      </div>

      {/* Parties */}
      <div style={{
        padding:      '8px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink:    0,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          Parties
        </div>
        {conflict.parties.map(p => (
          <div key={p.shortCode} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <span style={{ fontSize: 14 }}>{p.flagEmoji}</span>
            <span style={{ fontSize: 10, color: p.color, letterSpacing: '0.06em' }}>{p.shortCode}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Nuclear watch (us-iran only) */}
      {hasNuclear && (
        <div style={{
          padding:      '8px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink:    0,
        }}>
          <div style={{
            fontSize:      10,
            color:        '#a855f7',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom:   6,
          }}>
            ◈ Nuclear Watch
          </div>
          {(conflict.overlays.nuclearSites ?? []).map(site => {
            const statusColors: Record<string, string> = {
              active:      '#ef4444',
              suspected:   '#f97316',
              modified:    '#eab308',
              operational: '#22c55e',
              shutdown:    '#94a3b8',
            }
            const color = statusColors[site.status] ?? '#94a3b8'
            return (
              <div key={site.id} style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
                padding:        '3px 0',
                borderBottom:   '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{site.name}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {site.status}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {site.enrichment}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Incident feed placeholder */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{
          fontFamily:    "'Share Tech Mono', monospace",
          fontSize:       10,
          color:         'var(--text-muted)',
          letterSpacing: '0.08em',
        }}>
          // INCIDENT FEED — PHASE 3
        </span>
      </div>
    </div>
  )
}

// ── Main theater page ──────────────────────────────────────

export default function TheaterPage() {
  const params = useParams<{ slug: string }>()
  const slug   = params?.slug ?? ''

  const conflict = getConflict(slug)

  const [layers, setLayers] = useState<LayerState>({
    bases:       true,
    nuclear:     true,
    sam:         true,
    chokepoints: true,
  })

  function handleLayerToggle(key: keyof LayerState, value: boolean) {
    setLayers(prev => ({ ...prev, [key]: value }))
  }

  if (!conflict) {
    return (
      <div style={{
        display:        'flex',
        height:         'calc(100vh - 25px)',
        alignItems:     'center',
        justifyContent: 'center',
        flexDirection:  'column',
        gap:             16,
        background:    'var(--bg-base)',
        fontFamily:    "'Share Tech Mono', monospace",
      }}>
        <div style={{ fontSize: 11, color: '#ef4444', letterSpacing: '0.15em' }}>
          // 404 — THEATER NOT FOUND
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Unknown conflict slug: <code style={{ color: 'var(--text-accent)' }}>{slug}</code>
        </div>
        <a href="/conflicts" style={{ fontSize: 10, color: 'var(--text-accent)', letterSpacing: '0.1em' }}>
          ← RETURN TO CONFLICTS
        </a>
      </div>
    )
  }

  const intensityColor = INTENSITY_COLORS[conflict.intensity] ?? '#94a3b8'

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        'calc(100vh - 25px)',
      background:   'var(--bg-base)',
      overflow:      'hidden',
    }}>
      {/* ── Theater header ─────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 16px',
        height:          52,
        background:     'var(--bg-surface)',
        borderBottom:   '1px solid var(--border)',
        flexShrink:      0,
        gap:             16,
      }}>
        {/* Left: back + conflict name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <a
            href="/conflicts"
            style={{
              fontSize:      10,
              color:        'var(--text-muted)',
              fontFamily:   "'Share Tech Mono', monospace",
              letterSpacing: '0.1em',
              textDecoration: 'none',
              whiteSpace:    'nowrap',
            }}
          >
            ← CONFLICTS
          </a>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{
            fontFamily:    "'Orbitron', monospace",
            fontSize:       18,
            fontWeight:     700,
            color:         'var(--text-primary)',
            letterSpacing: '0.06em',
            whiteSpace:    'nowrap',
          }}>
            {conflict.name}
          </div>
          <span style={{
            fontSize:      10,
            color:        'var(--text-secondary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            {conflict.shortName}
          </span>
        </div>

        {/* Center: parties */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {conflict.parties.map(p => (
            <div key={p.shortCode} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 16 }}>{p.flagEmoji}</span>
              <span style={{ fontSize: 10, color: p.color, letterSpacing: '0.08em' }}>{p.shortCode}</span>
            </div>
          ))}
        </div>

        {/* Right: intensity + clock + live */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <span style={{
            padding:       '3px 8px',
            background:    `${intensityColor}20`,
            border:        `1px solid ${intensityColor}55`,
            borderRadius:   2,
            fontSize:       10,
            color:          intensityColor,
            fontFamily:    "'Share Tech Mono', monospace",
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            animation:      conflict.intensity === 'critical' ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
          }}>
            {conflict.intensity.toUpperCase()}
          </span>

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          <ZuluClock />

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   '#22c55e',
              display:      'inline-block',
              animation:    'pulse-opacity 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize:      10,
              color:        '#22c55e',
              fontFamily:   "'Share Tech Mono', monospace",
              letterSpacing: '0.12em',
            }}>
              LIVE
            </span>
          </div>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <BasesPanel conflict={conflict} />

        {/* Map area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <TheaterMap conflict={conflict} layers={layers} />
          <LayerControl
            conflict={conflict}
            layers={layers}
            onChange={handleLayerToggle}
          />
        </div>

        <PosturePanel conflict={conflict} />
      </div>

      {/* ── Status bar ─────────────────────────────────── */}
      <DataFreshness />
    </div>
  )
}
