'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getConflict } from '@sentinel/shared'
import type { ConflictConfig, Aircraft, Vessel, Incident } from '@sentinel/shared'
import type { LayerState } from '@/components/map/TheaterMap'
import DataFreshness from '@/components/panels/DataFreshness'
import HormuzWidget from '@/components/panels/HormuzWidget'
import IncidentFeed from '@/components/panels/IncidentFeed'
import SitrepPanel from '@/components/panels/SitrepPanel'
import AnalystChat from '@/components/panels/AnalystChat'
import LayerControl from '@/components/map/LayerControl'
import { useAircraftWebSocket } from '@/hooks/useAircraftWebSocket'
import { useVesselWebSocket } from '@/hooks/useVesselWebSocket'
import { useIncidentSSE } from '@/hooks/useIncidentSSE'
import { useNuclearStatus } from '@/hooks/useNuclearStatus'
import { useSitrepReport } from '@/hooks/useSitrepReport'
import { detectConvergence } from '@/services/signal-aggregator'
import type { ConvergenceAlert } from '@/services/signal-aggregator'
import { detectSurge, detectStrikePackage } from '@/services/military-surge'
import type { SurgeAlert } from '@/services/military-surge'

const TheaterMap = dynamic(
  () => import('@/components/map/TheaterMap'),
  { ssr: false, loading: () => <MapSkeleton /> },
)

function MapSkeleton() {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#050810',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
        color: '#475569', letterSpacing: '0.15em',
        animation: 'pulse-opacity 1.5s ease-in-out infinite',
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
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.06em',
    }}>
      {time}
    </span>
  )
}

const INTENSITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', elevated: '#eab308', low: '#22c55e',
}

const PARTY_COLORS: Record<string, string> = {
  US: '#00b0ff', IR: '#ef4444', IL: '#22c55e',
  GCC: '#f59e0b', PS: '#ef4444', LB: '#f97316', UN: '#94a3b8',
}

const TYPE_LABELS: Record<string, string> = {
  fighter: 'FTR', tanker: 'TKR', isr: 'ISR', transport: 'TRN', uav: 'UAV', unknown: '???',
}

const VESSEL_TYPE_LABELS: Record<string, string> = {
  warship: 'WAR', tanker: 'TNK', cargo: 'CRG', fast_boat: 'FAB', submarine: 'SUB', unknown: '???',
}


// ── Track list / Bases panel (left sidebar) ───────────────────────────────────

interface TrackListProps {
  conflict:          ConflictConfig
  aircraft:          Aircraft[]
  vessels:           Vessel[]
  selectedAircraftId: string | null
  selectedVesselId:   string | null
  onSelectAircraft:   (id: string | null) => void
  onSelectVessel:     (id: string | null) => void
}

type TrackTab = 'air' | 'sea'

function TrackList({
  conflict,
  aircraft,
  vessels,
  selectedAircraftId,
  selectedVesselId,
  onSelectAircraft,
  onSelectVessel,
}: TrackListProps) {
  const [tab, setTab] = useState<TrackTab>('air')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '5px 0', textAlign: 'center',
    fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    background: active ? 'var(--bg-overlay)' : 'transparent',
    border: 'none', borderBottom: active ? '1px solid #00b0ff' : '1px solid transparent',
    cursor: 'pointer', fontFamily: "'Share Tech Mono', monospace",
  })

  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Tab header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button style={tabStyle(tab === 'air')} onClick={() => setTab('air')}>
          ✈ Air ({aircraft.length})
        </button>
        <button style={tabStyle(tab === 'sea')} onClick={() => setTab('sea')}>
          ⚓ Sea ({vessels.length})
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {tab === 'air' ? (
          aircraft.length > 0 ? aircraft.map(ac => {
            const color      = PARTY_COLORS[ac.side] ?? '#94a3b8'
            const isSelected = ac.icao24 === selectedAircraftId
            return (
              <div
                key={ac.icao24}
                onClick={() => onSelectAircraft(isSelected ? null : ac.icao24)}
                style={{
                  padding: '5px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: `2px solid ${color}`,
                  background: isSelected ? 'var(--bg-overlay)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, color: 'var(--text-primary)', fontWeight: 600,
                    fontFamily: "'Share Tech Mono', monospace",
                    maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ac.callsign}
                  </span>
                  <span style={{ fontSize: 9, color, letterSpacing: '0.08em' }}>
                    {TYPE_LABELS[ac.type] ?? '???'}
                  </span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 9, color: 'var(--text-muted)', marginTop: 2,
                }}>
                  <span>{ac.altitude > 0 ? `${Math.round(ac.altitude / 100) * 100}ft` : 'GND'}</span>
                  <span>{ac.speed > 0 ? `${Math.round(ac.speed)}kt` : '—'}</span>
                </div>
              </div>
            )
          }) : (
            <>
              <div style={{ padding: '6px 12px', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                AWAITING TRACKS...
              </div>
              {conflict.overlays.bases.map(base => {
                const color = PARTY_COLORS[base.party] ?? '#94a3b8'
                return (
                  <div key={base.id} style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    borderLeft: `2px solid ${color}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{base.name}</span>
                      <span style={{ fontSize: 9, color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{base.party}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      {base.type.toUpperCase()} · {base.country}
                    </div>
                  </div>
                )
              })}
            </>
          )
        ) : (
          vessels.length > 0 ? vessels.map(v => {
            const color      = v.ais_dark ? '#475569' : (PARTY_COLORS[v.side] ?? '#94a3b8')
            const isSelected = v.mmsi === selectedVesselId
            return (
              <div
                key={v.mmsi}
                onClick={() => onSelectVessel(isSelected ? null : v.mmsi)}
                style={{
                  padding: '5px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: `2px solid ${v.ais_dark ? '#475569' : color}`,
                  background: isSelected ? 'var(--bg-overlay)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, color: v.ais_dark ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 600,
                    fontFamily: "'Share Tech Mono', monospace",
                    maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {v.name}
                  </span>
                  <span style={{ fontSize: 9, color, letterSpacing: '0.08em' }}>
                    {VESSEL_TYPE_LABELS[v.type] ?? '???'}
                  </span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 9, color: 'var(--text-muted)', marginTop: 2,
                }}>
                  <span style={{ color: v.ais_dark ? '#ef4444' : 'var(--text-muted)' }}>
                    {v.ais_dark ? 'AIS DARK' : `${v.speed.toFixed(1)}kt`}
                  </span>
                  <span>{v.side}</span>
                </div>
              </div>
            )
          }) : (
            <div style={{ padding: '12px', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              // NO VESSELS
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ── Aircraft detail popup ─────────────────────────────────────────────────────

function AircraftPopup({ ac, onClose }: { ac: Aircraft; onClose: () => void }) {
  const color = PARTY_COLORS[ac.side] ?? '#94a3b8'
  return (
    <div style={{
      position: 'absolute', top: 60, right: 16, zIndex: 20,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
      borderRadius: 4, padding: 12, minWidth: 240,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 9, color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          ✈ {ac.side} · {TYPE_LABELS[ac.type] ?? '???'}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 12, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        {ac.callsign}
      </div>

      {[
        { label: 'ICAO24',   value: ac.icao24.toUpperCase() },
        { label: 'ALT',      value: ac.altitude > 0 ? `${ac.altitude.toLocaleString()} ft` : 'GND' },
        { label: 'SPEED',    value: ac.speed > 0 ? `${Math.round(ac.speed)} kt` : '—' },
        { label: 'HEADING',  value: ac.heading > 0 ? `${Math.round(ac.heading)}°` : '—' },
        { label: 'POSITION', value: `${ac.lat.toFixed(4)}°N ${ac.lon.toFixed(4)}°E` },
        { label: 'MILITARY', value: ac.mil ? 'YES' : 'UNCONFIRMED' },
      ].map(({ label, value }) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>{label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Vessel detail popup ───────────────────────────────────────────────────────

function VesselPopup({ v, onClose }: { v: Vessel; onClose: () => void }) {
  const color = v.ais_dark ? '#94a3b8' : (PARTY_COLORS[v.side] ?? '#94a3b8')
  return (
    <div style={{
      position: 'absolute', top: 60, right: 16, zIndex: 20,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
      borderRadius: 4, padding: 12, minWidth: 240,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 9, color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          ⚓ {v.side} · {VESSEL_TYPE_LABELS[v.type] ?? '???'}
          {v.ais_dark && <span style={{ color: '#ef4444', marginLeft: 6 }}>◉ AIS DARK</span>}
          {v.sanctioned && <span style={{ color: '#f97316', marginLeft: 6 }}>⚠ SANCTIONED</span>}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        {v.name}
      </div>

      {[
        { label: 'MMSI',     value: v.mmsi },
        { label: 'SPEED',    value: v.speed > 0 ? `${v.speed.toFixed(1)} kt` : '— kt' },
        { label: 'HEADING',  value: v.heading > 0 ? `${Math.round(v.heading)}°` : '—' },
        { label: 'POSITION', value: `${v.lat.toFixed(4)}°N ${v.lon.toFixed(4)}°E` },
        { label: 'STATUS',   value: v.ais_dark ? 'AIS DARK' : 'TRANSMITTING' },
      ].map(({ label, value }) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>{label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Surge / convergence severity color ────────────────────────────────────────

const SURGE_COLORS: Record<string, string> = {
  elevated: '#eab308', high: '#f97316', critical: '#ef4444',
}

// ── Right sidebar: posture + nuclear watch ────────────────────────────────────

function PosturePanel({
  conflict, aircraft, vessels, incidents, incidentStatus, onFlyTo,
  sitrep, sitrepLoading, sitrepPending,
  convergenceAlerts, surgeAlerts, strikePackage,
}: {
  conflict: ConflictConfig
  aircraft: Aircraft[]
  vessels: Vessel[]
  incidents: Incident[]
  incidentStatus: 'connecting' | 'connected' | 'error'
  onFlyTo: (lat: number, lon: number) => void
  sitrep: import('@sentinel/shared').SitrepReport | null
  sitrepLoading: boolean
  sitrepPending: boolean
  convergenceAlerts: ConvergenceAlert[]
  surgeAlerts: SurgeAlert[]
  strikePackage: boolean
}) {
  const intensityColor = INTENSITY_COLORS[conflict.intensity] ?? '#94a3b8'
  const hasNuclear = (conflict.overlays.nuclearSites?.length ?? 0) > 0

  const usCnt    = aircraft.filter(a => a.side === 'US').length
  const irCnt    = aircraft.filter(a => a.side === 'IR').length
  const ilCnt    = aircraft.filter(a => a.side === 'IL').length
  const usVesCnt = vessels.filter(v => v.side === 'US').length
  const irVesCnt = vessels.filter(v => v.side === 'IR').length
  const darkCnt  = vessels.filter(v => v.ais_dark).length

  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ── Scrollable upper sections ───────────────────────────────────────────
          flex: 1 1 0 + minHeight: 0 lets this shrink below content size so the
          incident feed below always gets its guaranteed 300px slot.           */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>

      {/* Theater posture */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Theater Posture
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Intensity', value: conflict.intensity.toUpperCase(), color: intensityColor },
            { label: 'Status',    value: conflict.status.toUpperCase(),    color: '#22c55e' },
            { label: 'AC Total',  value: aircraft.length || '—', color: aircraft.length > 0 ? '#00b0ff' : 'var(--text-muted)' },
            { label: 'Vessels',   value: vessels.length  || '—', color: vessels.length  > 0 ? '#22c55e' : 'var(--text-muted)' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{
                fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 2,
              }}>
                {label}
              </div>
              <div style={{
                fontFamily: "'Orbitron', monospace", fontSize: 13, fontWeight: 700,
                color, letterSpacing: '0.04em',
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aircraft by side */}
      {aircraft.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 6,
          }}>
            Aircraft by Side
          </div>
          {[
            { side: 'US', count: usCnt, color: '#00b0ff' },
            { side: 'IR', count: irCnt, color: '#ef4444' },
            { side: 'IL', count: ilCnt, color: '#22c55e' },
            { side: 'ALLIED', count: aircraft.filter(a => a.side === 'ALLIED').length, color: '#f59e0b' },
            { side: 'UNKNOWN', count: aircraft.filter(a => a.side === 'UNKNOWN').length, color: '#94a3b8' },
          ].filter(r => r.count > 0).map(({ side, count, color }) => (
            <div key={side} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 10, color }}>{side}</span>
              <span style={{
                fontFamily: "'Orbitron', monospace", fontSize: 11, fontWeight: 700, color,
              }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Vessels by side */}
      {vessels.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 6,
          }}>
            Naval Tracks
          </div>
          {[
            { label: 'US Vessels',  count: usVesCnt, color: '#00b0ff' },
            { label: 'IR Vessels',  count: irVesCnt, color: '#ef4444' },
            { label: 'AIS Dark',    count: darkCnt,  color: '#f97316' },
          ].filter(r => r.count > 0).map(({ label, count, color }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 10, color }}>{label}</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, fontWeight: 700, color }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Hormuz widget (us-iran only) */}
      {conflict.slug === 'us-iran' && vessels.length > 0 && (
        <HormuzWidget vessels={vessels} />
      )}

      {/* Sub-theaters */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: 6,
        }}>
          Sub-Theaters
        </div>
        {conflict.map.theaters.map(t => (
          <div key={t.id} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{t.name}</span>
          </div>
        ))}
      </div>

      {/* Parties */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: 6,
        }}>
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
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, color: '#a855f7', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 6,
          }}>
            ◈ Nuclear Watch
          </div>
          {(conflict.overlays.nuclearSites ?? []).map(site => {
            const statusColors: Record<string, string> = {
              active: '#ef4444', suspected: '#f97316', modified: '#eab308',
              operational: '#22c55e', shutdown: '#94a3b8',
            }
            const color = statusColors[site.status] ?? '#94a3b8'
            return (
              <div key={site.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{site.name}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {site.status}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{site.enrichment}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Convergence alerts */}
      {convergenceAlerts.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, color: '#f97316', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 6,
          }}>
            ◉ Convergence ({convergenceAlerts.length})
          </div>
          {convergenceAlerts.slice(0, 3).map(alert => (
            <div key={alert.cellId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: "'Share Tech Mono', monospace" }}>
                {alert.centerLat.toFixed(1)}°N {alert.centerLon.toFixed(1)}°E
              </span>
              <span style={{ fontSize: 9, color: '#f97316', letterSpacing: '0.06em' }}>
                {alert.signals.map(s => s.toUpperCase().slice(0,2)).join('+')} ×{alert.entityCount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Surge / strike package alerts */}
      {(surgeAlerts.length > 0 || strikePackage) && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, color: '#ef4444', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 6,
          }}>
            ⚠ Surge Detection
          </div>
          {strikePackage && (
            <div style={{
              padding: '4px 8px', marginBottom: 4,
              background: '#ef444422', border: '1px solid #ef444455', borderRadius: 2,
              fontSize: 10, color: '#ef4444', letterSpacing: '0.08em',
              animation: 'pulse-opacity 1.5s ease-in-out infinite',
            }}>
              STRIKE PACKAGE DETECTED
            </div>
          )}
          {surgeAlerts.map(alert => {
            const color = SURGE_COLORS[alert.severity] ?? '#94a3b8'
            return (
              <div key={alert.metric} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {alert.metric.toUpperCase()} SURGE
                </span>
                <span style={{ fontSize: 9, color, letterSpacing: '0.08em' }}>
                  {alert.current} (μ={alert.mean}, z={alert.zScore})
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* SITREP panel */}
      <SitrepPanel
        report={sitrep}
        loading={sitrepLoading}
        pending={sitrepPending}
      />

      {/* Analyst chat */}
      <AnalystChat slug={conflict.slug} />

      </div>{/* end scrollable upper sections */}

      {/* ── Incident feed — pinned at bottom, always visible ─────────────────── */}
      <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <IncidentFeed incidents={incidents} onFlyTo={onFlyTo} status={incidentStatus} />
      </div>
    </div>
  )
}

// ── Main theater page ─────────────────────────────────────────────────────────

export default function TheaterPage() {
  const params = useParams<{ slug: string }>()
  const slug   = params?.slug ?? ''

  const conflict = getConflict(slug)

  const DEFAULT_LAYERS: LayerState = {
    aircraft:      true,
    vessels:       true,
    incidents:     true,
    heatmap:       false,
    bases:         true,
    nuclear:       true,
    sam:           true,
    shippingLanes: true,
    chokepoints:   true,
    strikeRanges:  false,
  }

  const [layers, setLayers] = useState<LayerState>(() => {
    // Initialise from URL ?layers= param (client-side only)
    if (typeof window === 'undefined') return DEFAULT_LAYERS
    const raw = new URLSearchParams(window.location.search).get('layers')
    if (!raw) return DEFAULT_LAYERS
    const active = new Set(raw.split(','))
    return Object.fromEntries(
      Object.keys(DEFAULT_LAYERS).map(k => [k, active.has(k)])
    ) as unknown as LayerState
  })
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null)
  const [selectedVesselId,   setSelectedVesselId]   = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number } | null>(null)

  const { aircraft }                     = useAircraftWebSocket(slug)
  const { vessels }                      = useVesselWebSocket(slug)
  const { incidents, status: incStatus } = useIncidentSSE(slug)
  const nuclearStatuses                  = useNuclearStatus(slug)
  const { report: sitrep, loading: sitrepLoading, pending: sitrepPending } = useSitrepReport(slug)

  const convergenceAlerts = useMemo(
    () => detectConvergence(aircraft, vessels, incidents),
    [aircraft, vessels, incidents],
  )
  const surgeAlerts = useMemo(
    () => detectSurge(slug, aircraft, vessels),
    [slug, aircraft, vessels],
  )
  const strikePackage = useMemo(() => detectStrikePackage(aircraft), [aircraft])

  const selectedAc = selectedAircraftId ? aircraft.find(a => a.icao24 === selectedAircraftId) ?? null : null
  const selectedVs = selectedVesselId   ? vessels.find(v => v.mmsi === selectedVesselId)      ?? null : null

  function handleLayerToggle(key: keyof LayerState, value: boolean) {
    setLayers(prev => {
      const next = { ...prev, [key]: value }
      // Persist to URL
      const active = Object.entries(next).filter(([, v]) => v).map(([k]) => k).join(',')
      const url = new URL(window.location.href)
      url.searchParams.set('layers', active)
      window.history.replaceState(null, '', url.toString())
      return next
    })
  }

  if (!conflict) {
    return (
      <div style={{
        display: 'flex', height: 'calc(100vh - 25px)',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
        background: 'var(--bg-base)', fontFamily: "'Share Tech Mono', monospace",
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
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 25px)',
      background: 'var(--bg-base)', overflow: 'hidden',
    }}>
      {/* ── Theater header ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 52,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, gap: 16,
      }}>
        {/* Left: back + conflict name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <a
            href="/conflicts"
            style={{
              fontSize: 10, color: 'var(--text-muted)',
              fontFamily: "'Share Tech Mono', monospace",
              letterSpacing: '0.1em', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            ← CONFLICTS
          </a>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{
            fontFamily: "'Orbitron', monospace", fontSize: 18, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '0.06em', whiteSpace: 'nowrap',
          }}>
            {conflict.name}
          </div>
          <span style={{
            fontSize: 10, color: 'var(--text-secondary)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
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

        {/* Right: counts + intensity + clock + live */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {aircraft.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>AC</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: '#00b0ff' }}>
                {aircraft.length}
              </span>
            </div>
          )}
          {vessels.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>VS</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: '#22c55e' }}>
                {vessels.length}
              </span>
            </div>
          )}
          {incidents.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>EVT</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: '#eab308' }}>
                {incidents.length}
              </span>
            </div>
          )}

          <span style={{
            padding: '3px 8px',
            background: `${intensityColor}20`,
            border: `1px solid ${intensityColor}55`,
            borderRadius: 2,
            fontSize: 10, color: intensityColor,
            fontFamily: "'Share Tech Mono', monospace",
            letterSpacing: '0.12em', textTransform: 'uppercase',
            animation: conflict.intensity === 'critical' ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
          }}>
            {conflict.intensity.toUpperCase()}
          </span>

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <ZuluClock />
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <TrackList
          conflict={conflict}
          aircraft={aircraft}
          vessels={vessels}
          selectedAircraftId={selectedAircraftId}
          selectedVesselId={selectedVesselId}
          onSelectAircraft={setSelectedAircraftId}
          onSelectVessel={setSelectedVesselId}
        />

        {/* Map area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <TheaterMap
            conflict={conflict}
            layers={layers}
            aircraft={aircraft}
            vessels={vessels}
            incidents={incidents}
            nuclearStatuses={nuclearStatuses}
            selectedId={selectedAircraftId}
            onPickAircraft={ac => setSelectedAircraftId(ac?.icao24 ?? null)}
            onPickVessel={v => setSelectedVesselId(v?.mmsi ?? null)}
            flyTo={flyTo}
          />
          <LayerControl conflict={conflict} layers={layers} onChange={handleLayerToggle} />
          {selectedAc && (
            <AircraftPopup ac={selectedAc} onClose={() => setSelectedAircraftId(null)} />
          )}
          {selectedVs && !selectedAc && (
            <VesselPopup v={selectedVs} onClose={() => setSelectedVesselId(null)} />
          )}
        </div>

        <PosturePanel
          conflict={conflict}
          aircraft={aircraft}
          vessels={vessels}
          incidents={incidents}
          incidentStatus={incStatus}
          onFlyTo={(lat, lon) => setFlyTo({ lat, lon })}
          sitrep={sitrep}
          sitrepLoading={sitrepLoading}
          sitrepPending={sitrepPending}
          convergenceAlerts={convergenceAlerts}
          surgeAlerts={surgeAlerts}
          strikePackage={strikePackage}
        />
      </div>

      {/* ── Status bar ──────────────────────────────────────── */}
      <DataFreshness />
    </div>
  )
}
