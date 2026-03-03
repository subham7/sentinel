// NASA GIBS WMTS tile layer configuration
// All layers are unauthenticated and browser-direct — no API key required
//
// TileMatrixSet levels verified against WMTSCapabilities.xml (2026-03-04):
//   VIIRS_SNPP_CorrectedReflectance_TrueColor → Level9, jpeg
//   VIIRS_NOAA20_DayNightBand               → Level7, png   ← replaced old SNPP ENCC (retired)
// Thermal anomalies on GIBS epsg3857 are MVT-only — raster comes via FIRMS WMS (Sprint 7).
export const GIBS_LAYERS = {
  truecolor: {
    id:      'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    fmt:     'jpg',
    tms:     'GoogleMapsCompatible_Level9',
    maxZoom: 8,
    label:   'True Color (VIIRS)',
    tip:     'Daily true-color composite at 375m resolution from VIIRS instrument',
  },
  nightlights: {
    id:      'VIIRS_NOAA20_DayNightBand',
    fmt:     'png',
    tms:     'GoogleMapsCompatible_Level7',
    maxZoom: 6,
    label:   'Nighttime Lights ★',
    tip:     'Power outages appear as dark patches in formerly lit areas — high-intelligence indicator of infrastructure damage',
  },
} as const

export type GibsLayerKey = keyof typeof GIBS_LAYERS

// Build a NASA GIBS WMTS tile URL for a given layer, date, TileMatrixSet, and format
export function gibsTileUrl(layerId: string, date: string, fmt: string, tms: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerId}/default/${date}/${tms}/{z}/{y}/{x}.${fmt}`
}

// Return yesterday's date in UTC (GIBS has ~24h latency)
export function yesterdayUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
