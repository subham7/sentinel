'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useMobile } from '@/hooks/useMobile'
import dynamic from 'next/dynamic'
import { getConflict } from '@sentinel/shared'
import type { ConflictConfig, Aircraft, Vessel, Incident } from '@sentinel/shared'
import type { LayerState, HeatmapWindow } from '@/components/map/TheaterMap'
import { yesterdayUTC } from '@/components/map/layers/SatelliteLayer'
import DataFreshness from '@/components/panels/DataFreshness'
import HormuzWidget from '@/components/panels/HormuzWidget'
import OilPriceWidget from '@/components/panels/OilPriceWidget'
import RialWidget from '@/components/panels/RialWidget'
import IncidentFeed, { type FeedSize } from '@/components/panels/IncidentFeed'
import SitrepPanel from '@/components/panels/SitrepPanel'
import AnalystChat from '@/components/panels/AnalystChat'
import MediaFeed from '@/components/panels/MediaFeed'
import MorningBriefPanel from '@/components/panels/MorningBriefPanel'
import AnomalyBanner from '@/components/panels/AnomalyBanner'
import RhetoricGauge from '@/components/panels/RhetoricGauge'
import EntityGraph from '@/components/panels/EntityGraph'
import LayerControl from '@/components/map/LayerControl'
import CommandPalette from '@/components/CommandPalette'
import { useAircraftWebSocket } from '@/hooks/useAircraftWebSocket'
import { useVesselWebSocket } from '@/hooks/useVesselWebSocket'
import { useIncidentSSE } from '@/hooks/useIncidentSSE'
import { useNuclearStatus } from '@/hooks/useNuclearStatus'
import { useSitrepReport } from '@/hooks/useSitrepReport'
import { useEconomicData } from '@/hooks/useEconomicData'
import { detectConvergence } from '@/services/signal-aggregator'
import type { ConvergenceAlert } from '@/services/signal-aggregator'
import { detectSurge, detectStrikePackage } from '@/services/military-surge'
import type { SurgeAlert } from '@/services/military-surge'
import { detectAnomalies } from '@/services/anomaly.service'
import type { AnomalyAlert } from '@/services/anomaly.service'
import { useMorningBrief } from '@/hooks/useMorningBrief'
import { useEntityGraph } from '@/hooks/useEntityGraph'
import { useRhetoric } from '@/hooks/useRhetoric'
import { useIncidentTrend } from '@/hooks/useIncidentTrend'

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

const SEV_COLORS: Record<number, string> = {
  1: '#22c55e', 2: '#84cc16', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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

// ── Incident detail popup ─────────────────────────────────────────────────────

const SEV_LABELS: Record<number, string> = { 1: 'INFO', 2: 'LOW', 3: 'MED', 4: 'HIGH', 5: 'CRIT' }

function IncidentPopup({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const sevColor = SEV_COLORS[incident.severity] ?? '#94a3b8'
  const ts = incident.timestamp.slice(0, 16).replace('T', ' ') + 'Z'
  return (
    <div style={{
      position: 'absolute', top: 60, right: 16, zIndex: 20,
      background: 'var(--bg-elevated)', borderRadius: 4, padding: '12px 14px',
      minWidth: 260, maxWidth: 320,
      border: `1px solid ${sevColor}44`,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 8, color: sevColor, letterSpacing: '0.14em', textTransform: 'uppercase',
            background: `${sevColor}18`, border: `1px solid ${sevColor}44`,
            padding: '1px 5px', borderRadius: 2,
          }}>
            {SEV_LABELS[incident.severity] ?? 'UNK'}
          </span>
          <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {incident.source}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}
        >✕</button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 8 }}>
        {incident.title}
      </div>

      {incident.summary && (
        <div style={{
          fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6,
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginBottom: 6,
        }}>
          {incident.summary}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>{incident.location_name || `${incident.lat?.toFixed(2)}°, ${incident.lon?.toFixed(2)}°`}</span>
        <span>{ts}</span>
      </div>
    </div>
  )
}

// ── Surge / convergence severity color ────────────────────────────────────────

const SURGE_COLORS: Record<string, string> = {
  elevated: '#eab308', high: '#f97316', critical: '#ef4444',
}

// ── Right sidebar: posture + nuclear watch ────────────────────────────────────

function PosturePanel({
  conflict, aircraft, vessels, economic, isMobile, visible,
}: {
  conflict: ConflictConfig
  aircraft: Aircraft[]
  vessels: Vessel[]
  economic: ReturnType<typeof useEconomicData>
  isMobile: boolean
  visible: boolean
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
      width: isMobile ? '100%' : 260,
      flex: isMobile ? '1 1 0' : undefined,
      flexShrink: 0,
      display: visible ? 'flex' : 'none',
      flexDirection: 'column', overflowY: 'auto',
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
    }}>
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

      {/* Oil price widget (us-iran only) */}
      {conflict.slug === 'us-iran' && (
        <OilPriceWidget data={economic.oil} pending={economic.oilPending} />
      )}

      {/* Rial rate widget (us-iran only) */}
      {conflict.slug === 'us-iran' && (
        <RialWidget data={economic.rial} pending={economic.rialPending} />
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

    </div>
  )
}

// ── Left intel panel: tracks + convergence/surge + sitrep + chat + feed ──────

type IntelTab = 'intel' | 'brief' | 'media'

function LeftIntelPanel({
  conflict, aircraft, vessels, incidents, incidentStatus,
  selectedAircraftId, selectedVesselId, onSelectAircraft, onSelectVessel, onFlyTo,
  sitrep, sitrepLoading, sitrepPending,
  convergenceAlerts, surgeAlerts, strikePackage, anomalyAlerts,
  slug, isMobile, visible, feedSize, onFeedSizeChange,
  morningBrief, briefPending, briefLoading,
  entityGraph, graphPending, graphLoading,
  rhetoric, rhetoricPending, rhetoricLoading,
}: {
  conflict: ConflictConfig
  aircraft: Aircraft[]
  vessels: Vessel[]
  incidents: Incident[]
  incidentStatus: 'connecting' | 'connected' | 'error'
  selectedAircraftId: string | null
  selectedVesselId: string | null
  onSelectAircraft: (id: string | null) => void
  onSelectVessel: (id: string | null) => void
  onFlyTo: (lat: number, lon: number) => void
  sitrep: import('@sentinel/shared').SitrepReport | null
  sitrepLoading: boolean
  sitrepPending: boolean
  convergenceAlerts: ConvergenceAlert[]
  surgeAlerts: SurgeAlert[]
  strikePackage: boolean
  anomalyAlerts: AnomalyAlert[]
  slug: string
  isMobile: boolean
  visible: boolean
  feedSize: FeedSize
  onFeedSizeChange: (s: FeedSize) => void
  morningBrief: import('@sentinel/shared').MorningBrief | null
  briefPending: boolean
  briefLoading: boolean
  entityGraph: import('@sentinel/shared').EntityGraph | null
  graphPending: boolean
  graphLoading: boolean
  rhetoric: import('@sentinel/shared').RhetoricScore | null
  rhetoricPending: boolean
  rhetoricLoading: boolean
}) {
  const [intelTab, setIntelTab] = useState<IntelTab>('intel')

  // Feed flex dimensions per size
  const feedFlex = feedSize === 'expanded' ? '1 1 0' : feedSize === 'normal' ? '0 0 300px' : '0 0 40px'

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '4px 0', textAlign: 'center',
    fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    background: active ? 'var(--bg-overlay)' : 'transparent',
    border: 'none', borderBottom: active ? '1px solid #00b0ff' : '1px solid transparent',
    cursor: 'pointer', fontFamily: "'Share Tech Mono', monospace",
  })

  return (
    <div style={{
      width: isMobile ? '100%' : 300,
      flex: isMobile ? '1 1 0' : undefined,
      flexShrink: 0,
      display: visible ? 'flex' : 'none',
      flexDirection: 'column', overflow: 'hidden',
      background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
    }}>
      {/* Track list — capped height so intel panels always get space */}
      <div style={{
        flexShrink: 0, maxHeight: 200,
        display: 'flex', flexDirection: 'column',
        borderBottom: '1px solid var(--border)',
      }}>
        <TrackList
          conflict={conflict}
          aircraft={aircraft}
          vessels={vessels}
          selectedAircraftId={selectedAircraftId}
          selectedVesselId={selectedVesselId}
          onSelectAircraft={onSelectAircraft}
          onSelectVessel={onSelectVessel}
        />
      </div>

      {/* Intelligence tab switcher */}
      {feedSize !== 'expanded' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button style={tabStyle(intelTab === 'intel')} onClick={() => setIntelTab('intel')}>
            ◈ Intel
          </button>
          <button style={tabStyle(intelTab === 'brief')} onClick={() => setIntelTab('brief')}>
            ◈ Brief
          </button>
          <button style={tabStyle(intelTab === 'media')} onClick={() => setIntelTab('media')}>
            ◉ Media
          </button>
        </div>
      )}

      {/* Intelligence sections: hidden when feed is expanded */}
      {feedSize !== 'expanded' && (
        <div style={{
          flex: '1 1 0', minHeight: 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* ── INTEL tab ─────────────────────────────────────── */}
          {intelTab === 'intel' && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Anomaly banner (above everything) */}
              {anomalyAlerts.length > 0 && (
                <AnomalyBanner alerts={anomalyAlerts} slug={slug} />
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
                        {alert.signals.map(s => s.toUpperCase().slice(0, 2)).join('+')} ×{alert.entityCount}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Surge / strike package */}
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

              {/* Rhetoric gauge */}
              <RhetoricGauge data={rhetoric} pending={rhetoricPending} loading={rhetoricLoading} />

              {/* SITREP */}
              <SitrepPanel report={sitrep} loading={sitrepLoading} pending={sitrepPending} />

              {/* Analyst Chat */}
              <AnalystChat slug={slug} />
            </div>
          )}

          {/* ── BRIEF tab ─────────────────────────────────────── */}
          {intelTab === 'brief' && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <MorningBriefPanel brief={morningBrief} pending={briefPending} loading={briefLoading} />
              <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <EntityGraph graph={entityGraph} pending={graphPending} loading={graphLoading} slug={slug} />
              </div>
            </div>
          )}

          {/* ── MEDIA tab ─────────────────────────────────────── */}
          {intelTab === 'media' && (
            <MediaFeed slug={slug} />
          )}
        </div>
      )}

      {/* Incident feed — three states: collapsed / normal / expanded */}
      <div style={{
        flex: feedFlex,
        display: 'flex', flexDirection: 'column', minHeight: 0,
        transition: 'flex 0.15s ease',
      }}>
        <IncidentFeed
          incidents={incidents}
          onFlyTo={onFlyTo}
          status={incidentStatus}
          size={feedSize}
          onChangeSize={onFeedSizeChange}
        />
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
    aircraft:              true,
    vessels:               true,
    incidents:             true,
    heatmap:               false,
    bases:                 true,
    nuclear:               true,
    sam:                   true,
    shippingLanes:         true,
    chokepoints:           true,
    strikeRanges:          false,
    countries:             true,
    satellite_truecolor:   false,
    satellite_nightlights: false,
    satellite_thermal:     false,
    frontlines:            false,
    adiz:                  false,
    maritime:              false,
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
  const [selectedIncident,   setSelectedIncident]   = useState<Incident | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number } | null>(null)
  const [feedSize, setFeedSize] = useState<FeedSize>('normal')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [satDate,       setSatDate]       = useState<string>(yesterdayUTC)
  const [satOpacity,    setSatOpacity]    = useState<number>(0.85)
  const [heatmapWindow, setHeatmapWindow] = useState<HeatmapWindow>('24h')
  const [extendedIncidents, setExtendedIncidents] = useState<Incident[]>([])

  type MobileTab = 'map' | 'intel' | 'posture'
  const isMobile = useMobile()
  const [mobileTab, setMobileTab] = useState<MobileTab>('map')

  // Extended incidents for longer heatmap windows (7d / 30d)
  useEffect(() => {
    if (!layers.heatmap || heatmapWindow === '24h') {
      setExtendedIncidents([])
      return
    }
    const hours = heatmapWindow === '7d' ? 168 : 720
    let cancelled = false
    fetch(`/api/conflicts/${slug}/incidents?hours=${hours}&limit=2000`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Incident[]) => { if (!cancelled) setExtendedIncidents(data) })
      .catch(() => { /* fallback: SSE incidents used */ })
    return () => { cancelled = true }
  }, [slug, layers.heatmap, heatmapWindow])

  const { aircraft }                     = useAircraftWebSocket(slug)
  const { vessels }                      = useVesselWebSocket(slug)
  const { incidents, status: incStatus } = useIncidentSSE(slug)
  const nuclearStatuses                  = useNuclearStatus(slug)
  const { report: sitrep, loading: sitrepLoading, pending: sitrepPending } = useSitrepReport(slug)
  const economic = useEconomicData()

  // Phase 8C
  const { brief: morningBrief, pending: briefPending, loading: briefLoading } = useMorningBrief(slug)
  const { graph: entityGraph,  pending: graphPending, loading: graphLoading } = useEntityGraph(slug)
  const { data: rhetoric, pending: rhetoricPending, loading: rhetoricLoading } = useRhetoric(slug)
  const trend = useIncidentTrend(slug, 30)

  const convergenceAlerts = useMemo(
    () => detectConvergence(aircraft, vessels, incidents),
    [aircraft, vessels, incidents],
  )
  const surgeAlerts = useMemo(
    () => detectSurge(slug, aircraft, vessels),
    [slug, aircraft, vessels],
  )
  const strikePackage = useMemo(() => detectStrikePackage(aircraft), [aircraft])
  const anomalyAlerts = useMemo(
    () => detectAnomalies(slug, trend, incidents.length),
    [slug, trend, incidents.length],
  )

  const selectedAc = selectedAircraftId ? aircraft.find(a => a.icao24 === selectedAircraftId) ?? null : null
  const selectedVs = selectedVesselId   ? vessels.find(v => v.mmsi === selectedVesselId)      ?? null : null

  // Global keyboard shortcuts
  useEffect(() => {
    if (!conflict) return
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'f' || e.key === 'F') {
        setFeedSize(s => s === 'collapsed' ? 'normal' : 'collapsed')
        return
      }
      if (e.key === 'Escape') {
        if (paletteOpen) { setPaletteOpen(false); return }
        setSelectedAircraftId(null)
        setSelectedVesselId(null)
        setSelectedIncident(null)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [conflict, paletteOpen])

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
        display: 'flex', height: '100vh',
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
      height: '100vh',
      background: 'var(--bg-base)', overflow: 'hidden',
    }}>
      {/* ── Theater header ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', height: isMobile ? 44 : 52,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, gap: 8,
      }}>
        {/* Left: back + conflict name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16, minWidth: 0 }}>
          <a
            href="/conflicts"
            style={{
              fontSize: 10, color: 'var(--text-muted)',
              fontFamily: "'Share Tech Mono', monospace",
              letterSpacing: '0.1em', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            ←{isMobile ? '' : ' CONFLICTS'}
          </a>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div style={{
            fontFamily: "'Orbitron', monospace", fontSize: isMobile ? 13 : 18, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '0.06em', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {conflict.name}
          </div>
          {!isMobile && (
            <span style={{
              fontSize: 10, color: 'var(--text-secondary)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {conflict.shortName}
            </span>
          )}
        </div>

        {/* Center: parties (desktop only) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {conflict.parties.map(p => (
              <div key={p.shortCode} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 16 }}>{p.flagEmoji}</span>
                <span style={{ fontSize: 10, color: p.color, letterSpacing: '0.08em' }}>{p.shortCode}</span>
              </div>
            ))}
          </div>
        )}

        {/* Right: counts + intensity + clock + live */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16, flexShrink: 0 }}>
          {!isMobile && aircraft.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>AC</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: '#00b0ff' }}>
                {aircraft.length}
              </span>
            </div>
          )}
          {!isMobile && vessels.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>VS</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: '#22c55e' }}>
                {vessels.length}
              </span>
            </div>
          )}
          {!isMobile && incidents.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>EVT</span>
              <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: '#eab308' }}>
                {incidents.length}
              </span>
            </div>
          )}

          <span style={{
            padding: '2px 6px',
            background: `${intensityColor}20`,
            border: `1px solid ${intensityColor}55`,
            borderRadius: 2,
            fontSize: 9, color: intensityColor,
            fontFamily: "'Share Tech Mono', monospace",
            letterSpacing: '0.1em', textTransform: 'uppercase',
            animation: conflict.intensity === 'critical' ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
          }}>
            {conflict.intensity.toUpperCase()}
          </span>

          {!isMobile && (
            <>
              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
              <ZuluClock />
              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#22c55e', display: 'inline-block',
              animation: 'pulse-opacity 2s ease-in-out infinite',
            }} />
            {!isMobile && (
              <span style={{
                fontSize: 10, color: '#22c55e',
                fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.12em',
              }}>
                LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <LeftIntelPanel
          conflict={conflict}
          aircraft={aircraft}
          vessels={vessels}
          incidents={incidents}
          incidentStatus={incStatus}
          selectedAircraftId={selectedAircraftId}
          selectedVesselId={selectedVesselId}
          onSelectAircraft={setSelectedAircraftId}
          onSelectVessel={setSelectedVesselId}
          onFlyTo={(lat, lon) => { setFlyTo({ lat, lon }); if (isMobile) setMobileTab('map') }}
          sitrep={sitrep}
          sitrepLoading={sitrepLoading}
          sitrepPending={sitrepPending}
          convergenceAlerts={convergenceAlerts}
          surgeAlerts={surgeAlerts}
          strikePackage={strikePackage}
          anomalyAlerts={anomalyAlerts}
          slug={slug}
          isMobile={isMobile}
          visible={!isMobile || mobileTab === 'intel'}
          feedSize={feedSize}
          onFeedSizeChange={setFeedSize}
          morningBrief={morningBrief}
          briefPending={briefPending}
          briefLoading={briefLoading}
          entityGraph={entityGraph}
          graphPending={graphPending}
          graphLoading={graphLoading}
          rhetoric={rhetoric}
          rhetoricPending={rhetoricPending}
          rhetoricLoading={rhetoricLoading}
        />

        {/* Map area */}
        <div style={{
          display: (!isMobile || mobileTab === 'map') ? 'flex' : 'none',
          flex: 1, position: 'relative', overflow: 'hidden',
        }}>
          <TheaterMap
            conflict={conflict}
            layers={layers}
            aircraft={aircraft}
            vessels={vessels}
            incidents={incidents}
            {...(extendedIncidents.length > 0 ? { heatmapIncidents: extendedIncidents } : {})}
            nuclearStatuses={nuclearStatuses}
            selectedId={selectedAircraftId}
            onPickAircraft={ac => setSelectedAircraftId(ac?.icao24 ?? null)}
            onPickVessel={v => setSelectedVesselId(v?.mmsi ?? null)}
            onPickIncident={inc => setSelectedIncident(inc)}
            flyTo={flyTo}
            satDate={satDate}
            satOpacity={satOpacity}
          />
          <LayerControl
            conflict={conflict}
            layers={layers}
            onChange={handleLayerToggle}
            satDate={satDate}
            onSatDateChange={setSatDate}
            satOpacity={satOpacity}
            onSatOpacityChange={setSatOpacity}
            heatmapWindow={heatmapWindow}
            onHeatmapWindow={setHeatmapWindow}
          />
          {selectedAc && (
            <AircraftPopup ac={selectedAc} onClose={() => setSelectedAircraftId(null)} />
          )}
          {selectedVs && !selectedAc && (
            <VesselPopup v={selectedVs} onClose={() => setSelectedVesselId(null)} />
          )}
          {selectedIncident && !selectedAc && !selectedVs && (
            <IncidentPopup incident={selectedIncident} onClose={() => setSelectedIncident(null)} />
          )}

          {/* Keyboard shortcuts legend */}
          {!isMobile && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12, zIndex: 10,
              background: 'var(--bg-elevated)',
              borderRadius: 4, padding: '6px 10px',
              fontFamily: "'Share Tech Mono', monospace",
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{
                fontSize: 7, color: 'var(--text-muted)', letterSpacing: '0.14em',
                textTransform: 'uppercase', marginBottom: 2,
              }}>
                Shortcuts
              </div>
              {([
                { key: 'L',   desc: 'Layers'  },
                { key: 'F',   desc: 'Feed'    },
                { key: '⌘K',  desc: 'Search'  },
                { key: 'Esc', desc: 'Clear'   },
              ] as const).map(({ key, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 8, color: 'var(--text-primary)',
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 2, padding: '1px 5px',
                    minWidth: 22, textAlign: 'center', letterSpacing: '0.04em',
                  }}>
                    {key}
                  </span>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <PosturePanel
          conflict={conflict}
          aircraft={aircraft}
          vessels={vessels}
          economic={economic}
          isMobile={isMobile}
          visible={!isMobile || mobileTab === 'posture'}
        />
      </div>

      {/* ── Mobile bottom tab bar ────────────────────────────── */}
      {isMobile && (
        <div style={{
          display: 'flex', flexShrink: 0,
          background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        }}>
          {([
            { id: 'map',     label: '◉ MAP',     count: null },
            { id: 'intel',   label: '≡ INTEL',   count: incidents.length || null },
            { id: 'posture', label: '⊞ POSTURE', count: null },
          ] as const).map(tab => {
            const active = mobileTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                style={{
                  flex: 1, padding: '10px 0', position: 'relative',
                  background: active ? 'var(--bg-overlay)' : 'transparent',
                  color: active ? '#00b0ff' : 'var(--text-muted)',
                  border: 'none',
                  borderTop: `2px solid ${active ? '#00b0ff' : 'transparent'}`,
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
              >
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: '22%',
                    background: '#ef4444', color: '#fff',
                    fontSize: 8, fontFamily: "'Share Tech Mono', monospace",
                    borderRadius: 2, padding: '1px 3px', lineHeight: 1,
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────────── */}
      <DataFreshness />

      {/* ── Command palette ──────────────────────────────────── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conflict={conflict}
        layers={layers}
        onToggleLayer={(k) => handleLayerToggle(k, !layers[k])}
        aircraft={aircraft}
        incidents={incidents}
      />
    </div>
  )
}
