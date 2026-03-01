// deck.gl layer builders for aircraft visualization
// Returns [PathLayer (trails), IconLayer (aircraft icons)]
// Called imperatively — not a React component.

import { IconLayer, PathLayer } from '@deck.gl/layers'
import type { Aircraft, ConflictConfig } from '@sentinel/shared'

// ── Aircraft icon: north-pointing triangle, white (colored by getColor) ───────
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12,1 22,23 12,17 2,23" fill="white"/></svg>`
// btoa is fine in browser; on SSR this code never runs (dynamic import)
const ICON_URL = `data:image/svg+xml;base64,${
  typeof btoa !== 'undefined' ? btoa(ICON_SVG) : ''
}`

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

type RGBA = [number, number, number, number]

// ── Layer builder ─────────────────────────────────────────────────────────────

export function buildAircraftLayers(
  aircraft:   Aircraft[],
  conflict:   ConflictConfig,
  visible:    boolean,
  selectedId: string | null = null,
) {
  if (!visible || aircraft.length === 0) return []

  // Build side → RGB from conflict parties
  const colorMap: Record<string, [number, number, number]> = {
    UNKNOWN: [148, 163, 184],
    ALLIED:  [251, 191,  36],
  }
  for (const p of conflict.parties) {
    colorMap[p.shortCode] = hexToRgb(p.color)
  }

  function getColor(d: Aircraft): RGBA {
    const rgb: [number, number, number] = colorMap[d.side] ?? [148, 163, 184]
    const alpha = d.icao24 === selectedId ? 255 : 210
    return [rgb[0], rgb[1], rgb[2], alpha] as RGBA
  }

  return [
    // Trails — rendered first (below icons)
    new PathLayer<Aircraft>({
      id:          `aircraft-trails-${conflict.slug}`,
      data:        aircraft.filter(a => a.trail.length > 1),
      getPath:     d => d.trail,
      getColor:    d => {
        const rgb: [number, number, number] = colorMap[d.side] ?? [148, 163, 184]
        return [rgb[0], rgb[1], rgb[2], 70] as RGBA
      },
      getWidth:    1,
      widthUnits: 'pixels',
      pickable:    false,
    }),

    // Icons — rotated to heading
    new IconLayer<Aircraft>({
      id:          `aircraft-icons-${conflict.slug}`,
      data:        aircraft,
      getPosition: d => [d.lon, d.lat],
      getAngle:    d => (360 - (d.heading ?? 0)) % 360,
      getColor,
      getSize:     d => (d.mil ? 18 : 12),
      getIcon:     () => ({
        url:     ICON_URL,
        width:   24,
        height:  24,
        anchorX: 12,
        anchorY: 12,
        mask:    true,
      }),
      pickable:    true,
      billboard:   false,
    }),
  ]
}
