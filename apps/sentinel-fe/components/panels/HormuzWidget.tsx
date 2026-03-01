'use client'

import type { Vessel } from '@sentinel/shared'

// Strait of Hormuz bounding box (from us-iran conflict config theater)
const HORMUZ_BOUNDS = { latMin: 25, latMax: 27, lonMin: 55, lonMax: 58 }

function inHormuz(v: Vessel): boolean {
  return (
    v.lat >= HORMUZ_BOUNDS.latMin && v.lat <= HORMUZ_BOUNDS.latMax &&
    v.lon >= HORMUZ_BOUNDS.lonMin && v.lon <= HORMUZ_BOUNDS.lonMax
  )
}

function getStraitStatus(vessels: Vessel[]): {
  label: string
  color: string
  description: string
} {
  const inStrait   = vessels.filter(inHormuz)
  const irWarships = inStrait.filter(v => v.side === 'IR' && v.type === 'warship').length
  const irFastBoat = inStrait.filter(v => v.side === 'IR' && v.type === 'fast_boat').length
  const usWarships = inStrait.filter(v => v.side === 'US' && v.type === 'warship').length
  const dark       = inStrait.filter(v => v.ais_dark).length

  if (irWarships >= 3 || (irFastBoat >= 5) || (dark >= 5 && irWarships >= 1)) {
    return { label: 'RESTRICTED', color: '#ef4444', description: 'Heavy IRGC presence' }
  }
  if (irWarships >= 1 || irFastBoat >= 2 || (usWarships >= 1 && irWarships >= 1)) {
    return { label: 'TENSE', color: '#f97316', description: 'Military activity detected' }
  }
  return { label: 'OPEN', color: '#22c55e', description: 'Normal commercial traffic' }
}

interface Props {
  vessels: Vessel[]
}

export default function HormuzWidget({ vessels }: Props) {
  const inStrait = vessels.filter(inHormuz)
  const status   = getStraitStatus(vessels)

  const tankers   = inStrait.filter(v => v.type === 'tanker').length
  const warships  = inStrait.filter(v => v.type === 'warship').length
  const cargo     = inStrait.filter(v => v.type === 'cargo').length
  const fastBoats = inStrait.filter(v => v.type === 'fast_boat').length
  const dark      = inStrait.filter(v => v.ais_dark).length

  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10, color: 'var(--text-secondary)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          Strait of Hormuz
        </span>
        <span style={{
          padding: '2px 6px',
          background: `${status.color}20`,
          border: `1px solid ${status.color}55`,
          borderRadius: 2,
          fontSize: 9, color: status.color,
          letterSpacing: '0.12em',
        }}>
          {status.label}
        </span>
      </div>

      {/* Vessel count grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
        {[
          { label: 'Tankers',  count: tankers,   color: '#eab308' },
          { label: 'Warships', count: warships,  color: '#00b0ff' },
          { label: 'Cargo',    count: cargo,     color: '#94a3b8' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            background: 'var(--bg-base)', borderRadius: 2, padding: '4px 6px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, fontFamily: "'Orbitron', monospace", fontWeight: 700, color }}>
              {count}
            </div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em', marginTop: 1 }}>
              {label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Alerts row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {fastBoats > 0 && (
          <span style={{ fontSize: 9, color: '#ef4444', letterSpacing: '0.06em' }}>
            ⚡ {fastBoats} FAST BOAT{fastBoats > 1 ? 'S' : ''}
          </span>
        )}
        {dark > 0 && (
          <span style={{ fontSize: 9, color: '#f97316', letterSpacing: '0.06em' }}>
            ◉ {dark} AIS DARK
          </span>
        )}
        {fastBoats === 0 && dark === 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {inStrait.length} vessels in strait
          </span>
        )}
      </div>
    </div>
  )
}
