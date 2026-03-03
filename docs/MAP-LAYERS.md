# SENTINEL — Map Layers & Design System

MapLibre config, every deck.gl layer, LayerControl groups,
advanced map features, and the full design token system.

---

## Map Architecture

**Base tiles:** CARTO Dark Matter no-labels
`https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json`

**Home page globe:** MapLibre `projection: 'globe'`
- Auto-rotates 0.5°/s when idle, freezes on hover/touch
- Conflict zones: filled polygon, intensity color at 20% opacity + 60% border, pulse animation
- Hovering a conflict card increases polygon opacity
- Global choropleth background layer (UCDP GED data, opacity 0.3, rendered below conflict zones)

**Theater maps:** Standard MapLibre flat projection + deck.gl overlay
- Center + zoom from `conflict.map.center` / `conflict.map.zoom`
- All layers pre-filtered to `conflict.map.bounds`

---

## LayerControl Groups
```
▼ MILITARY
  ✓ Aircraft Tracks       (AircraftLayer)
  ✓ Vessel Tracks         (VesselLayer)
  ✓ Incidents             (IncidentLayer — ScatterplotLayer)
  □ Incident Heatmap      (HeatmapLayer — auto-activates >50 incidents)
  □ Missile Trajectories  (IncidentLayer — ArcLayer)
  □ SAM Envelopes         (SamRingsLayer)
  □ Strike Range Rings    (BasesLayer — on hover)
  □ Aircraft Trails       (TripsLayer — animated, time-fading)
  □ Frontlines            (FrontlineLayer — russia-ukraine only)

▼ SIGNALS
  □ GPS/GNSS Jamming      (GpsJammingLayer — GPSJam.org GridLayer)
  □ Internet Connectivity (InternetHealthLayer)
  □ Media Locations       (MediaLayer — geotagged Telegram media)
  □ Geofenced Zones       (GeofenceLayer — user-drawn alert zones)

▼ SATELLITE
  □ True Color (GIBS VIIRS)
  □ Nighttime Lights (GIBS VIIRS)
  □ Thermal Anomalies (FIRMS · 15 min)
  □ Sentinel-2 True Color (10m · Copernicus)
  ── Date: [2026-02-28] [◄ ►]      (visible when satellite layer active)
  ── [Compare Mode]                 (visible when satellite layer active)

▼ INFRASTRUCTURE
  ✓ Military Bases        (BasesLayer — IconLayer)
  ✓ Shipping Lanes        (ShippingLanesLayer — animated dashes)
  □ Chokepoints           (pulsing ScatterplotLayer)
  □ Nuclear Sites         (NuclearLayer — trefoil icons)
  □ ADIZ Boundaries       (ADIZLayer — static GeoJSON)
  □ EEZ / Maritime Zones  (MaritimeLayer — static GeoJSON)
```

URL state: `?layers=aircraft,vessels,incidents,satellite_truecolor&satdate=2026-02-28`

---

## Deck.gl Layer Reference

| Component | Layer Type | Group | Source Data |
|---|---|---|---|
| `AircraftLayer.tsx` | `IconLayer` + `PathLayer` | MILITARY | WebSocket `aircraft:{slug}` |
| `VesselLayer.tsx` | `IconLayer` | MILITARY | WebSocket `vessels:{slug}` |
| `IncidentLayer.tsx` | `ScatterplotLayer` + `ArcLayer` | MILITARY | SSE incidents |
| `HeatmapLayer.tsx` | `HeatmapLayer` | MILITARY | Incidents, time-windowed |
| `SamRingsLayer.tsx` | `ScatterplotLayer` + circle | MILITARY | `data/sam-positions.json` |
| `BasesLayer.tsx` | `IconLayer` + strike rings | INFRASTRUCTURE | `conflict.overlays.bases` |
| `NuclearLayer.tsx` | `IconLayer` | INFRASTRUCTURE | `conflict.overlays.nuclearSites` |
| `ShippingLanesLayer.tsx` | `GeoJsonLayer` | INFRASTRUCTURE | `conflict.overlays.shippingLanes` |
| `GpsJammingLayer.tsx` | `GridLayer` | SIGNALS | GPSJam.org daily GeoJSON |
| `MediaLayer.tsx` | `IconLayer` | SIGNALS | EXIF-located `telegram_media` rows |
| `GeofenceLayer.tsx` | `GeoJsonLayer` | SIGNALS | Zustand geofence store |
| `FrontlineLayer.tsx` | MapLibre fill layer | MILITARY | `packages/shared/src/frontlines.ts` |
| `ADIZLayer.tsx` | MapLibre line layer | INFRASTRUCTURE | `packages/shared/src/adiz.ts` |
| `SatelliteLayer.tsx` | MapLibre raster | SATELLITE | NASA GIBS / Sentinel Hub |
| `TripsLayer` | `@deck.gl/geo-layers` TripsLayer | MILITARY | `aircraft_trails` SQLite (72h) |

---

## Satellite Imagery (`components/map/layers/SatelliteLayer.tsx`)

### NASA GIBS Tile URLs (no auth required)
```typescript
export const GIBS_LAYERS = {
  trueColor: {
    label: 'True Color (VIIRS)',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
  },
  nightLights: {
    label: 'Nighttime Lights',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_ENCC/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
  },
  thermal: {
    label: 'Thermal Anomalies',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_Thermal_Anomalies_375m_All/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
  },
}
// Default {date} = yesterday UTC (GIBS has ~24h latency)
// Domain-shard across gibs.earthdata.nasa.gov and gibs-{a,b,c}.earthdata.nasa.gov
```

**Intelligence note:** Nighttime lights is the highest-value layer — dark patches in
previously lit areas indicate power grid strikes or population displacement.
Add this context to the layer tooltip.

### NASA FIRMS Thermal WMS (`FIRMS_MAP_KEY` required)
```typescript
const FIRMS_WMS = `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${key}/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=fires_viirs_noaa20_24&TIME={start}/{end}&BBOX={bbox}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857`
```

15-minute latency. High FRP values at point sources without vegetation = likely munitions
impact (note in tooltip). Sublayer under SATELLITE in LayerControl.

### Copernicus Sentinel-2 (10m, `SENTINEL_HUB_CLIENT_ID` + `SENTINEL_HUB_CLIENT_SECRET`)

Backend proxies OAuth2 token: `GET /api/conflicts/:slug/satellite/wms-token`
Frontend uses token to call Sentinel Hub WMS — significantly sharper than VIIRS (375m).

### Before/After Comparison Slider

Library: `maplibre-gl-compare-plus`

Activates via COMPARE MODE toggle in LayerControl when a satellite layer is active.
- Left panel: "before" date · Right panel: "after" date
- Draggable center divider · Both panels share pan/zoom
- `SatelliteDatePicker.tsx` shows two date inputs when compare mode is active

### STAC Scene Discovery

Worker: `stac.worker.ts` — polls Element84 Earth Search daily per conflict bbox.
```typescript
// POST https://earth-search.aws.element84.com/v1/search
{
  "collections": ["sentinel-2-l2a"],
  "bbox": [lonMin, latMin, lonMax, latMax],
  "datetime": "2026-01-01T00:00:00Z/..",
  "query": { "eo:cloud_cover": { "lt": 20 } },
  "sortby": [{ "field": "datetime", "direction": "desc" }],
  "limit": 30
}
```

Route: `GET /api/conflicts/:slug/satellite/scenes` — returns available low-cloud scenes.
Date picker highlights these dates green so analysts know where imagery is usable.

---

## Heatmap Time Window

`HeatmapLayer.tsx` — auto-switches from `ScatterplotLayer` when >50 incidents visible.
```typescript
// Time window selector in LayerControl: 24H | 7D | 30D | ALL
// Weight = incident.severity (1–5) — CRITICAL events glow 5× brighter
// deck.gl config:
{
  weightsTextureSize: 512,
  intensity: 1.5,
  radiusPixels: 40,
  colorRange: /* 6-stop: transparent → --sev-critical */
}
```

---

## TripsLayer — Animated Aircraft Trails

Library: `@deck.gl/geo-layers`
```typescript
new TripsLayer({
  id: `trips-${conflict.slug}`,
  data: aircraft.filter(a => a.trail.length > 1),
  getPath: d => d.trail.map(t => [t.lon, t.lat]),
  getTimestamps: d => d.trail.map(t => t.timestamp),
  getColor: d => partyColorMap[d.side] ?? [150, 150, 150],
  fadeTrail: true,
  trailLength: 180,           // seconds of history visible
  currentTime: animationTime, // driven by requestAnimationFrame counter
  widthMinPixels: 2,
})
```

Backend route: `GET /api/conflicts/:slug/aircraft/:icao24/trail?hours=4`
Source: `aircraft_trails` SQLite table (already populated in Phase 1).
Store 72h of position history in Redis sorted sets for live trail queries.

---

## Frontline / Territorial Control Layer

Data: `packages/shared/src/frontlines.ts` — community-updated GeoJSON via PRs.
```typescript
interface FrontlineData {
  conflictSlug: string
  features: GeoJSON.Feature[]    // MultiPolygon per control zone
  updatedAt: string              // ISO date
  source: string                 // 'DeepState Map', 'ISW', etc.
  confidence: 'high' | 'medium' | 'low'
}
```

MapLibre fill layer rendering:
- Ukrainian control: `#00b0ff` at 15% opacity, solid border
- Russian control: `#ef4444` at 15% opacity, solid border
- Contested: amber SVG hatched pattern
- Uncertainty band: `turf.buffer(frontline, 5, 'km')` at 5% opacity

---

## ADIZ + Maritime Boundaries

Data: `packages/shared/src/adiz.ts` (static, pre-converted GeoJSON)

Sources:
- ADIZ boundaries: publicly confirmed military geography (IISS, AIP publications)
- EEZ/territorial waters: MarineRegions.org shapefiles (CC BY 4.0), converted offline

Render as MapLibre line layers — ADIZ as dashed amber, EEZ as dashed grey.
Toggle under INFRASTRUCTURE in LayerControl.

---

## Geofenced Alert Zones (`services/geofence.service.ts`)

Library: `@turf/boolean-point-in-polygon` + `rbush` (R-tree spatial index)

State stored in Zustand + URL-encoded as base64 GeoJSON in `?geofences=` param.

UI: "Draw Zone" button → MapLibre draw mode → creates polygon
Polygon renders: dashed amber border, transparent fill, right-click to delete/rename.

On each WebSocket update: check if tracked asset crossed a geofence boundary.
ENTER events dispatched into the existing alert tier system.
Military aircraft entering a zone = IMMEDIATE tier.

---

## Geotagged Media Layer (`MediaLayer.tsx`)

Camera icon markers on theater map when `telegram_media.exif_lat` is present.
`IconLayer`: camera icon, `--text-secondary` color, 16px size.
Click → MediaCard popup (same style as incident popups).
Layer group: SIGNALS. Toggle: "Media Locations".

---

## SAM Engagement Rings (`data/sam-positions.json`)

Static database — update manually from public OSINT only.
```typescript
interface SamPosition {
  id: string
  lat: number; lon: number
  system: string        // 'S-300', 'Patriot PAC-3', 'Iron Dome'
  range_km: number
  side: 'US' | 'Allied' | 'Iran' | 'Israel' | 'Russia'
  theater: string       // conflict slug
  status: 'active' | 'suspected' | 'historical'
  source: string        // 'OSINT confirmed' | 'IISS Military Balance'
}
```

| Side | Systems | Range |
|---|---|---|
| Iran | S-300, Bavar-373, HQ-9, Tor-M1 | 120km, 200km, 100km, 15km |
| CENTCOM | Patriot PAC-3, THAAD, SM-3 (sea) | 160km, 200km, variable |
| Israel | Iron Dome, Arrow-3, David's Sling | 70km, 2,400km, 300km |

Ring color: blue = US/Allied · red = adversary · green = Israel

---

## Deck.gl Color Pattern (canonical)

Colors always derive from `ConflictConfig.parties` — never hardcoded:
```typescript
const partyColorMap = useMemo(() =>
  Object.fromEntries(
    conflict.parties.map(p => [p.shortCode, hexToRgba(p.color)])
  ),
  [conflict.parties]
)
// Usage: getColor: d => partyColorMap[d.side] ?? [150, 150, 150, 255]
```

---

## Full Design Token System
```css
/* Backgrounds */
--bg-base:        #0a0e1a
--bg-surface:     #0d1224
--bg-elevated:    #111827
--bg-overlay:     #1a2035
--border:         rgba(255,255,255,0.08)
--border-bright:  rgba(255,255,255,0.16)

/* Text */
--text-primary:   #e2e8f0
--text-secondary: #94a3b8
--text-muted:     #475569
--text-accent:    #00b0ff

/* Severity */
--sev-critical:   #ef4444
--sev-high:       #f97316
--sev-medium:     #eab308
--sev-low:        #22c55e
--sev-info:       #22c55e

/* Party */
--us-color:       #00b0ff
--ir-color:       #ef4444
--il-color:       #22c55e
--unknown-color:  #94a3b8

/* Financial */
--price-up:       #26a69a
--price-down:     #ef5350
--chart-line:     #2962ff

/* Map */
--map-nuclear:    #a855f7
--map-sam:        rgba(239,68,68,0.15)
--map-lane:       rgba(148,163,184,0.4)
--map-chokepoint: #f97316
```

### Typography
```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Share+Tech+Mono&display=swap');

--font-display: 'Orbitron', monospace
--font-mono:    'Share Tech Mono', monospace

--text-xs:   11px   --text-sm:   13px   --text-base: 14px
--text-lg:   16px   --text-xl:   20px   --text-2xl:  28px
--tracking-wide: 0.05em   --tracking-wider: 0.1em   --tracking-widest: 0.15em
```

### Hard Rules
- No `rounded-xl` — max `rounded` (4px) anywhere
- No `box-shadow` — use `border` only
- No loading spinners — skeleton pulse in `--bg-surface` color
- No sans-serif fonts (no Inter, Geist, etc.)
- No empty state illustrations — plain monospace `// NO DATA`