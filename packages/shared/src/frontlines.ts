// Frontline / territorial control data
// Static GeoJSON approximations — update via PR when significant shifts occur

export type ControlZone = 'ukraine' | 'russia' | 'contested'

export interface FrontlineData {
  conflictSlug: string
  updatedAt:    string
  source:       string
  confidence:   'high' | 'medium' | 'low'
  /** Territorial control polygons rendered as filled areas */
  zones: {
    id:       string
    name:     string
    control:  ControlZone
    geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon
  }[]
  /** Frontline contact line(s) rendered as lines */
  lines: {
    id:       string
    name:     string
    geometry: GeoJSON.LineString | GeoJSON.MultiLineString
  }[]
}

// ── Russia–Ukraine frontline (approximate, early 2026) ────────────────────────
// Russian-controlled territory: Luhansk (full), Donetsk (partial),
// Zaporizhzhia (partial), Kherson (left bank)

const RUSSIA_UKRAINE_FRONTLINE: FrontlineData = {
  conflictSlug: 'russia-ukraine',
  updatedAt:    '2026-03-01',
  source:       'DeepState Map / Institute for the Study of War (approximate)',
  confidence:   'medium',
  zones: [
    {
      id:      'ru-controlled',
      name:    'Russian-controlled territory',
      control: 'russia',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          // Luhansk + eastern Donetsk + Zaporizhzhia strip + Kherson left bank
          // Rough approximation of the ~2025-2026 frontline position
          [38.0, 49.3],  // NE Luhansk oblast
          [40.2, 49.0],  // Russian border
          [40.2, 47.5],  // Russian border south
          [39.0, 47.1],  // Azov coast
          [35.5, 46.8],  // Kherson oblast east
          [34.8, 46.6],  // Kherson oblast (Dnieper)
          [35.1, 47.4],  // Melitopol area
          [35.5, 47.8],  // Zaporizhzhia oblast
          [37.0, 48.1],  // Donetsk frontline
          [37.8, 48.6],  // Northern Donetsk
          [38.2, 49.0],  // Luhansk oblast
          [38.0, 49.3],  // close
        ]],
      },
    },
    {
      id:      'ru-controlled-crimea',
      name:    'Crimea (Russian-occupied)',
      control: 'russia',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [32.5, 46.1], [36.7, 45.1], [36.6, 44.5], [35.0, 44.3],
          [33.5, 44.4], [32.5, 45.0], [32.5, 46.1],
        ]],
      },
    },
  ],
  lines: [
    {
      id:   'contact-line-main',
      name: 'Contact Line (approx.)',
      geometry: {
        type: 'LineString',
        coordinates: [
          [38.0, 49.3], [38.2, 49.0], [37.8, 48.6], [37.0, 48.1],
          [36.5, 47.9], [35.8, 47.6], [35.5, 47.8], [35.1, 47.4],
          [34.8, 46.6],
        ],
      },
    },
  ],
}

// ── All frontline data ─────────────────────────────────────────────────────────

export const ALL_FRONTLINES: FrontlineData[] = [RUSSIA_UKRAINE_FRONTLINE]

export function getFrontline(conflictSlug: string): FrontlineData | undefined {
  return ALL_FRONTLINES.find(f => f.conflictSlug === conflictSlug)
}
