'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ALL_CONFLICTS } from '@sentinel/shared'
import type { ConflictConfig } from '@sentinel/shared'

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'

const INTENSITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  elevated: '#eab308',
  low:      '#22c55e',
}

function conflictPolygon(conflict: ConflictConfig) {
  const { latMin, latMax, lonMin, lonMax } = conflict.map.bounds
  return {
    type: 'Feature' as const,
    properties: { slug: conflict.slug },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[
        [lonMin, latMin],
        [lonMax, latMin],
        [lonMax, latMax],
        [lonMin, latMax],
        [lonMin, latMin],
      ]],
    },
  }
}

interface Props {
  hoveredSlug?: string | null
  onHoverConflict?: (slug: string | null) => void
}

export default function ConflictGlobe({ hoveredSlug, onHoverConflict }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const rotateRef    = useRef(true)
  const animRef      = useRef<number>(0)
  const lastTimeRef  = useRef(0)
  const router       = useRouter()

  const onHover = useCallback((slug: string | null) => {
    onHoverConflict?.(slug)
  }, [onHoverConflict])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container:          containerRef.current,
      style:              CARTO_DARK,
      center:             [43, 27],
      zoom:               2.2,
      attributionControl: false,
      antialias:          true,
    })
    mapRef.current = map

    map.on('load', () => {
      // Globe projection
      try { (map as any).setProjection({ type: 'globe' }) } catch { /* older build */ }

      // Atmosphere
      try {
        (map as any).setFog({
          'color':          'rgba(10, 14, 26, 0.9)',
          'high-color':     '#060a14',
          'horizon-blend':  0.08,
          'space-color':    '#000000',
          'star-intensity': 0.4,
        })
      } catch { /* no fog support */ }

      // Add conflict zone layers
      ALL_CONFLICTS.forEach(conflict => {
        const color  = INTENSITY_COLORS[conflict.intensity] ?? '#94a3b8'
        const feature = conflictPolygon(conflict)

        map.addSource(`zone-${conflict.slug}`, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [feature] },
        })

        map.addLayer({
          id:     `zone-fill-${conflict.slug}`,
          type:   'fill',
          source: `zone-${conflict.slug}`,
          paint: {
            'fill-color':   color,
            'fill-opacity': 0.15,
          },
        })

        map.addLayer({
          id:     `zone-line-${conflict.slug}`,
          type:   'line',
          source: `zone-${conflict.slug}`,
          paint: {
            'line-color':   color,
            'line-opacity': 0.5,
            'line-width':   1.5,
          },
        })

        map.on('click', `zone-fill-${conflict.slug}`, () => {
          router.push(`/conflicts/${conflict.slug}`)
        })
        map.on('mouseenter', `zone-fill-${conflict.slug}`, () => {
          map.getCanvas().style.cursor = 'pointer'
          onHover(conflict.slug)
        })
        map.on('mouseleave', `zone-fill-${conflict.slug}`, () => {
          map.getCanvas().style.cursor = ''
          onHover(null)
        })
      })

      // Add chokepoints from all conflicts
      const chopointFeatures = ALL_CONFLICTS.flatMap(c =>
        (c.overlays.chokepoints ?? []).map(cp => ({
          type: 'Feature' as const,
          properties: { name: cp.name, radius: cp.radius_km },
          geometry: { type: 'Point' as const, coordinates: [cp.lon, cp.lat] },
        }))
      )

      map.addSource('chokepoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: chopointFeatures },
      })
      map.addLayer({
        id:     'chokepoints-dot',
        type:   'circle',
        source: 'chokepoints',
        paint: {
          'circle-radius':       5,
          'circle-color':        '#f97316',
          'circle-opacity':      0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#f97316',
        },
      })
    })

    // Auto-rotate
    function rotate(ts: number) {
      if (rotateRef.current && lastTimeRef.current) {
        const elapsed = ts - lastTimeRef.current
        const deg     = (elapsed * 0.5) / 1000
        const bearing = ((map.getBearing() + deg) % 360)
        map.setBearing(bearing)
      }
      lastTimeRef.current = ts
      animRef.current = requestAnimationFrame(rotate)
    }
    animRef.current = requestAnimationFrame(rotate)

    // Pause on interaction
    const pause = () => { rotateRef.current = false }
    const resume = () => { setTimeout(() => { rotateRef.current = true }, 3000) }
    map.on('mousedown', pause)
    map.on('touchstart', pause)
    map.on('mouseup', resume)
    map.on('touchend', resume)

    // Pulse zone fill opacity
    let pulseAngle = 0
    const pulseInterval = setInterval(() => {
      pulseAngle += 0.04
      const wave = 0.12 + Math.sin(pulseAngle) * 0.06
      ALL_CONFLICTS.forEach(c => {
        try {
          map.setPaintProperty(`zone-fill-${c.slug}`, 'fill-opacity', wave)
        } catch { /* not loaded yet */ }
      })
    }, 50)

    return () => {
      cancelAnimationFrame(animRef.current)
      clearInterval(pulseInterval)
      map.remove()
      mapRef.current = null
    }
  }, [router, onHover])

  // Highlight hovered conflict zone
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.isStyleLoaded()) return

    ALL_CONFLICTS.forEach(conflict => {
      const isHovered = hoveredSlug === conflict.slug
      const opacity   = hoveredSlug ? (isHovered ? 0.35 : 0.08) : 0.15
      try {
        map.setPaintProperty(`zone-fill-${conflict.slug}`, 'fill-opacity', opacity)
        map.setPaintProperty(`zone-line-${conflict.slug}`, 'line-opacity', isHovered ? 0.9 : 0.4)
      } catch { /* layer not yet loaded */ }
    })
  }, [hoveredSlug])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
