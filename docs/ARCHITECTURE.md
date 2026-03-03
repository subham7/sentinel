# SENTINEL — Architecture Reference

Cache strategy, API design, database schema, and key implementation patterns.

---

## Three-Tier Cache (`services/cache.ts`)

Every upstream API call must go through `cachedFetchJson`. Never call external
APIs directly from a route handler or component.
```typescript
const inflight = new Map<string, Promise<any>>()

export async function cachedFetchJson<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
  staleKey?: string
): Promise<{ data: T; cacheStatus: 'HIT' | 'MISS' | 'STALE' | 'DEDUP' }> {
  // Tier 1: Redis fresh
  const cached = await redis.get<T>(key)
  if (cached) return { data: cached, cacheStatus: 'HIT' }

  // Tier 2: In-flight dedup (stampede prevention)
  if (inflight.has(key)) {
    const data = await inflight.get(key)
    return { data, cacheStatus: 'DEDUP' }
  }

  const promise = fetcher().catch(async (err) => {
    // Tier 3: Redis stale fallback
    if (staleKey) {
      const stale = await redis.get<T>(staleKey)
      if (stale) return stale
    }
    throw err
  })

  inflight.set(key, promise)
  try {
    const data = await promise
    await redis.set(key, data, { ex: ttlSeconds })
    if (staleKey) await redis.set(staleKey, data, { ex: 86400 })
    return { data, cacheStatus: 'MISS' }
  } finally {
    inflight.delete(key)
  }
}
```

### Redis Key Conventions
```
aircraft:{slug}              TTL 30s    Current aircraft positions
vessels:{slug}               TTL 60s    Current vessel positions
theater:{slug}               TTL 5m     Theater posture assessment
theater:{slug}:stale         TTL 24h    Stale posture fallback
sitrep:{slug}                TTL 1h     AI situation report
morning-brief:{slug}:{date}  TTL 23h    Daily BLUF brief
rhetoric:{slug}              TTL 4h     Escalatory language score
anomaly:baseline:{theater}:{event_type}:{dow}:{hour}  Welford state
classify:{sha256}            TTL 24h    Groq classification result
incidents:trend:{slug}       TTL 1h     30-day incident trend data
contracts:polymarket         TTL 10m    Active Polymarket contracts
contracts:kalshi             TTL 10m    Active Kalshi contracts
economic:oil                 TTL 1h     EIA Brent + WTI prices
economic:rial                TTL 30m    IRR/USD parallel rate
economic:ils                 TTL 1h     ILS/USD rate
financial:fred:{series}      TTL 24h    FRED time series
financial:equities           TTL 5m     Defense stock quotes
freshness:{source}           TTL none   ISO timestamp of last successful fetch
```

---

## Circuit Breaker (`services/circuit-breaker.ts`)

Each upstream API has its own circuit breaker. After 3 failures: open for 5
minutes, return stale cache. After cooldown: half-open, try one request.

States: `CLOSED` (normal) → `OPEN` (failing, returning stale) → `HALF_OPEN` (testing)

---

## API Routes

All data endpoints are scoped by conflict slug. Unknown slugs return 404.
```
GET  /health
GET  /api/conflicts                              → ConflictConfig[] + live stats
GET  /api/conflicts/:slug                        → ConflictConfig + live stats | 404

GET  /api/conflicts/:slug/aircraft               → Aircraft[]
WS   /ws/conflicts/:slug/aircraft                → Aircraft[] every 5s
GET  /api/conflicts/:slug/vessels                → Vessel[]
WS   /ws/conflicts/:slug/vessels                 → Vessel[] every 10s
GET  /api/conflicts/:slug/incidents              → Incident[] (hours, severity, type, bbox)
GET  /api/conflicts/:slug/incidents/geojson      → GeoJSON FeatureCollection
SSE  /api/conflicts/:slug/incidents/stream       → new events only
GET  /api/conflicts/:slug/incidents/trend?days=  → [{date, count, avgSeverity}]
GET  /api/conflicts/:slug/theater                → TheaterPosture
GET  /api/conflicts/:slug/sitrep                 → SitrepReport (cached 1h)
GET  /api/conflicts/:slug/morning-brief          → MorningBrief (cached 23h)
GET  /api/conflicts/:slug/rhetoric               → RhetoricScore (cached 4h)
GET  /api/conflicts/:slug/anomalies              → AnomalyAlert[]
GET  /api/conflicts/:slug/entity-graph           → { nodes, edges }
GET  /api/conflicts/:slug/media                  → paginated TelegramMedia[]
SSE  /api/conflicts/:slug/media/stream           → new media items

GET  /api/economic/oil                           → { brent, wti }
GET  /api/economic/rial                          → { usd_irr, updated_at }
GET  /api/financial/fred/:series                 → FRED time series
GET  /api/financial/equities                     → Defense stock quotes
GET  /api/financial/currencies                   → { ils, rub, irr }
GET  /api/markets/polymarket                     → Active geopolitical contracts
GET  /api/markets/kalshi                         → Active geopolitical contracts
GET  /api/signals/internet/:countryCode          → Internet health (CF+IODA+OONI)
GET  /api/health/freshness                       → Per-source freshness status
```

---

## Database Schema (`db/schema.sql`)
```sql
CREATE TABLE incidents (
  id              TEXT PRIMARY KEY,
  conflict_slugs  TEXT NOT NULL,      -- JSON array: '["us-iran","israel-gaza"]'
  source          TEXT NOT NULL,      -- 'gdelt' | 'acled' | 'telegram' | 'manual'
  source_id       TEXT,
  timestamp       TEXT NOT NULL,
  lat             REAL,
  lon             REAL,
  location_name   TEXT,
  category        TEXT NOT NULL,
  severity        INTEGER NOT NULL,   -- 1-5
  title           TEXT NOT NULL,
  summary         TEXT,
  actors          TEXT,               -- JSON array
  source_url      TEXT,
  confidence      REAL,
  raw             TEXT,
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE incident_entities (
  incident_id     TEXT REFERENCES incidents(id),
  entity_type     TEXT,               -- 'actor'|'location'|'weapon'|'event'
  entity_value    TEXT,
  confidence      REAL,
  PRIMARY KEY (incident_id, entity_type, entity_value)
);

CREATE TABLE aircraft_trails (
  icao24          TEXT NOT NULL,
  conflict_slug   TEXT NOT NULL,
  callsign        TEXT,
  lat             REAL NOT NULL,
  lon             REAL NOT NULL,
  altitude        INTEGER,
  heading         INTEGER,
  speed           INTEGER,
  timestamp       INTEGER NOT NULL,
  PRIMARY KEY (icao24, timestamp)
);

CREATE TABLE vessel_trails (
  mmsi            TEXT NOT NULL,
  conflict_slug   TEXT NOT NULL,
  name            TEXT,
  lat             REAL NOT NULL,
  lon             REAL NOT NULL,
  heading         INTEGER,
  speed           REAL,
  timestamp       INTEGER NOT NULL,
  PRIMARY KEY (mmsi, timestamp)
);

CREATE TABLE ais_dark_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mmsi            TEXT NOT NULL,
  conflict_slug   TEXT NOT NULL,
  last_lat        REAL,
  last_lon        REAL,
  gap_started_at  INTEGER NOT NULL,
  gap_ended_at    INTEGER,
  gap_minutes     INTEGER
);

CREATE TABLE telegram_posts (
  id              TEXT PRIMARY KEY,   -- 'channel/messageId'
  conflict_slug   TEXT NOT NULL,
  channel         TEXT NOT NULL,
  text            TEXT,
  post_url        TEXT,
  posted_at       TEXT,
  classified      INTEGER DEFAULT 0,
  incident_id     TEXT REFERENCES incidents(id),
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE telegram_media (
  id              TEXT PRIMARY KEY,   -- '{channel}:{message_id}:{type}:{index}'
  conflict_slug   TEXT NOT NULL,
  channel         TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  media_type      TEXT NOT NULL,      -- 'photo'|'video'|'document'
  r2_key          TEXT NOT NULL,
  thumbnail_key   TEXT,
  width           INTEGER,
  height          INTEGER,
  duration_secs   INTEGER,
  file_size       INTEGER,
  phash           TEXT,
  exif_lat        REAL,
  exif_lon        REAL,
  posted_at       TEXT NOT NULL,
  caption         TEXT,
  nsfw_score      REAL,
  is_visible      INTEGER DEFAULT 1,
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE data_freshness (
  source_id       TEXT PRIMARY KEY,
  conflict_slug   TEXT,
  last_updated    INTEGER,
  last_status     TEXT,               -- 'fresh'|'stale'|'error'
  error_message   TEXT
);

-- Indexes
CREATE INDEX idx_incidents_conflict  ON incidents(conflict_slugs);
CREATE INDEX idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX idx_incidents_geo       ON incidents(lat, lon);
CREATE INDEX idx_trails_conflict     ON aircraft_trails(conflict_slug, timestamp);
CREATE INDEX idx_media_conflict      ON telegram_media(conflict_slug, posted_at DESC);
CREATE INDEX idx_media_geo           ON telegram_media(exif_lat, exif_lon)
  WHERE exif_lat IS NOT NULL;
```

---

## Worker Pattern

All workers iterate `ALL_CONFLICTS` — never hardcode a theater.
```typescript
// Example: apps/sentinel-api/src/workers/adsb.worker.ts
import { ALL_CONFLICTS } from '@sentinel/shared/conflicts'

export async function runADSBWorker() {
  await Promise.all(
    ALL_CONFLICTS
      .filter(c => c.dataSources.adsb.enabled)
      .flatMap(conflict =>
        conflict.dataSources.adsb.queryPoints.map(async ({ lat, lon, radiusNm }) => {
          const raw = await fetchWithCircuitBreaker(
            `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${radiusNm}`
          )
          const aircraft = raw.ac
            .filter(ac => isInBounds(ac, conflict.map.bounds))
            .map(ac => classifyAircraft(ac, hexDb))
          await redis.set(`aircraft:${conflict.slug}`, aircraft, { ex: 30 })
        })
      )
  )
}
```

---

## URL-Encoded Map State

All map state is in the URL — views are shareable and bookmarkable.
```
/conflicts/us-iran?lat=27&lon=51&zoom=5&layers=aircraft,vessels,incidents&satdate=2026-02-28
```