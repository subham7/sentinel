'use client'

import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circle as turfCircle } from '@turf/turf'
import type { ConflictConfig } from '@sentinel/shared'

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'

const PARTY_COLORS: Record<string, string> = {
  US:   '#00b0ff',
  IR:   '#ef4444',
  IL:   '#22c55e',
  GCC:  '#f59e0b',
  PS:   '#ef4444',
  LB:   '#f97316',
  UN:   '#94a3b8',
  NATO: '#a855f7',
}

const NUCLEAR_STATUS_COLORS: Record<string, string> = {
  active:      '#ef4444',
  suspected:   '#f97316',
  modified:    '#eab308',
  operational: '#22c55e',
  shutdown:    '#94a3b8',
}

export interface LayerState {
  bases:      boolean
  nuclear:    boolean
  sam:        boolean
  chokepoints: boolean
}

interface Props {
  conflict:     ConflictConfig
  layers:       LayerState
}

export default function TheaterMap({ conflict, layers }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<maplibregl.Map | null>(null)
  const markersRef    = useRef<{
    bases:       maplibregl.Marker[]
    nuclear:     maplibregl.Marker[]
    chokepoints: maplibregl.Marker[]
  }>({ bases: [], nuclear: [], chokepoints: [] })
  const layersRef     = useRef<LayerState>(layers)
  const mountedRef    = useRef(false)

  // Keep layersRef in sync for visibility updates
  layersRef.current = layers

  const applyMarkerVisibility = useCallback((map: maplibregl.Map, ls: LayerState) => {
    markersRef.current.bases.forEach(m => ls.bases ? m.addTo(map) : m.remove())
    markersRef.current.nuclear.forEach(m => ls.nuclear ? m.addTo(map) : m.remove())
    markersRef.current.chokepoints.forEach(m => ls.chokepoints ? m.addTo(map) : m.remove())
  }, [])

  const applySamVisibility = useCallback((map: maplibregl.Map, visible: boolean) => {
    const vis = visible ? 'visible' : 'none'
    if (map.getLayer('sam-fill'))   map.setLayoutProperty('sam-fill',   'visibility', vis)
    if (map.getLayer('sam-line'))   map.setLayoutProperty('sam-line',   'visibility', vis)
  }, [])

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

    // Navigation control
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      // ── SAM coverage rings ──────────────────────────────
      const samSites = conflict.overlays.samSites ?? []
      if (samSites.length > 0) {
        const samFeatures = samSites.map(site =>
          turfCircle([site.lon, site.lat], site.range_km, {
            steps: 64,
            units: 'kilometers',
            properties: { name: site.name, system: site.system },
          })
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
          paint: {
            'fill-color':   'rgba(239, 68, 68, 0.08)',
            'fill-opacity':  1,
          },
        })
        map.addLayer({
          id:     'sam-line',
          type:   'line',
          source: 'sam-rings',
          layout: { visibility: layersRef.current.sam ? 'visible' : 'none' },
          paint: {
            'line-color':       'rgba(239, 68, 68, 0.4)',
            'line-width':        1,
            'line-dasharray':   [4, 3],
          },
        })
      }

      // ── Military bases ──────────────────────────────────
      const bases: maplibregl.Marker[] = []
      conflict.overlays.bases.forEach(base => {
        const color = PARTY_COLORS[base.party] ?? '#94a3b8'
        const el    = document.createElement('div')
        el.className   = 's-base-marker'
        el.style.color = color
        el.title       = `${base.name} (${base.party})`

        const popup = new maplibregl.Popup({
          closeButton:  false,
          closeOnClick: false,
          offset:       14,
          className:    'sentinel-popup',
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

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([base.lon, base.lat])
        if (layersRef.current.bases) marker.addTo(map)
        bases.push(marker)
      })
      markersRef.current.bases = bases

      // ── Nuclear sites ───────────────────────────────────
      const nuclear: maplibregl.Marker[] = []
      ;(conflict.overlays.nuclearSites ?? []).forEach(site => {
        const color = NUCLEAR_STATUS_COLORS[site.status] ?? '#a855f7'
        const el    = document.createElement('div')
        el.className   = 's-nuclear-marker'
        el.style.color = '#a855f7'
        el.textContent = '☢'
        el.title       = `${site.name} — ${site.enrichment}`

        const popup = new maplibregl.Popup({
          closeButton:  false,
          closeOnClick: false,
          offset:       14,
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

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([site.lon, site.lat])
        if (layersRef.current.nuclear) marker.addTo(map)
        nuclear.push(marker)
      })
      markersRef.current.nuclear = nuclear

      // ── Chokepoints ─────────────────────────────────────
      const chokepoints: maplibregl.Marker[] = []
      ;(conflict.overlays.chokepoints ?? []).forEach(cp => {
        const el  = document.createElement('div')
        el.className     = 's-chokepoint-wrap'
        el.style.color   = '#f97316'
        el.style.cssText += ';position:relative;width:12px;height:12px;cursor:pointer'

        const dot  = document.createElement('div')
        dot.className = 's-chokepoint-dot'
        const ring1 = document.createElement('div')
        ring1.className = 's-chokepoint-ring'
        const ring2 = document.createElement('div')
        ring2.className = 's-chokepoint-ring s-chokepoint-ring2'
        el.appendChild(dot)
        el.appendChild(ring1)
        el.appendChild(ring2)

        const popup = new maplibregl.Popup({
          closeButton:  false,
          closeOnClick: false,
          offset:       14,
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

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([cp.lon, cp.lat])
        if (layersRef.current.chokepoints) marker.addTo(map)
        chokepoints.push(marker)
      })
      markersRef.current.chokepoints = chokepoints

      // Apply initial visibility
      applyMarkerVisibility(map, layersRef.current)
      applySamVisibility(map, layersRef.current.sam)
    })

    return () => {
      markersRef.current.bases.forEach(m => m.remove())
      markersRef.current.nuclear.forEach(m => m.remove())
      markersRef.current.chokepoints.forEach(m => m.remove())
      markersRef.current = { bases: [], nuclear: [], chokepoints: [] }
      map.remove()
      mapRef.current  = null
      mountedRef.current = false
    }
    // We want this effect to run only once on mount — conflict doesn't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync layer visibility when `layers` prop changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyMarkerVisibility(map, layers)
    applySamVisibility(map, layers.sam)
  }, [layers, applyMarkerVisibility, applySamVisibility])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
