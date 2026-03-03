'use client'

import { useState, useEffect } from 'react'
import type { ConflictConfig } from '@sentinel/shared'
import { getFrontline } from '@sentinel/shared'
import { getAdizZones, getMaritimeZones } from '@sentinel/shared'
import type { LayerState, HeatmapWindow } from './TheaterMap'
import { GIBS_LAYERS } from './layers/SatelliteLayer'

interface Group {
  label: string
  items: { key: keyof LayerState; label: string; available: boolean; tip?: string }[]
}

function buildGroups(conflict: ConflictConfig): Group[] {
  const hasFrontlines = !!getFrontline(conflict.slug)
  const hasAdiz       = getAdizZones(conflict.slug).length > 0
  const hasMaritime   = getMaritimeZones(conflict.slug).length > 0

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
        { key: 'countries',     label: 'Countries',              available: (conflict.overlays.countryHighlights?.length ?? 0) > 0 },
        { key: 'bases',         label: 'Military Bases',         available: conflict.overlays.bases.length > 0 },
        { key: 'sam',           label: 'SAM Coverage',           available: (conflict.overlays.samSites?.length ?? 0) > 0 },
        { key: 'shippingLanes', label: 'Shipping Lanes',         available: (conflict.overlays.shippingLanes?.length ?? 0) > 0 },
        { key: 'chokepoints',   label: 'Chokepoints',            available: (conflict.overlays.chokepoints?.length ?? 0) > 0 },
        { key: 'strikeRanges',  label: 'Strike Ranges ⊙',        available: conflict.overlays.bases.some(b => b.strikeRanges?.length) },
        { key: 'frontlines',    label: 'Frontlines / Control',   available: hasFrontlines, tip: 'Territorial control zones and contact line (approximate)' },
        { key: 'adiz',          label: 'ADIZ Boundaries',        available: hasAdiz, tip: 'Air Defense Identification Zones and Flight Information Regions' },
        { key: 'maritime',      label: 'Maritime Zones',         available: hasMaritime, tip: 'Territorial sea (12 NM), EEZ, and contested maritime boundaries' },
      ],
    },
    {
      label: 'SIGNALS',
      items: [
        {
          key:       'gpsjamming',
          label:     'GPS Jamming ◈',
          available: true,
          tip:       'Daily GPS/GNSS interference detection from GPSJam.org — H3 hexagonal grid, color = jamming intensity (amber → red)',
        },
      ],
    },
    {
      label: 'SATELLITE',
      items: [
        { key: 'satellite_truecolor',   label: GIBS_LAYERS.truecolor.label,   available: true, tip: GIBS_LAYERS.truecolor.tip },
        { key: 'satellite_nightlights', label: GIBS_LAYERS.nightlights.label, available: true, tip: GIBS_LAYERS.nightlights.tip },
        { key: 'satellite_thermal',     label: GIBS_LAYERS.thermal.label,     available: true, tip: GIBS_LAYERS.thermal.tip },
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

const SAT_KEYS: Array<keyof LayerState> = ['satellite_truecolor', 'satellite_nightlights', 'satellite_thermal']

const HEATMAP_WINDOWS: { key: HeatmapWindow; label: string }[] = [
  { key: '24h', label: '24H' },
  { key: '7d',  label: '7D'  },
  { key: '30d', label: '30D' },
]

interface Props {
  conflict:            ConflictConfig
  layers:              LayerState
  onChange:            (key: keyof LayerState, value: boolean) => void
  satDate:             string
  onSatDateChange:     (d: string) => void
  satOpacity:          number
  onSatOpacityChange:  (o: number) => void
  heatmapWindow:       HeatmapWindow
  onHeatmapWindow:     (w: HeatmapWindow) => void
}

export default function LayerControl({
  conflict, layers, onChange,
  satDate, onSatDateChange, satOpacity, onSatOpacityChange,
  heatmapWindow, onHeatmapWindow,
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'l' || e.key === 'L') setOpen(o => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups       = buildGroups(conflict)
  const anySatActive = SAT_KEYS.some(k => layers[k])

  function stepDate(delta: number) {
    const d = new Date(satDate + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    onSatDateChange(d.toISOString().slice(0, 10))
  }

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
          minWidth: 210,
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
        }}>
          {groups.map((group, gi) => {
            const isSatGroup  = group.label === 'SATELLITE'
            const isIntelGroup = group.label === 'INTEL'
            return (
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
                {group.items.filter(i => i.available).map(({ key, label, tip }) => (
                  <label key={key} title={tip} style={{
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

                {/* Heatmap time window — visible when INTEL group and heatmap is on */}
                {isIntelGroup && layers.heatmap && (
                  <div style={{ padding: '4px 12px 6px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em', flexShrink: 0 }}>
                      WINDOW
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {HEATMAP_WINDOWS.map(w => (
                        <button
                          key={w.key}
                          onClick={() => onHeatmapWindow(w.key)}
                          style={{
                            padding: '2px 6px',
                            background:   heatmapWindow === w.key ? '#00b0ff22' : 'transparent',
                            border:       `1px solid ${heatmapWindow === w.key ? '#00b0ff' : 'var(--border)'}`,
                            borderRadius:  2,
                            color:         heatmapWindow === w.key ? '#00b0ff' : 'var(--text-muted)',
                            fontSize:      8,
                            letterSpacing: '0.08em',
                            cursor:        'pointer',
                            fontFamily:    "'Share Tech Mono', monospace",
                          }}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Satellite controls */}
                {isSatGroup && anySatActive && (
                  <div style={{ padding: '6px 12px 4px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em', flexShrink: 0 }}>
                        DATE
                      </span>
                      <button
                        onClick={() => stepDate(-1)}
                        title="Previous day"
                        style={{
                          background: 'none', border: '1px solid var(--border)', borderRadius: 2,
                          color: 'var(--text-secondary)', cursor: 'pointer',
                          fontSize: 9, padding: '1px 5px', lineHeight: 1,
                        }}
                      >
                        ◄
                      </button>
                      <input
                        type="date"
                        value={satDate}
                        onChange={e => onSatDateChange(e.target.value)}
                        style={{
                          flex: 1, minWidth: 0,
                          background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                          borderRadius: 2, color: 'var(--text-primary)',
                          fontSize: 9, padding: '2px 4px',
                          fontFamily: "'Share Tech Mono', monospace",
                          colorScheme: 'dark',
                        }}
                      />
                      <button
                        onClick={() => stepDate(1)}
                        title="Next day"
                        style={{
                          background: 'none', border: '1px solid var(--border)', borderRadius: 2,
                          color: 'var(--text-secondary)', cursor: 'pointer',
                          fontSize: 9, padding: '1px 5px', lineHeight: 1,
                        }}
                      >
                        ►
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em', flexShrink: 0 }}>
                        OPACITY
                      </span>
                      <input
                        type="range"
                        min={30}
                        max={100}
                        value={Math.round(satOpacity * 100)}
                        onChange={e => onSatOpacityChange(parseInt(e.target.value, 10) / 100)}
                        style={{ flex: 1, accentColor: '#00b0ff', height: 2 }}
                      />
                      <span style={{ fontSize: 8, color: 'var(--text-secondary)', minWidth: 24, textAlign: 'right' }}>
                        {Math.round(satOpacity * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

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
