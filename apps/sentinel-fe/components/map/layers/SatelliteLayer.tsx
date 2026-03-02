// NASA GIBS WMTS tile layer configuration
// All layers are unauthenticated and browser-direct — no API key required

// maxZoom: the highest zoom level the GIBS TileMatrixSet provides.
// GoogleMapsCompatible_Level9 = 9 levels (0–8). Requests beyond maxZoom get 400.
// MapLibre overscales the zoom-8 tile instead of requesting a missing tile.
export const GIBS_LAYERS = {
  truecolor: {
    id:      'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    fmt:     'jpg',
    maxZoom: 8,
    label:   'True Color (VIIRS)',
    tip:     'Daily true-color composite at 375m resolution from VIIRS instrument',
  },
  nightlights: {
    id:      'VIIRS_SNPP_DayNightBand_ENCC',
    fmt:     'jpg',
    maxZoom: 8,
    label:   'Nighttime Lights ★',
    tip:     'Power outages appear as dark patches in formerly lit areas — high-intelligence indicator of infrastructure damage',
  },
  thermal: {
    id:      'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    fmt:     'png',
    maxZoom: 8,
    label:   'Thermal Anomalies',
    tip:     'High-FRP point sources without vegetation context likely indicate munitions impacts or industrial fires',
  },
} as const

export type GibsLayerKey = keyof typeof GIBS_LAYERS

// Build a NASA GIBS WMTS tile URL for a given layer and date
export function gibsTileUrl(layerId: string, date: string, fmt: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerId}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${fmt}`
}

// Return yesterday's date in UTC (GIBS has ~24h latency)
export function yesterdayUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
