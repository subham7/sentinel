-- SENTINEL database schema
-- All CREATE statements use IF NOT EXISTS for idempotent startup

CREATE TABLE IF NOT EXISTS incidents (
  id              TEXT PRIMARY KEY,
  conflict_slugs  TEXT NOT NULL,      -- JSON array: '["us-iran","israel-gaza"]'
  source          TEXT NOT NULL,      -- 'gdelt' | 'acled' | 'telegram' | 'manual'
  source_id       TEXT,
  timestamp       TEXT NOT NULL,      -- ISO 8601
  lat             REAL,
  lon             REAL,
  location_name   TEXT,
  category        TEXT NOT NULL,
  severity        INTEGER NOT NULL,   -- 1-5
  title           TEXT NOT NULL,
  summary         TEXT,
  actors          TEXT,               -- JSON array
  source_url      TEXT,
  confidence      REAL,               -- 0.0-1.0
  raw             TEXT,               -- Original JSON from source
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_incidents_conflict  ON incidents(conflict_slugs);
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX IF NOT EXISTS idx_incidents_geo       ON incidents(lat, lon);

CREATE TABLE IF NOT EXISTS aircraft_trails (
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

CREATE INDEX IF NOT EXISTS idx_trails_conflict ON aircraft_trails(conflict_slug, timestamp);

CREATE TABLE IF NOT EXISTS vessel_trails (
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

CREATE TABLE IF NOT EXISTS ais_dark_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mmsi            TEXT NOT NULL,
  conflict_slug   TEXT NOT NULL,
  last_lat        REAL,
  last_lon        REAL,
  gap_started_at  INTEGER NOT NULL,
  gap_ended_at    INTEGER,
  gap_minutes     INTEGER
);

CREATE TABLE IF NOT EXISTS ais_sts_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_slug   TEXT NOT NULL,
  mmsi_a          TEXT NOT NULL,
  mmsi_b          TEXT NOT NULL,
  lat             REAL,
  lon             REAL,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  duration_min    INTEGER,
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS telegram_posts (
  id              TEXT PRIMARY KEY,   -- 'channel/messageId'
  conflict_slug   TEXT NOT NULL,
  channel         TEXT NOT NULL,
  text            TEXT,
  post_url        TEXT,
  posted_at       TEXT,
  classified      INTEGER DEFAULT 0,  -- 0 | 1
  incident_id     TEXT REFERENCES incidents(id),
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS telegram_media (
  id              TEXT PRIMARY KEY,       -- '{channel}:{message_id}'
  conflict_slug   TEXT NOT NULL,
  channel         TEXT NOT NULL,
  message_id      INTEGER NOT NULL,
  media_type      TEXT NOT NULL,          -- 'photo' | 'video'
  url             TEXT NOT NULL,          -- CDN URL
  thumbnail_url   TEXT,
  posted_at       TEXT NOT NULL,
  caption         TEXT,
  view_count      INTEGER DEFAULT 0,
  is_visible      INTEGER DEFAULT 1,
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_telegram_media_conflict ON telegram_media(conflict_slug, posted_at DESC);

CREATE TABLE IF NOT EXISTS data_freshness (
  source_id       TEXT PRIMARY KEY,
  conflict_slug   TEXT,               -- NULL = global source
  last_updated    INTEGER,
  last_status     TEXT,               -- 'fresh' | 'stale' | 'error'
  error_message   TEXT
);

CREATE TABLE IF NOT EXISTS nuclear_site_status (
  site_id       TEXT PRIMARY KEY,
  conflict_slug TEXT NOT NULL,
  name          TEXT,
  status        TEXT,        -- 'active' | 'suspected' | 'modified' | 'operational' | 'shutdown'
  notes         TEXT,
  source        TEXT DEFAULT 'iaea',
  updated_at    INTEGER DEFAULT (unixepoch())
);
