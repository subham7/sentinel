'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circle as turfCircle } from '@turf/turf'
import type { ConflictConfig, Aircraft, Vessel, Incident } from '@sentinel/shared'

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'

const PARTY_COLORS: Record<string, string> = {
  US:      '#00b0ff',
  IR:      '#ef4444',
  IL:      '#22c55e',
  GCC:     '#f59e0b',
  PS:      '#ef4444',
  LB:      '#f97316',
  UN:      '#94a3b8',
  NATO:    '#a855f7',
  ALLIED:  '#f59e0b',
  UNKNOWN: '#94a3b8',
}

const NUCLEAR_STATUS_COLORS: Record<string, string> = {
  active:      '#ef4444',
  suspected:   '#f97316',
  modified:    '#eab308',
  operational: '#22c55e',
  shutdown:    '#94a3b8',
}

export interface LayerState {
  aircraft:    boolean
  vessels:     boolean
  incidents:   boolean
  heatmap:     boolean
  bases:       boolean
  nuclear:     boolean
  sam:         boolean
  chokepoints: boolean
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

function buildAircraftGeoJSON(aircraft: Aircraft[]): GeoJSON.FeatureCollection {
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
        color:    PARTY_COLORS[ac.side] ?? '#94a3b8',
      },
    })),
  }
}

function buildTrailGeoJSON(aircraft: Aircraft[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: aircraft
      .filter(ac => ac.trail.length > 1)
      .map(ac => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: ac.trail },
        properties: { color: PARTY_COLORS[ac.side] ?? '#94a3b8' },
      })),
  }
}

// ── Vessel GeoJSON builder ────────────────────────────────────────────────────

const VESSEL_TYPE_LABELS: Record<string, string> = {
  warship: '⚓', tanker: '🛢', cargo: '📦', fast_boat: '⚡', submarine: '◎', unknown: '◇',
}

function buildVesselGeoJSON(vessels: Vessel[]): GeoJSON.FeatureCollection {
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
        color:     v.ais_dark ? '#94a3b8' : (PARTY_COLORS[v.side] ?? '#94a3b8'),
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
          id:        i.id,
          title:     i.title,
          category:  i.category,
          severity:  i.severity,
          source:    i.source,
          timestamp: i.timestamp,
          age_hours: Math.min(24, (nowMs - new Date(i.timestamp).getTime()) / 3_600_000),
          sev_color: SEV_COLORS[i.severity] ?? '#94a3b8',
        },
      })),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TheaterMap({
  conflict,
  layers,
  aircraft,
  vessels,
  incidents,
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

  layersRef.current   = layers
  aircraftRef.current = aircraft
  vesselsRef.current  = vessels
  incidentsRef.current = incidents
  selectedRef.current = selectedId

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
    if (map.getLayer('incidents-circles')) map.setLayoutProperty('incidents-circles', 'visibility', iv)
    if (map.getLayer('incidents-labels'))  map.setLayoutProperty('incidents-labels',  'visibility', iv)
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
        data: buildTrailGeoJSON(aircraftRef.current),
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
        data:    buildAircraftGeoJSON(aircraftRef.current),
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
        data: buildVesselGeoJSON(vesselsRef.current),
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
      const bases: maplibregl.Marker[] = []
      conflict.overlays.bases.forEach(base => {
        const color = PARTY_COLORS[base.party] ?? '#94a3b8'
        const el    = document.createElement('div')
        el.className   = 's-base-marker'
        el.style.color = color
        el.title       = `${base.name} (${base.party})`

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
          </div>
        `)

        el.addEventListener('mouseenter', () => marker.setPopup(popup).togglePopup())
        el.addEventListener('mouseleave', () => { if (popup.isOpen()) popup.remove() })

        const marker = new maplibregl.Marker({ element: el }).setLngLat([base.lon, base.lat])
        if (layersRef.current.bases) marker.addTo(map)
        bases.push(marker)
      })
      markersRef.current.bases = bases

      // ── Nuclear sites ─────────────────────────────────────────
      const nuclear: maplibregl.Marker[] = []
      ;(conflict.overlays.nuclearSites ?? []).forEach(site => {
        const color = NUCLEAR_STATUS_COLORS[site.status] ?? '#a855f7'
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
              <span style="color:${color};text-transform:uppercase;letter-spacing:0.08em">${site.status}</span>
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
      map.addLayer({
        id:     'incidents-circles',
        type:   'circle',
        source: 'incidents',
        layout: { visibility: layersRef.current.incidents ? 'visible' : 'none' },
        paint: {
          'circle-radius':  ['interpolate', ['linear'], ['get', 'severity'], 1, 5, 5, 12],
          'circle-color':   ['get', 'sev_color'],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'age_hours'], 0, 0.85, 24, 0.3],
          'circle-stroke-width':   1,
          'circle-stroke-color':   ['get', 'sev_color'],
          'circle-stroke-opacity': 0.5,
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
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
          'text-max-width': 10,
          'text-allow-overlap': false,
        },
        minzoom: 7,
        paint: {
          'text-color':      ['get', 'sev_color'],
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width':  1,
        },
      })
      map.on('click', 'incidents-circles', (e) => {
        if (!e.features || !e.features[0]) return
        const props   = e.features[0].properties as Record<string, unknown>
        const clicked = incidentsRef.current.find(i => i.id === props.id)
        onPickIncident?.(clicked ?? null)
      })
      map.on('mouseenter', 'incidents-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'incidents-circles', () => { map.getCanvas().style.cursor = '' })

      applyMarkerVisibility(map, layersRef.current)
      applySamVisibility(map, layersRef.current.sam)

      // Signal React that the map + all sources are ready
      setMapLoaded(true)
    })

    return () => {
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
    if (acSource)    acSource.setData(buildAircraftGeoJSON(aircraft))
    if (trailSource) trailSource.setData(buildTrailGeoJSON(aircraft))
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
    if (vsSource) vsSource.setData(buildVesselGeoJSON(vessels))
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

  // ── Sync layer visibility ─────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    applyMarkerVisibility(map, layers)
    applySamVisibility(map, layers.sam)
    applyAircraftVisibility(map, layers.aircraft)
    applyVesselVisibility(map, layers.vessels)
    applyIncidentVisibility(map, layers.incidents, layers.heatmap)
  }, [layers, mapLoaded, applyMarkerVisibility, applySamVisibility, applyAircraftVisibility, applyVesselVisibility, applyIncidentVisibility])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
