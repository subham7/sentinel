// Core data types shared across frontend and backend

export type AircraftSide = 'US' | 'ALLIED' | 'IR' | 'IL' | 'UNKNOWN'
export type AircraftType = 'fighter' | 'tanker' | 'isr' | 'transport' | 'uav' | 'unknown'

export interface Aircraft {
  icao24: string
  callsign: string
  lat: number
  lon: number
  altitude: number      // feet
  heading: number       // degrees
  speed: number         // knots
  type: AircraftType
  side: AircraftSide
  mil: boolean
  last_seen: number     // unix ms
  trail: [number, number][]  // [lon, lat] pairs
}

export type VesselSide = 'US' | 'ALLIED' | 'IR' | 'IL' | 'UNKNOWN'
export type VesselType = 'warship' | 'tanker' | 'cargo' | 'fast_boat' | 'submarine' | 'unknown'

export interface Vessel {
  mmsi: string
  name: string
  lat: number
  lon: number
  heading: number
  speed: number         // knots
  type: VesselType
  side: VesselSide
  flag: string          // ISO 3166-1 alpha-3
  ais_dark: boolean
  sanctioned: boolean
  last_seen: number
}

export type IncidentCategory =
  | 'armed_conflict' | 'explosion' | 'missile' | 'drone'
  | 'cyber' | 'naval' | 'protest' | 'diplomatic' | 'nuclear' | 'other'

export type IncidentSeverity = 1 | 2 | 3 | 4 | 5

export type IncidentSource = 'gdelt' | 'acled' | 'telegram' | 'manual'

export interface Incident {
  id: string
  conflict_slugs: string[]
  source: IncidentSource
  timestamp: string     // ISO 8601
  lat: number
  lon: number
  location_name: string
  category: IncidentCategory
  severity: IncidentSeverity
  title: string
  summary: string
  actors: string[]
  source_url?: string
  confidence: number    // 0–1
}

export interface TheaterPosture {
  slug: string
  theater: string
  level: 'normal' | 'elevated' | 'high' | 'critical'
  us_aircraft_count: number
  ir_aircraft_count: number
  us_vessels: number
  ir_vessels: number
  active_incidents_24h: number
  strike_package_detected: boolean
  last_updated: number
}

export type DataSourceStatus = 'fresh' | 'stale' | 'very_stale' | 'error' | 'disabled'

export interface DataSource {
  id: string
  name: string
  conflict_slug: string | null
  last_updated: number | null
  status: DataSourceStatus
  latency_ms?: number
}
