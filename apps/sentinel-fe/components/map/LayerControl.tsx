'use client'

import { useState, useEffect } from 'react'
import type { ConflictConfig } from '@sentinel/shared'
import type { LayerState } from './TheaterMap'

interface Group {
  label: string
  items: { key: keyof LayerState; label: string; available: boolean }[]
}

function buildGroups(conflict: ConflictConfig): Group[] {
  const all: Group[] = [
    {
      label: 'LIVE TRACKS',
      items: [
        { key: 'aircraft',    label: 'Aircraft',     available: true },
        { key: 'vessels',     label: 'Vessels',      available: conflict.dataSources.ais.enabled },
      ],
    },
    {
      label: 'INTEL',
      items: [
        { key: 'incidents',   label: 'Incidents',    available: true },
        { key: 'heatmap',     label: 'Heat Map',     available: true },
      ],
    },
    {
      label: 'GEOGRAPHY',
      items: [
        { key: 'countries',     label: 'Countries',       available: (conflict.overlays.countryHighlights?.length ?? 0) > 0 },
        { key: 'bases',         label: 'Military Bases',  available: conflict.overlays.bases.length > 0 },
        { key: 'sam',           label: 'SAM Coverage',    available: (conflict.overlays.samSites?.length ?? 0) > 0 },
        { key: 'shippingLanes', label: 'Shipping Lanes',  available: (conflict.overlays.shippingLanes?.length ?? 0) > 0 },
        { key: 'chokepoints',   label: 'Chokepoints',     available: (conflict.overlays.chokepoints?.length ?? 0) > 0 },
        { key: 'strikeRanges',  label: 'Strike Ranges ⊙', available: conflict.overlays.bases.some(b => b.strikeRanges?.length) },
      ],
    },
    {
      label: 'NUCLEAR',
      items: [
        { key: 'nuclear', label: 'Nuclear Sites', available: (conflict.overlays.nuclearSites?.length ?? 0) > 0 },
      ],
    },
  ]
  return all.filter(g => g.items.some(i => i.available))
}

interface Props {
  conflict: ConflictConfig
  layers:   LayerState
  onChange: (key: keyof LayerState, value: boolean) => void
}

export default function LayerControl({ conflict, layers, onChange }: Props) {
  const [open, setOpen] = useState(false)

  // Keyboard shortcut: L toggles panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'l' || e.key === 'L') setOpen(o => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups = buildGroups(conflict)

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 10,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Toggle layers (L)"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
          borderRadius: 4, color: 'var(--text-secondary)',
          fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
        }}
      >
        ≡ LAYERS
      </button>

      {open && (
        <div style={{
          marginTop: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '4px 0',
          minWidth: 180,
        }}>
          {groups.map((group, gi) => (
            <div key={group.label}>
              {/* Group header */}
              <div style={{
                fontSize: 8, color: 'var(--text-muted)',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                padding: gi === 0 ? '4px 12px 4px' : '8px 12px 4px',
                borderTop: gi > 0 ? '1px solid var(--border)' : undefined,
              }}>
                {group.label}
              </div>

              {/* Items */}
              {group.items.filter(i => i.available).map(({ key, label }) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 12px 4px 20px',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={e => onChange(key, e.target.checked)}
                    style={{ accentColor: '#00b0ff', width: 11, height: 11 }}
                  />
                  <span style={{
                    fontSize: 10,
                    color: layers[key] ? 'var(--text-primary)' : 'var(--text-muted)',
                    letterSpacing: '0.06em',
                  }}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          ))}

          {/* Keyboard hint */}
          <div style={{
            fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em',
            padding: '6px 12px 4px',
            borderTop: '1px solid var(--border)',
            textAlign: 'right',
          }}>
            Press L to toggle
          </div>
        </div>
      )}
    </div>
  )
}
