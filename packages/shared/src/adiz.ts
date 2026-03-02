// Air Defense Identification Zone (ADIZ) and maritime boundary data
// Approximate polygons for relevant theaters — static, updated via PR

export interface ADIZZone {
  id:          string
  name:        string
  conflictSlug: string
  party:       string
  type:        'adiz' | 'territorial_airspace' | 'fir'
  geometry:    GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export interface MaritimeZone {
  id:          string
  name:        string
  conflictSlug: string
  party:       string
  type:        'territorial_sea' | 'eez' | 'contiguous'
  geometry:    GeoJSON.Polygon | GeoJSON.MultiPolygon
}

// ── Persian Gulf / CENTCOM ADIZ zones (us-iran) ────────────────────────────────

const IRAN_ADIZ: ADIZZone = {
  id:           'iran-adiz',
  name:         'Iran ADIZ',
  conflictSlug: 'us-iran',
  party:        'IR',
  type:         'adiz',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [44.0, 37.5], [63.3, 37.5], [63.3, 25.0],
      [57.0, 25.0], [52.5, 26.5], [44.0, 29.0], [44.0, 37.5],
    ]],
  },
}

const IRAN_FIR: ADIZZone = {
  id:           'iran-fir',
  name:         'Tehran FIR (Flight Information Region)',
  conflictSlug: 'us-iran',
  party:        'IR',
  type:         'fir',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [44.0, 39.8], [63.3, 39.8], [63.3, 25.0],
      [56.0, 24.3], [51.0, 25.5], [44.0, 29.5], [44.0, 39.8],
    ]],
  },
}

const BAHRAIN_AIRSPACE: ADIZZone = {
  id:           'bahrain-us-airspace',
  name:         'Bahrain / NAVCENT Airspace',
  conflictSlug: 'us-iran',
  party:        'US',
  type:         'territorial_airspace',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [49.9, 26.5], [51.0, 26.5], [51.0, 25.7],
      [50.2, 25.7], [49.9, 26.5],
    ]],
  },
}

// ── Persian Gulf maritime zones ────────────────────────────────────────────────

const IRAN_TERRITORIAL_SEA: MaritimeZone = {
  id:           'iran-territorial-sea',
  name:         'Iranian Territorial Waters (12 NM)',
  conflictSlug: 'us-iran',
  party:        'IR',
  type:         'territorial_sea',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [48.5, 30.5], [49.5, 30.2], [50.5, 29.5], [51.5, 28.8],
      [56.5, 26.5], [58.5, 25.2], [60.0, 25.0],
      [60.0, 24.3], [57.5, 24.0], [55.5, 24.5],
      [50.0, 26.5], [48.0, 29.5], [48.5, 30.5],
    ]],
  },
}

const HORMUZ_STRAIT_TSS: MaritimeZone = {
  id:           'hormuz-tss',
  name:         'Strait of Hormuz — Traffic Separation Scheme',
  conflictSlug: 'us-iran',
  party:        'IR',
  type:         'contiguous',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [56.0, 26.5], [57.5, 26.4], [57.8, 26.0],
      [57.2, 25.8], [56.0, 25.9], [55.7, 26.2], [56.0, 26.5],
    ]],
  },
}

// ── Israel–Gaza theater ────────────────────────────────────────────────────────

const ISRAEL_AIRSPACE: ADIZZone = {
  id:           'israel-airspace',
  name:         'Israeli Controlled Airspace',
  conflictSlug: 'israel-gaza',
  party:        'IL',
  type:         'territorial_airspace',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [34.3, 33.1], [36.0, 33.3], [36.0, 30.0],
      [34.9, 29.5], [34.3, 29.5], [34.3, 33.1],
    ]],
  },
}

// ── All zones ──────────────────────────────────────────────────────────────────

export const ALL_ADIZ_ZONES: ADIZZone[] = [
  IRAN_ADIZ, IRAN_FIR, BAHRAIN_AIRSPACE, ISRAEL_AIRSPACE,
]

export const ALL_MARITIME_ZONES: MaritimeZone[] = [
  IRAN_TERRITORIAL_SEA, HORMUZ_STRAIT_TSS,
]

export function getAdizZones(conflictSlug: string): ADIZZone[] {
  return ALL_ADIZ_ZONES.filter(z => z.conflictSlug === conflictSlug)
}

export function getMaritimeZones(conflictSlug: string): MaritimeZone[] {
  return ALL_MARITIME_ZONES.filter(z => z.conflictSlug === conflictSlug)
}
