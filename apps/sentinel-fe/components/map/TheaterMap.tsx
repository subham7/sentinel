'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circle as turfCircle } from '@turf/turf'
import type { ConflictConfig, Aircraft, Vessel, Incident, MilitaryBase } from '@sentinel/shared'

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'

// Build party → color map from conflict config (config-driven, no hardcoding)
function buildPartyColorMap(conflict: ConflictConfig): Record<string, string> {
  const base: Record<string, string> = {
    ALLIED: '#f59e0b', NATO: '#a855f7', UNKNOWN: '#94a3b8',
  }
  for (const p of conflict.parties) base[p.shortCode] = p.color
  return base
}

const NUCLEAR_STATUS_COLORS: Record<string, string> = {
  active:      '#ef4444',
  suspected:   '#f97316',
  modified:    '#eab308',
  operational: '#22c55e',
  shutdown:    '#94a3b8',
}

export interface LayerState {
  aircraft:      boolean
  vessels:       boolean
  incidents:     boolean
  heatmap:       boolean
  bases:         boolean
  nuclear:       boolean
  sam:           boolean
  shippingLanes: boolean
  chokepoints:   boolean
  strikeRanges:  boolean
  countries:     boolean
}

// ── Natural Earth 110m country GeoJSON (module-level cache) ───────────────────

const NE_110M_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson'
let neCache: GeoJSON.FeatureCollection | null = null
let neFetchPromise: Promise<GeoJSON.FeatureCollection> | null = null

function fetchNECountries(): Promise<GeoJSON.FeatureCollection> {
  if (neCache) return Promise.resolve(neCache)
  if (!neFetchPromise) {
    neFetchPromise = fetch(NE_110M_URL)
      .then(r => r.json() as Promise<GeoJSON.FeatureCollection>)
      .then(data => { neCache = data; return data })
  }
  return neFetchPromise
}

const SEV_COLORS: Record<number, string> = {
  1: '#22c55e', 2: '#84cc16', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
}

interface Props {
  conflict:         ConflictConfig
  layers:           LayerState
  aircraft:         Aircraft[]
  vessels:          Vessel[]
  incidents:        Incident[]
  nuclearStatuses?: Map<string, string>   // siteId → overridden status from IAEA
  selectedId?:      string | null
  onPickAircraft?:  (ac: Aircraft | null) => void
  onPickVessel?:    (v: Vessel | null) => void
  onPickIncident?:  (inc: Incident | null) => void
  flyTo?:           { lat: number; lon: number; zoom?: number } | null
}

// ── Aircraft icon (SDF — tintable via icon-color) ─────────────────────────────

function createAircraftSDF(size = 28): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx  = size / 2

  ctx.fillStyle = 'white'

  // Fuselage — thin ellipse pointing north
  ctx.beginPath()
  ctx.ellipse(cx, cx, 2.2, size * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()

  // Main wings — swept-back triangle centered at 42% down
  ctx.beginPath()
  ctx.moveTo(cx,           size * 0.30)  // root leading edge
  ctx.lineTo(cx - size * 0.46, size * 0.52)  // left wingtip
  ctx.lineTo(cx - size * 0.20, size * 0.56)  // left trailing
  ctx.lineTo(cx,           size * 0.50)  // center trailing
  ctx.lineTo(cx + size * 0.20, size * 0.56)  // right trailing
  ctx.lineTo(cx + size * 0.46, size * 0.52)  // right wingtip
  ctx.closePath()
  ctx.fill()

  // Horizontal stabilisers near the tail
  ctx.beginPath()
  ctx.moveTo(cx,           size * 0.72)
  ctx.lineTo(cx - size * 0.22, size * 0.84)
  ctx.lineTo(cx - size * 0.10, size * 0.87)
  ctx.lineTo(cx,           size * 0.80)
  ctx.lineTo(cx + size * 0.10, size * 0.87)
  ctx.lineTo(cx + size * 0.22, size * 0.84)
  ctx.closePath()
  ctx.fill()

  return ctx.getImageData(0, 0, size, size)
}

// ── Vessel icon (SDF — top-down ship silhouette) ───────────────────────────────

function createVesselSDF(size = 32): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx  = size / 2

  ctx.fillStyle = 'white'

  // Hull — sharp bow tip, curved sides widening toward mid-ship, flat stern
  ctx.beginPath()
  ctx.moveTo(cx, size * 0.03)                                    // bow tip
  ctx.quadraticCurveTo(cx + size * 0.40, size * 0.38,            // starboard curve (max beam ~38%)
                       cx + size * 0.18, size * 0.91)            // starboard stern corner
  ctx.lineTo(cx - size * 0.18, size * 0.91)                      // stern flat
  ctx.quadraticCurveTo(cx - size * 0.40, size * 0.38,            // port curve
                       cx, size * 0.03)                          // back to bow
  ctx.closePath()
  ctx.fill()

  return ctx.getImageData(0, 0, size, size)
}

// ── Build GeoJSON from aircraft array ─────────────────────────────────────────

function buildAircraftGeoJSON(aircraft: Aircraft[], colorMap: Record<string, string>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: aircraft.map(ac => ({
      type: 'Feature',
      id: ac.icao24,
      geometry: { type: 'Point', coordinates: [ac.lon, ac.lat] },
      properties: {
        icao24:   ac.icao24,
        callsign: ac.callsign,
        side:     ac.side,
        type:     ac.type,
        mil:      ac.mil,
        altitude: ac.altitude,
        speed:    ac.speed,
        heading:  ac.heading,
        color:    colorMap[ac.side] ?? '#94a3b8',
      },
    })),
  }
}

function buildTrailGeoJSON(aircraft: Aircraft[], colorMap: Record<string, string>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: aircraft
      .filter(ac => ac.trail.length > 1)
      .map(ac => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: ac.trail },
        properties: { color: colorMap[ac.side] ?? '#94a3b8' },
      })),
  }
}

// ── Vessel GeoJSON builder ────────────────────────────────────────────────────

const VESSEL_TYPE_LABELS: Record<string, string> = {
  warship: '⚓', tanker: '🛢', cargo: '📦', fast_boat: '⚡', submarine: '◎', unknown: '◇',
}

function buildVesselGeoJSON(vessels: Vessel[], colorMap: Record<string, string>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vessels.map(v => ({
      type: 'Feature',
      id: v.mmsi,
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      properties: {
        mmsi:      v.mmsi,
        name:      v.name,
        side:      v.side,
        type:      v.type,
        ais_dark:  v.ais_dark,
        sanctioned: v.sanctioned,
        heading:   v.heading,
        speed:     v.speed,
        color:     v.ais_dark ? '#94a3b8' : (colorMap[v.side] ?? '#94a3b8'),
      },
    })),
  }
}

// ── Incident GeoJSON builder ──────────────────────────────────────────────────

function buildIncidentGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const nowMs = Date.now()
  return {
    type: 'FeatureCollection',
    features: incidents
      .filter(i => i.lat && i.lon)
      .map(i => ({
        type: 'Feature',
        id:   i.id,
        geometry: { type: 'Point', coordinates: [i.lon, i.lat] },
        properties: {
          id:            i.id,
          title:         i.title,
          category:      i.category,
          severity:      i.severity,
          source:        i.source,
          timestamp:     i.timestamp,
          summary:       i.summary ?? '',
          location_name: i.location_name ?? '',
          age_hours:     Math.min(24, (nowMs - new Date(i.timestamp).getTime()) / 3_600_000),
          sev_color:     SEV_COLORS[i.severity] ?? '#94a3b8',
          is_critical:   i.severity >= 4 ? 1 : 0,
        },
      })),
  }
}

// ── Strike range ring helpers ─────────────────────────────────────────────────

const STRIKE_RING_COLORS = ['#00b0ff22', '#00b0ff18', '#00b0ff10']
const STRIKE_RING_LINES  = ['#00b0ff60', '#00b0ff40', '#00b0ff28']

function addStrikeRings(map: maplibregl.Map, base: MilitaryBase, partyColor: string): void {
  if (!base.strikeRanges?.length) return
  const alpha = partyColor + '22'
  const line  = partyColor + '55'
  const features = base.strikeRanges.map(r =>
    turfCircle([base.lon, base.lat], r.rangeKm, { steps: 64, units: 'kilometers', properties: { type: r.type, rangeKm: r.rangeKm } }),
  )
  const sourceId = `strike-${base.id}`
  if (map.getSource(sourceId)) return

  map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features } })
  map.addLayer({
    id: `${sourceId}-fill`, type: 'fill', source: sourceId,
    paint: { 'fill-color': alpha, 'fill-opacity': 1 },
  })
  map.addLayer({
    id: `${sourceId}-line`, type: 'line', source: sourceId,
    paint: { 'line-color': line, 'line-width': 1, 'line-dasharray': [4, 3] },
  })
  map.addLayer({
    id: `${sourceId}-label`, type: 'symbol', source: sourceId, minzoom: 5,
    layout: {
      'text-field':   ['concat', ['get', 'type'], '  ', ['get', 'rangeKm'], ' km'],
      'text-font':    ['Noto Sans Regular'],
      'text-size':    9,
      'text-offset':  [0, -0.6],
      'text-anchor':  'bottom',
      'symbol-placement': 'line',
    },
    paint: { 'text-color': line, 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1 },
  })
}

function removeStrikeRings(map: maplibregl.Map, base: MilitaryBase): void {
  const sourceId = `strike-${base.id}`
  if (map.getLayer(`${sourceId}-label`)) map.removeLayer(`${sourceId}-label`)
  if (map.getLayer(`${sourceId}-line`))  map.removeLayer(`${sourceId}-line`)
  if (map.getLayer(`${sourceId}-fill`))  map.removeLayer(`${sourceId}-fill`)
  if (map.getSource(sourceId))           map.removeSource(sourceId)
}

// ── Shipping lane animation ───────────────────────────────────────────────────

// Pre-computed dash sequences to simulate lane movement
const DASH_SEQUENCES = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
  [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5],
  [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function TheaterMap({
  conflict,
  layers,
  aircraft,
  vessels,
  incidents,
  nuclearStatuses,
  selectedId    = null,
  onPickAircraft,
  onPickVessel,
  onPickIncident,
  flyTo,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const markersRef   = useRef<{
    bases:       maplibregl.Marker[]
    nuclear:     maplibregl.Marker[]
    chokepoints: maplibregl.Marker[]
  }>({ bases: [], nuclear: [], chokepoints: [] })
  const layersRef    = useRef<LayerState>(layers)
  const mountedRef   = useRef(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  // Keep refs to the latest data for use inside map event handlers
  const aircraftRef   = useRef<Aircraft[]>(aircraft)
  const vesselsRef    = useRef<Vessel[]>(vessels)
  const incidentsRef  = useRef<Incident[]>(incidents)
  const selectedRef   = useRef<string | null>(selectedId)
  // Shipping lane animation frame
  const laneAnimRef       = useRef<number>(0)
  const partyColorMapRef  = useRef<Record<string, string>>(buildPartyColorMap(conflict))

  layersRef.current       = layers
  aircraftRef.current     = aircraft
  vesselsRef.current      = vessels
  incidentsRef.current    = incidents
  selectedRef.current     = selectedId
  partyColorMapRef.current = buildPartyColorMap(conflict)

  const applyMarkerVisibility = useCallback((map: maplibregl.Map, ls: LayerState) => {
    markersRef.current.bases.forEach(m => ls.bases ? m.addTo(map) : m.remove())
    markersRef.current.nuclear.forEach(m => ls.nuclear ? m.addTo(map) : m.remove())
    markersRef.current.chokepoints.forEach(m => ls.chokepoints ? m.addTo(map) : m.remove())
  }, [])

  const applySamVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    const vis = visible ? 'visible' : 'none'
    if (map.getLayer('sam-fill')) map.setLayoutProperty('sam-fill', 'visibility', vis)
    if (map.getLayer('sam-line')) map.setLayoutProperty('sam-line', 'visibility', vis)
  }, [])

  const applyAircraftVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    const vis = visible ? 'visible' : 'none'
    if (map.getLayer('aircraft-trails'))   map.setLayoutProperty('aircraft-trails',   'visibility', vis)
    if (map.getLayer('aircraft-selected')) map.setLayoutProperty('aircraft-selected', 'visibility', vis)
    if (map.getLayer('aircraft'))          map.setLayoutProperty('aircraft',          'visibility', vis)
  }, [])

  const applyVesselVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    const vis = visible ? 'visible' : 'none'
    if (map.getLayer('vessels')) map.setLayoutProperty('vessels', 'visibility', vis)
  }, [])

  const applyIncidentVisibility = useCallback((map: maplibregl.Map, incVis: boolean, heatVis: boolean) => {
    const iv = incVis  ? 'visible' : 'none'
    const hv = heatVis ? 'visible' : 'none'
    if (map.getLayer('incidents-heatmap')) map.setLayoutProperty('incidents-heatmap', 'visibility', hv)
    if (map.getLayer('incidents-glow'))    map.setLayoutProperty('incidents-glow',    'visibility', iv)
    if (map.getLayer('incidents-circles')) map.setLayoutProperty('incidents-circles', 'visibility', iv)
    if (map.getLayer('incidents-labels'))  map.setLayoutProperty('incidents-labels',  'visibility', iv)
  }, [])

  const applyShippingLaneVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    const vis = visible ? 'visible' : 'none'
    if (map.getLayer('shipping-lanes'))      map.setLayoutProperty('shipping-lanes',      'visibility', vis)
    if (map.getLayer('shipping-lanes-glow')) map.setLayoutProperty('shipping-lanes-glow', 'visibility', vis)
  }, [])

  const applyCountriesVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    const vis = visible ? 'visible' : 'none'
    if (map.getLayer('country-highlights-fill'))    map.setLayoutProperty('country-highlights-fill',    'visibility', vis)
    if (map.getLayer('country-highlights-outline')) map.setLayoutProperty('country-highlights-outline', 'visibility', vis)
  }, [])

  // ── Mount map ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return
    mountedRef.current = true

    const [lon, lat] = conflict.map.center
    const map = new maplibregl.Map({
      container:          containerRef.current,
      style:              CARTO_DARK,
      center:             [lon, lat],
      zoom:               conflict.map.zoom,
      attributionControl: false,
      antialias:          true,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      // ── Aircraft SDF icon (white → tinted per-feature) ────────
      map.addImage('aircraft-sdf', createAircraftSDF(), { sdf: true })

      // ── Aircraft trails (lines) ───────────────────────────────
      map.addSource('aircraft-trails', {
        type: 'geojson',
        data: buildTrailGeoJSON(aircraftRef.current, partyColorMapRef.current),
      })
      map.addLayer({
        id:     'aircraft-trails',
        type:   'line',
        source: 'aircraft-trails',
        layout: { visibility: layersRef.current.aircraft ? 'visible' : 'none' },
        paint: {
          'line-color':   ['get', 'color'],
          'line-opacity':  0.35,
          'line-width':    1.5,
        },
      })

      // ── Aircraft positions + labels (single symbol layer) ─────
      map.addSource('aircraft', {
        type:    'geojson',
        data:    buildAircraftGeoJSON(aircraftRef.current, partyColorMapRef.current),
        cluster: false,
      })
      map.addLayer({
        id:     'aircraft',
        type:   'symbol',
        source: 'aircraft',
        layout: {
          visibility:                   layersRef.current.aircraft ? 'visible' : 'none',
          'icon-image':                 'aircraft-sdf',
          'icon-size':                  ['case', ['boolean', ['get', 'mil'], false], 1.05, 0.78],
          'icon-rotate':                ['get', 'heading'],
          'icon-rotation-alignment':    'map',
          'icon-allow-overlap':         true,
          'icon-ignore-placement':      true,
          'text-field':                 ['get', 'callsign'],
          'text-font':                  ['Noto Sans Regular'],
          'text-size':                  9,
          'text-offset':                [0, 1.5],
          'text-anchor':                'top',
          'text-optional':              true,
          'text-allow-overlap':         false,
        },
        paint: {
          'icon-color':       ['get', 'color'],
          'icon-opacity':      0.95,
          'text-color':       ['get', 'color'],
          'text-halo-color':  'rgba(0,0,0,0.85)',
          'text-halo-width':   1,
        },
      })

      // ── Aircraft click handler ────────────────────────────────
      map.on('click', 'aircraft', (e) => {
        if (!e.features || !e.features[0]) return
        const props = e.features[0].properties as Record<string, unknown>
        const clicked = aircraftRef.current.find(a => a.icao24 === props.icao24)
        onPickAircraft?.(clicked ?? null)
      })
      map.on('mouseenter', 'aircraft', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'aircraft', () => {
        map.getCanvas().style.cursor = ''
      })

      // ── Selected aircraft ring (sits beneath the icon layer) ──
      map.addLayer({
        id:     'aircraft-selected',
        type:   'circle',
        source: 'aircraft',
        filter: ['==', ['get', 'icao24'], ''],   // matches nothing until selection
        layout: { visibility: layersRef.current.aircraft ? 'visible' : 'none' },
        paint: {
          'circle-radius':         16,
          'circle-color':          'transparent',
          'circle-opacity':         0,
          'circle-stroke-width':    2,
          'circle-stroke-color':   '#ffffff',
          'circle-stroke-opacity':  0.85,
        },
      }, 'aircraft')   // insert below aircraft symbol layer so icon renders on top

      // ── Vessel positions + labels (single symbol layer) ───────
      map.addImage('vessel-sdf', createVesselSDF(), { sdf: true })

      map.addSource('vessels', {
        type: 'geojson',
        data: buildVesselGeoJSON(vesselsRef.current, partyColorMapRef.current),
      })
      map.addLayer({
        id:     'vessels',
        type:   'symbol',
        source: 'vessels',
        layout: {
          visibility:              layersRef.current.vessels ? 'visible' : 'none',
          'icon-image':            'vessel-sdf',
          'icon-size':             ['case', ['==', ['get', 'type'], 'warship'], 1.1, 0.85],
          'icon-rotate':           ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap':    true,
          'icon-ignore-placement': true,
          'text-field':            ['get', 'name'],
          'text-font':             ['Noto Sans Regular'],
          'text-size':              9,
          'text-offset':           [0, 1.5],
          'text-anchor':           'top',
          'text-optional':         true,
          'text-allow-overlap':    false,
        },
        paint: {
          'icon-color': [
            'case',
            ['boolean', ['get', 'ais_dark'], false], '#475569',
            ['get', 'color'],
          ],
          'icon-opacity':     0.95,
          'text-color':       ['get', 'color'],
          'text-halo-color':  'rgba(0,0,0,0.85)',
          'text-halo-width':   1,
        },
      })
      map.on('click', 'vessels', (e) => {
        if (!e.features || !e.features[0]) return
        const props = e.features[0].properties as Record<string, unknown>
        const clicked = vesselsRef.current.find(v => v.mmsi === props.mmsi)
        onPickVessel?.(clicked ?? null)
      })
      map.on('mouseenter', 'vessels', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'vessels', () => {
        map.getCanvas().style.cursor = ''
      })

      // ── SAM coverage rings ────────────────────────────────────
      const samSites = conflict.overlays.samSites ?? []
      if (samSites.length > 0) {
        const samFeatures = samSites.map(site =>
          turfCircle([site.lon, site.lat], site.range_km, {
            steps: 64, units: 'kilometers',
            properties: { name: site.name, system: site.system },
          }),
        )
        map.addSource('sam-rings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: samFeatures },
        })
        map.addLayer({
          id:     'sam-fill',
          type:   'fill',
          source: 'sam-rings',
          layout: { visibility: layersRef.current.sam ? 'visible' : 'none' },
          paint:  { 'fill-color': 'rgba(239, 68, 68, 0.08)', 'fill-opacity': 1 },
        })
        map.addLayer({
          id:     'sam-line',
          type:   'line',
          source: 'sam-rings',
          layout: { visibility: layersRef.current.sam ? 'visible' : 'none' },
          paint:  {
            'line-color':     'rgba(239, 68, 68, 0.4)',
            'line-width':      1,
            'line-dasharray': [4, 3],
          },
        })
      }

      // ── Military bases ────────────────────────────────────────
      const partyColorMap = buildPartyColorMap(conflict)
      const bases: maplibregl.Marker[] = []
      conflict.overlays.bases.forEach(base => {
        const color = partyColorMap[base.party] ?? '#94a3b8'
        const el    = document.createElement('div')
        el.className   = 's-base-marker'
        el.style.color = color
        el.title       = `${base.name} (${base.party})`

        const hasRanges = (base.strikeRanges?.length ?? 0) > 0
        const rangesHtml = hasRanges ? `
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08)">
            <div style="color:#94a3b8;font-size:8px;letter-spacing:0.12em;margin-bottom:4px">STRIKE RANGES</div>
            ${base.strikeRanges!.map(r => `
              <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:2px">
                <span style="color:#e2e8f0">${r.type}</span>
                <span style="color:${color}">${r.rangeKm} km</span>
              </div>
            `).join('')}
          </div>` : ''

        const popup = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 14, className: 'sentinel-popup',
        }).setHTML(`
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#e2e8f0;padding:8px;background:#111827;border:1px solid rgba(255,255,255,0.16);border-radius:4px;min-width:160px">
            <div style="color:${color};font-size:9px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">${base.type.toUpperCase()} BASE</div>
            <div style="font-weight:700;margin-bottom:4px">${base.name}</div>
            <div style="display:flex;justify-content:space-between;color:#94a3b8;font-size:10px">
              <span>PARTY</span><span style="color:${color}">${base.party}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#94a3b8;font-size:10px;margin-top:2px">
              <span>COUNTRY</span><span style="color:#e2e8f0">${base.country}</span>
            </div>
            ${rangesHtml}
          </div>
        `)

        el.addEventListener('mouseenter', () => {
          marker.setPopup(popup).togglePopup()
          if (layersRef.current.strikeRanges) addStrikeRings(map, base, color)
        })
        el.addEventListener('mouseleave', () => {
          if (popup.isOpen()) popup.remove()
          removeStrikeRings(map, base)
        })

        const marker = new maplibregl.Marker({ element: el }).setLngLat([base.lon, base.lat])
        if (layersRef.current.bases) marker.addTo(map)
        bases.push(marker)
      })
      markersRef.current.bases = bases

      // ── Nuclear sites ─────────────────────────────────────────
      const nuclear: maplibregl.Marker[] = []
      ;(conflict.overlays.nuclearSites ?? []).forEach(site => {
        const liveStatus = nuclearStatuses?.get(site.id) ?? site.status
        const color = NUCLEAR_STATUS_COLORS[liveStatus] ?? '#a855f7'
        const el    = document.createElement('div')
        el.className   = 's-nuclear-marker'
        el.style.color = '#a855f7'
        el.textContent = '☢'
        el.title       = `${site.name} — ${site.enrichment}`

        const popup = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 14,
        }).setHTML(`
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#e2e8f0;padding:8px;background:#111827;border:1px solid rgba(255,255,255,0.16);border-radius:4px;min-width:180px">
            <div style="color:#a855f7;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">☢ NUCLEAR SITE</div>
            <div style="font-weight:700;margin-bottom:6px">${site.name}</div>
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">
              <span style="color:#94a3b8">STATUS</span>
              <span style="color:${color};text-transform:uppercase;letter-spacing:0.08em">${liveStatus}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px">
              <span style="color:#94a3b8">ENRICHMENT</span>
              <span style="color:#e2e8f0">${site.enrichment}</span>
            </div>
            ${site.notes ? `<div style="color:#475569;font-size:9px;margin-top:6px">${site.notes}</div>` : ''}
          </div>
        `)

        el.addEventListener('mouseenter', () => marker.setPopup(popup).togglePopup())
        el.addEventListener('mouseleave', () => { if (popup.isOpen()) popup.remove() })

        const marker = new maplibregl.Marker({ element: el }).setLngLat([site.lon, site.lat])
        if (layersRef.current.nuclear) marker.addTo(map)
        nuclear.push(marker)
      })
      markersRef.current.nuclear = nuclear

      // ── Chokepoints ───────────────────────────────────────────
      const chokepoints: maplibregl.Marker[] = []
      ;(conflict.overlays.chokepoints ?? []).forEach(cp => {
        const el = document.createElement('div')
        el.className     = 's-chokepoint-wrap'
        el.style.color   = '#f97316'
        el.style.cssText += ';position:relative;width:12px;height:12px;cursor:pointer'

        const dot   = document.createElement('div'); dot.className = 's-chokepoint-dot'
        const ring1 = document.createElement('div'); ring1.className = 's-chokepoint-ring'
        const ring2 = document.createElement('div'); ring2.className = 's-chokepoint-ring s-chokepoint-ring2'
        el.appendChild(dot); el.appendChild(ring1); el.appendChild(ring2)

        const popup = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 14,
        }).setHTML(`
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#e2e8f0;padding:8px;background:#111827;border:1px solid rgba(255,255,255,0.16);border-radius:4px;min-width:160px">
            <div style="color:#f97316;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">◉ CHOKEPOINT</div>
            <div style="font-weight:700;margin-bottom:4px">${cp.name}</div>
            <div style="display:flex;justify-content:space-between;font-size:10px">
              <span style="color:#94a3b8">RADIUS</span>
              <span style="color:#e2e8f0">${cp.radius_km} km</span>
            </div>
          </div>
        `)

        el.addEventListener('mouseenter', () => marker.setPopup(popup).togglePopup())
        el.addEventListener('mouseleave', () => { if (popup.isOpen()) popup.remove() })

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([cp.lon, cp.lat])
        if (layersRef.current.chokepoints) marker.addTo(map)
        chokepoints.push(marker)
      })
      markersRef.current.chokepoints = chokepoints

      // ── Shipping lanes ────────────────────────────────────────
      const lanes = conflict.overlays.shippingLanes ?? []
      if (lanes.length > 0) {
        const features = lanes.map(lane => ({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: lane.coordinates },
          properties: { id: lane.id, name: lane.name },
        }))
        map.addSource('shipping-lanes', { type: 'geojson', data: { type: 'FeatureCollection', features } })
        // Glow layer (wider, more transparent)
        map.addLayer({
          id: 'shipping-lanes-glow', type: 'line', source: 'shipping-lanes',
          layout: { visibility: layersRef.current.shippingLanes ? 'visible' : 'none', 'line-cap': 'round' },
          paint: { 'line-color': 'rgba(148,163,184,0.15)', 'line-width': 6 },
        })
        // Main lane line
        map.addLayer({
          id: 'shipping-lanes', type: 'line', source: 'shipping-lanes',
          layout: { visibility: layersRef.current.shippingLanes ? 'visible' : 'none', 'line-cap': 'round' },
          paint: { 'line-color': 'rgba(148,163,184,0.5)', 'line-width': 1.5, 'line-dasharray': [5, 3] },
        })
      }

      // ── Incident heatmap + circles ────────────────────────────
      map.addSource('incidents', {
        type: 'geojson',
        data: buildIncidentGeoJSON(incidentsRef.current),
      })
      map.addLayer({
        id:     'incidents-heatmap',
        type:   'heatmap',
        source: 'incidents',
        layout: { visibility: layersRef.current.heatmap ? 'visible' : 'none' },
        paint: {
          'heatmap-weight':     ['interpolate', ['linear'], ['get', 'severity'], 1, 0.2, 5, 1.0],
          'heatmap-intensity':   0.9,
          'heatmap-radius':      28,
          'heatmap-opacity':     0.65,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(0,0,0,0)',
            0.2, '#22c55e',
            0.4, '#eab308',
            0.7, '#f97316',
            1.0, '#ef4444',
          ],
        },
      })
      // Glow halo (outer, blurred)
      map.addLayer({
        id:     'incidents-glow',
        type:   'circle',
        source: 'incidents',
        layout: { visibility: layersRef.current.incidents ? 'visible' : 'none' },
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['get', 'severity'], 1, 10, 5, 24],
          'circle-color':   ['get', 'sev_color'],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'age_hours'], 0, 0.18, 24, 0.05],
          'circle-blur':    1,
          'circle-stroke-width': 0,
        },
      })
      // Main circle
      map.addLayer({
        id:     'incidents-circles',
        type:   'circle',
        source: 'incidents',
        layout: { visibility: layersRef.current.incidents ? 'visible' : 'none' },
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['get', 'severity'], 1, 4, 5, 10],
          'circle-color':   ['get', 'sev_color'],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'age_hours'], 0, 0.9, 24, 0.4],
          'circle-stroke-width':   1.5,
          'circle-stroke-color':   ['get', 'sev_color'],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'age_hours'], 0, 0.9, 24, 0.3],
          'circle-pitch-alignment': 'map',
        },
      })
      map.addLayer({
        id:     'incidents-labels',
        type:   'symbol',
        source: 'incidents',
        layout: {
          visibility:    layersRef.current.incidents ? 'visible' : 'none',
          'text-field':  ['get', 'title'],
          'text-font':   ['Noto Sans Regular'],
          'text-size':    9,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-optional': true,
          'text-max-width': 12,
          'text-allow-overlap': false,
        },
        minzoom: 7,
        paint: {
          'text-color':      ['get', 'sev_color'],
          'text-halo-color': 'rgba(0,0,0,0.9)',
          'text-halo-width':  1.5,
        },
      })

      // Hover popup for incidents
      const incidentPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        maxWidth: '300px',
      })

      map.on('mouseenter', 'incidents-circles', (e) => {
        if (!e.features || !e.features[0]) return
        map.getCanvas().style.cursor = 'pointer'
        const p = e.features[0].properties as Record<string, unknown>
        const sevColor = p.sev_color as string
        const severity = p.severity as number
        const sevLabel = ['', 'INFO', 'LOW', 'MED', 'HIGH', 'CRIT'][severity] ?? 'UNK'
        const ts = typeof p.timestamp === 'string' ? p.timestamp.slice(0, 16).replace('T', ' ') + 'Z' : ''
        const loc = (p.location_name as string) || ''
        const summary = (p.summary as string) || ''

        incidentPopup.setLngLat(e.lngLat).setHTML(`
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#e2e8f0;
                      padding:10px 12px;background:#0d1224;
                      border:1px solid ${sevColor}44;border-radius:3px;min-width:200px;max-width:280px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:8px;color:${sevColor};letter-spacing:0.14em;text-transform:uppercase;
                           background:${sevColor}18;border:1px solid ${sevColor}44;
                           padding:1px 5px;border-radius:2px">${sevLabel}</span>
              <span style="font-size:8px;color:#475569">${ts}</span>
            </div>
            <div style="font-size:11px;color:#e2e8f0;margin-bottom:${summary ? 6 : 0}px;line-height:1.4">
              ${String(p.title ?? '')}
            </div>
            ${summary ? `<div style="font-size:10px;color:#94a3b8;line-height:1.5;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px">${summary}</div>` : ''}
            ${loc ? `<div style="font-size:9px;color:#475569;margin-top:4px">📍 ${loc}</div>` : ''}
          </div>
        `).addTo(map)
      })

      map.on('mousemove', 'incidents-circles', (e) => {
        incidentPopup.setLngLat(e.lngLat)
      })

      map.on('mouseleave', 'incidents-circles', () => {
        map.getCanvas().style.cursor = ''
        incidentPopup.remove()
      })

      map.on('click', 'incidents-circles', (e) => {
        if (!e.features || !e.features[0]) return
        const props   = e.features[0].properties as Record<string, unknown>
        const clicked = incidentsRef.current.find(i => i.id === props.id)
        onPickIncident?.(clicked ?? null)
      })

      applyMarkerVisibility(map, layersRef.current)
      applySamVisibility(map, layersRef.current.sam)

      // ── Country highlights (async fetch, added after load) ────
      const highlights = conflict.overlays.countryHighlights ?? []
      if (highlights.length > 0) {
        const iso3Set     = new Set(highlights.map(h => h.iso3))
        const colorLookup = buildPartyColorMap(conflict)
        colorLookup['NEUTRAL'] = '#94a3b8'
        const iso3ToColor: Record<string, string> = {}
        for (const h of highlights) {
          iso3ToColor[h.iso3] = colorLookup[h.party] ?? '#94a3b8'
        }

        void fetchNECountries().then(allCountries => {
          if (mapRef.current !== map) return     // map unmounted — abort
          if (map.getSource('country-highlights')) return  // already added

          const filtered: GeoJSON.Feature[] = allCountries.features
            .filter(f => {
              const iso = (f.properties?.['ISO_A3'] ?? f.properties?.['ADM0_A3']) as string | undefined
              return iso != null && iso3Set.has(iso)
            })
            .map(f => {
              const iso = (f.properties!['ISO_A3'] ?? f.properties!['ADM0_A3']) as string
              return {
                ...f,
                properties: { ...f.properties, _color: iso3ToColor[iso] ?? '#94a3b8' },
              }
            })

          map.addSource('country-highlights', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: filtered },
          })

          // Insert BELOW aircraft-trails so countries stay behind track layers
          const belowLayer = map.getLayer('aircraft-trails') ? 'aircraft-trails' : undefined
          map.addLayer({
            id: 'country-highlights-fill', type: 'fill', source: 'country-highlights',
            layout: { visibility: layersRef.current.countries ? 'visible' : 'none' },
            paint: { 'fill-color': ['get', '_color'], 'fill-opacity': 0.12 },
          }, belowLayer)
          map.addLayer({
            id: 'country-highlights-outline', type: 'line', source: 'country-highlights',
            layout: { visibility: layersRef.current.countries ? 'visible' : 'none' },
            paint: { 'line-color': ['get', '_color'], 'line-opacity': 0.5, 'line-width': 1.5 },
          }, belowLayer)
        }).catch(() => { /* Non-fatal if CDN unavailable */ })
      }

      // Signal React that the map + all sources are ready
      setMapLoaded(true)
    })

    return () => {
      cancelAnimationFrame(laneAnimRef.current)
      markersRef.current.bases.forEach(m => m.remove())
      markersRef.current.nuclear.forEach(m => m.remove())
      markersRef.current.chokepoints.forEach(m => m.remove())
      markersRef.current = { bases: [], nuclear: [], chokepoints: [] }
      map.remove()
      mapRef.current     = null
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Update aircraft positions ─────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const acSource    = map.getSource('aircraft')        as maplibregl.GeoJSONSource | undefined
    const trailSource = map.getSource('aircraft-trails') as maplibregl.GeoJSONSource | undefined
    if (acSource)    acSource.setData(buildAircraftGeoJSON(aircraft, partyColorMapRef.current))
    if (trailSource) trailSource.setData(buildTrailGeoJSON(aircraft, partyColorMapRef.current))
  }, [aircraft, mapLoaded])

  // ── Selection highlight (panel click OR map click both update selectedId) ──

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const matchExpr = ['==', ['get', 'icao24'], selectedId ?? ''] as maplibregl.FilterSpecification

    // Ring layer: filter to show only the selected aircraft
    if (map.getLayer('aircraft-selected')) {
      map.setFilter('aircraft-selected', matchExpr)
    }

    // Icon: white + larger when selected, party color + normal size otherwise
    if (map.getLayer('aircraft')) {
      map.setPaintProperty('aircraft', 'icon-color', [
        'case', matchExpr, '#ffffff', ['get', 'color'],
      ])
      map.setLayoutProperty('aircraft', 'icon-size', [
        'case', matchExpr,
        ['case', ['boolean', ['get', 'mil'], false], 1.45, 1.15],   // selected — bigger
        ['case', ['boolean', ['get', 'mil'], false], 1.05, 0.78],   // default
      ])
    }
  }, [selectedId, mapLoaded])

  // ── Update vessel GeoJSON when data changes ───────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const vsSource = map.getSource('vessels') as maplibregl.GeoJSONSource | undefined
    if (vsSource) vsSource.setData(buildVesselGeoJSON(vessels, partyColorMapRef.current))
  }, [vessels, mapLoaded])

  // ── Update incident GeoJSON when data changes ─────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const incSource = map.getSource('incidents') as maplibregl.GeoJSONSource | undefined
    if (incSource) incSource.setData(buildIncidentGeoJSON(incidents))
  }, [incidents, mapLoaded])

  // ── Fly to location (triggered by incident feed click) ────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !flyTo) return
    map.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? 8, duration: 1200 })
  }, [flyTo, mapLoaded])

  // ── Shipping lane animated dash ────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !layers.shippingLanes) {
      cancelAnimationFrame(laneAnimRef.current)
      return
    }
    if (!map.getLayer('shipping-lanes')) return

    // Capture non-null map reference after the null guard above
    const m = map
    let step = 0
    let lastTick = 0
    const TICK_MS = 80   // ~12fps for the animation
    function frame(now: number) {
      if (now - lastTick >= TICK_MS) {
        lastTick = now
        step = (step + 1) % DASH_SEQUENCES.length
        if (m.getLayer('shipping-lanes')) {
          m.setPaintProperty('shipping-lanes', 'line-dasharray', DASH_SEQUENCES[step] ?? [5, 3])
        }
      }
      laneAnimRef.current = requestAnimationFrame(frame)
    }
    laneAnimRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(laneAnimRef.current)
  }, [layers.shippingLanes, mapLoaded])

  // ── Remove strike rings when toggle is turned off ─────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || layers.strikeRanges) return
    conflict.overlays.bases.forEach(base => removeStrikeRings(map, base))
  }, [layers.strikeRanges, mapLoaded, conflict.overlays.bases])

  // ── Sync layer visibility ─────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    applyMarkerVisibility(map, layers)
    applySamVisibility(map, layers.sam)
    applyAircraftVisibility(map, layers.aircraft)
    applyVesselVisibility(map, layers.vessels)
    applyIncidentVisibility(map, layers.incidents, layers.heatmap)
    applyShippingLaneVisibility(map, layers.shippingLanes)
    applyCountriesVisibility(map, layers.countries)
  }, [layers, mapLoaded, applyMarkerVisibility, applySamVisibility, applyAircraftVisibility, applyVesselVisibility, applyIncidentVisibility, applyShippingLaneVisibility, applyCountriesVisibility])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
