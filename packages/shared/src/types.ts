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

export type IncidentSource = 'gdelt' | 'acled' | 'telegram' | 'manual' | 'rss' | 'gnews' | 'newsdata'

export interface Incident {
  id: string
  conflict_slugs: string[]
  source: IncidentSource
  source_id?: string    // opaque id: e.g. 'rss:{feedId}:{hash}' for RSS
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

export interface OilPriceData {
  brent:        number          // USD/barrel
  wti:          number
  brent_change: number          // $ vs previous day
  wti_change:   number
  history:      number[]        // last N daily brent closes, oldest first
  updated_at:   number          // unix ms
}

export interface RialRateData {
  usd_irr:    number            // IRR per 1 USD (parallel market)
  change_24h: number            // % change
  updated_at: number
}

export interface TelegramMedia {
  id:            string           // '{channel}:{message_id}'
  conflict_slug: string
  channel:       string
  message_id:    number
  media_type:    'photo' | 'video'
  url:           string           // direct CDN URL
  thumbnail_url: string | null
  posted_at:     string           // ISO 8601
  caption:       string | null
  view_count:    number
}

export interface MorningBrief {
  slug:               string
  date:               string      // YYYY-MM-DD UTC
  bluf:               string      // Bottom Line Up Front
  judgments:          { confidence: 'HIGH' | 'MODERATE' | 'LOW'; text: string }[]
  evidence:           string
  outlook:            string
  overall_confidence: 'HIGH' | 'MODERATE' | 'LOW'
  sources:            string
  generated_at:       number      // unix ms
  model:              string
}

export interface RhetoricScore {
  slug:         string
  score:        number    // 0–100
  label:        'ROUTINE' | 'ELEVATED' | 'THREATENING' | 'CRISIS' | 'IMMINENT'
  key_phrases:  string[]
  post_count:   number
  generated_at: number
}

export interface EntityGraphNode {
  id:        string
  label:     string
  frequency: number
}

export interface EntityGraphEdge {
  source: string
  target: string
  weight: number
}

export interface EntityGraph {
  nodes:        EntityGraphNode[]
  edges:        EntityGraphEdge[]
  generated_at: number
}

// ── Financial Intelligence types ────────────────────────────────────────────

export interface OilFuturesData {
  spot:        number          // RCLC1 — front month WTI
  m2:          number          // RCLC2
  m3:          number          // RCLC3
  m4:          number          // RCLC4
  war_premium: number          // % backwardation: (spot-m3)/m3*100
  updated_at:  number
}

export interface FredPoint {
  date:  string   // YYYY-MM-DD
  value: number
}

export interface FredData {
  series_id:  string
  title:      string
  value:      number
  prev:       number
  change_pct: number
  history:    FredPoint[]     // last 30 values, oldest → newest
  updated_at: number
}

export interface EquityQuote {
  ticker:     string
  name:       string
  price:      number
  change_pct: number          // % change vs prev close
}

export interface EquitiesData {
  quotes:        EquityQuote[]
  market_status: 'PRE_MARKET' | 'REGULAR' | 'POST_MARKET' | 'CLOSED'
  updated_at:    number
}

export interface CurrencyRate {
  pair:       string          // e.g. 'ILS/USD'
  rate:       number          // units of quote per 1 USD
  change_pct: number          // % change vs 24h ago
  alert:      boolean         // >2% single-day move
}

export interface CurrenciesData {
  rates:      CurrencyRate[]
  updated_at: number
}

export interface PortWatchChokepoint {
  name:             string
  location_code:    number
  disruption_index: number
  vessel_count:     number
  status:           'NORMAL' | 'ELEVATED' | 'DISRUPTED'
}

export interface PortWatchData {
  chokepoints: PortWatchChokepoint[]
  updated_at:  number
}

// ── Prediction Markets ──────────────────────────────────────────────────────

export interface PredictionMarket {
  id:              string
  source:          'polymarket' | 'kalshi'
  question:        string
  probability:     number          // 0–1 YES probability
  volume_24h:      number          // USD
  volume_total:    number          // USD
  close_time:      string | null   // ISO 8601
  active:          boolean
  url:             string
  relevance_score: number          // 0–1 keyword+semantic match
  matched_keywords: string[]       // which conflict keywords triggered this
}

export interface MarketsData {
  markets:    PredictionMarket[]
  updated_at: number
}

export interface SitrepReport {
  slug:           string
  summary:        string          // 2–3 AI sentences
  threat_level:   'normal' | 'elevated' | 'high' | 'critical'
  key_events:     string[]        // 3–5 bullet points
  force_posture:  string          // 1 sentence
  generated_at:   number          // unix ms
  model:          string          // e.g. 'llama-3.3-70b-versatile'
}
