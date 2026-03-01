# SENTINEL — Claude Code Reference

Multi-conflict geospatial intelligence platform. Tracks military aircraft, naval vessels,
and OSINT incidents across active conflict theaters in real time.

**Current status:** Phase 5 ✅ (Phase 6 upcoming)

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Design Reference](#design-reference)
3. [Tech Stack](#tech-stack)
4. [Repository Structure](#repository-structure)
5. [Architecture Principles](#architecture-principles)
6. [Conflict Configuration System](#conflict-configuration-system)
7. [API Design](#api-design)
8. [Database Schema](#database-schema)
9. [Environment Variables](#environment-variables)
10. [Development Phases](#development-phases)
11. [Data Sources Reference](#data-sources-reference)
12. [Key Patterns](#key-patterns)
13. [Known Limitations](#known-limitations)

---

## Project Overview

SENTINEL is a Palantir-style intelligence dashboard for monitoring active conflict theaters.
Users land on a home page (`/conflicts`) showing a globe and conflict cards, then navigate
into individual theater dashboards (`/conflicts/us-iran`, `/conflicts/israel-gaza`, etc.).

**Active conflicts:**
- `us-iran` — US–Iran / Persian Gulf / CENTCOM theater
- `israel-gaza` — Israel–Gaza / Levant / regional escalation

**Design goal:** Adding a new conflict = adding one `ConflictConfig` object. Zero other
code changes. The workers, API routes, frontend, and home page all derive from the config
registry automatically.

---

## Design Reference

### Prototype file
`docs/design-reference/conflict-dashboard.jsx`

This is the approved visual design. It is the source of truth for colors, typography,
component structure, and overall aesthetic. Do not redesign from scratch — extract and
port from this file when building any UI component.

**How to use it:**
- Open it before building any new component
- Match colors exactly (use the token values below, not approximations)
- Match spacing, border radius, and font sizes from the prototype
- If a component exists in the prototype, port it — don't reinvent it
- If a component doesn't exist in the prototype, follow the same visual language

### Visual language: military operations terminal

SENTINEL is designed to look like a real-time military command and control interface —
not a SaaS dashboard. Every design decision should reinforce this. Think: classified
briefing room display, not analytics product.

**Core aesthetic principles:**
- Near-black backgrounds, never pure white UI elements
- Monospace and geometric fonts everywhere (no rounded consumer fonts)
- Tight, dense information layout — no wasted whitespace
- Muted colors with high-contrast accent pops for alerts
- Borders and dividers are visible but thin (1px, low opacity)
- Animations are purposeful: pulsing = live/alert, not decorative

### Color tokens

```css
/* Background layers */
--bg-base:        #0a0e1a   /* Page background — near black with blue tint */
--bg-surface:     #0d1224   /* Panel background */
--bg-elevated:    #111827   /* Cards, dropdowns, tooltips */
--bg-overlay:     #1a2035   /* Hover states, selected rows */
--border:         rgba(255,255,255,0.08)   /* Subtle panel borders */
--border-bright:  rgba(255,255,255,0.16)   /* Focused/active borders */

/* Text */
--text-primary:   #e2e8f0   /* Main text */
--text-secondary: #94a3b8   /* Labels, metadata */
--text-muted:     #475569   /* Timestamps, disabled */
--text-accent:    #00b0ff   /* Links, interactive elements */

/* Severity / alert scale */
--sev-info:       #22c55e   /* Severity 1 — green */
--sev-low:        #84cc16   /* Severity 2 — lime */
--sev-medium:     #eab308   /* Severity 3 — amber */
--sev-high:       #f97316   /* Severity 4 — orange */
--sev-critical:   #ef4444   /* Severity 5 — red */

/* Party colors (used for aircraft/vessel icons) */
--us-color:       #00b0ff   /* US / Allied — blue */
--ir-color:       #ef4444   /* Iran / IRGC — red */
--il-color:       #22c55e   /* Israel — green */
--unknown-color:  #94a3b8   /* Unknown — grey */

/* Intensity (conflict card badges) */
--intensity-critical: #ef4444
--intensity-high:     #f97316
--intensity-elevated: #eab308
--intensity-low:      #22c55e

/* Map accent colors */
--map-nuclear:    #a855f7   /* Nuclear site markers — purple */
--map-sam:        rgba(239,68,68,0.15)   /* SAM coverage fill */
--map-lane:       rgba(148,163,184,0.4)  /* Shipping lanes */
--map-chokepoint: #f97316   /* Chokepoint pulse */
```

### Typography

```css
/* Import in layout.tsx */
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Share+Tech+Mono&display=swap');

--font-display:   'Orbitron', monospace      /* Headers, conflict names, key metrics */
--font-mono:      'Share Tech Mono', monospace  /* Data values, coordinates, callsigns, timestamps */
--font-body:      'Share Tech Mono', monospace  /* All body text — stay monospace throughout */

/* Scale */
--text-xs:   11px   /* Timestamps, metadata, axis labels */
--text-sm:   13px   /* Incident feed items, table rows */
--text-base: 14px   /* Default body */
--text-lg:   16px   /* Panel headers */
--text-xl:   20px   /* Section titles */
--text-2xl:  28px   /* Conflict name on theater header */

/* Letter spacing — wider than normal for military feel */
--tracking-wide:   0.05em   /* Headers */
--tracking-wider:  0.1em    /* Uppercase labels, badges */
--tracking-widest: 0.15em   /* ALL-CAPS status indicators */
```

### Component patterns (from prototype)

**Panel:**
```
background: --bg-surface
border: 1px solid --border
border-radius: 4px        ← tight, not rounded
padding: 12px 16px
header: uppercase, --text-secondary, --tracking-wider, --text-xs, border-bottom
```

**Severity badge:**
```
background: color at 15% opacity
border: 1px solid color at 40% opacity
color: full severity color
text: uppercase monospace, --text-xs, --tracking-widest
padding: 2px 6px
border-radius: 2px        ← almost square
```

**Data value display:**
```
label: --text-secondary, --text-xs, uppercase
value: --text-primary, --font-mono, --text-lg
layout: stacked vertically, tight gap
```

**Status indicator (live dot):**
```
● LIVE     → green dot + green text, pulse animation
● STALE    → amber dot + amber text
● ERROR    → red dot + red text
dot size: 6px circle
pulse: opacity 1→0.4→1, 2s infinite, only when LIVE
```

**Incident feed item:**
```
border-left: 3px solid <severity-color>
padding: 8px 12px
background: transparent → --bg-overlay on hover
timestamp: --text-muted, --text-xs, --font-mono, right-aligned
title: --text-primary, --text-sm
source badge: inline, --text-xs
cursor: pointer (flies map to location on click)
```

**Zulu clock (theater header):**
```
format: "2026-02-28 · 14:32:07Z"
font: --font-mono
color: --text-secondary
update: every second via setInterval
```

**Map popup (click on aircraft/vessel/incident):**
```
background: --bg-elevated
border: 1px solid --border-bright
border-radius: 4px
padding: 12px
max-width: 280px
field layout: label (--text-secondary) + value (--text-primary) pairs
```

### What NOT to do

- No `rounded-xl` or `rounded-2xl` — max `rounded` (4px) anywhere
- No white backgrounds, no light mode styling
- No sans-serif fonts (Geist, Inter, etc.) — monospace only
- No gradient backgrounds on panels (only on the globe/map itself)
- No card shadows (`box-shadow`) — use borders instead
- No loading spinners — use skeleton pulse animations in the same color as the panel
- No empty state illustrations — use plain monospace text (`// NO DATA`)
- No toast notifications for non-critical updates — use the DataFreshness status bar

### Home page specific

The globe on `/conflicts` should:
- Render with `projection: 'globe'` in MapLibre
- Use CARTO Dark Matter no-labels as the base
- Conflict zones: filled polygon with `intensity` color at 20% opacity,
  border at 60% opacity, subtle pulse animation driven by intensity
- Auto-rotate at 0.5°/s when no interaction, freeze on hover/touch
- Hovering a conflict card highlights its polygon (increase opacity)

The conflict cards should:
- Stack 2-wide on desktop (`md:grid-cols-2`), 1-wide on mobile
- `accentColor` from `conflict.card.accentColor` used as left border accent
- Intensity bar: thin 2px line, colored by intensity level, full-width at bottom of card
- Party flags rendered as emoji, horizontally spaced
- Metric values in `--font-mono`, labels in uppercase `--text-secondary`
- Hover: `--bg-overlay` background, `--border-bright` border

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Map | MapLibre GL JS + deck.gl (WebGL layers) |
| Map tiles | CARTO Dark Matter (no auth): `https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json` |
| Backend | Fastify (Node.js), TypeScript |
| Cache | Redis via Upstash (`@upstash/redis`) |
| Database | SQLite (`better-sqlite3`) → PostgreSQL + PostGIS when scaling |
| State | Zustand (global), TanStack Query (server state) |
| AI | Groq (`llama-3.1-8b-instant` for classification, `llama-3.3-70b-versatile` for sitrep) |
| Analyst chat | Anthropic Claude (`claude-sonnet-4-6`) with tool use |
| Monorepo | Turborepo with npm workspaces |
| Fonts | Share Tech Mono, Orbitron (military ops aesthetic) |

---

## Repository Structure

```
sentinel/
├── docs/
│   └── design-reference/
│       └── conflict-dashboard.jsx  # ← APPROVED DESIGN. Read before writing any UI code.
├── apps/
│   ├── sentinel-fe/                    # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── page.tsx                # → redirect to /conflicts
│   │   │   ├── layout.tsx              # Root layout (fonts, metadata)
│   │   │   └── conflicts/
│   │   │       ├── page.tsx            # Home: globe + conflict cards
│   │   │       └── [slug]/
│   │   │           └── page.tsx        # Theater dashboard (dynamic)
│   │   ├── components/
│   │   │   ├── map/
│   │   │   │   ├── ConflictGlobe.tsx   # Home page globe
│   │   │   │   ├── TheaterMap.tsx      # Per-conflict MapLibre + deck.gl
│   │   │   │   ├── layers/             # Individual deck.gl layer components
│   │   │   │   │   ├── AircraftLayer.tsx
│   │   │   │   │   ├── VesselLayer.tsx
│   │   │   │   │   ├── IncidentLayer.tsx
│   │   │   │   │   ├── HeatmapLayer.tsx
│   │   │   │   │   ├── BasesLayer.tsx
│   │   │   │   │   ├── NuclearLayer.tsx
│   │   │   │   │   ├── SamRingsLayer.tsx
│   │   │   │   │   └── ShippingLanesLayer.tsx
│   │   │   │   └── LayerControl.tsx    # Layer toggle panel
│   │   │   ├── panels/
│   │   │   │   ├── IncidentFeed.tsx    # Real-time incident list
│   │   │   │   ├── TrackList.tsx       # Aircraft + vessel list
│   │   │   │   ├── TheaterPosture.tsx  # Posture assessment panel
│   │   │   │   ├── SitrepPanel.tsx     # AI situation report
│   │   │   │   ├── AnalystChat.tsx     # Claude tool-use chat
│   │   │   │   ├── HormuzWidget.tsx    # Strait of Hormuz (us-iran only)
│   │   │   │   ├── OilPriceWidget.tsx  # Oil price (us-iran only)
│   │   │   │   └── DataFreshness.tsx   # Source health indicators
│   │   │   └── ui/
│   │   │       ├── ConflictCard.tsx    # Home page conflict card
│   │   │       ├── SeverityBadge.tsx
│   │   │       └── IntensityBar.tsx
│   │   └── hooks/
│   │       ├── useAircraftWebSocket.ts
│   │       ├── useVesselWebSocket.ts
│   │       ├── useIncidentSSE.ts
│   │       └── useConflictConfig.ts
│   │
│   └── sentinel-api/                   # Fastify backend
│       └── src/
│           ├── server.ts               # Fastify app setup + plugin registration
│           ├── routes/
│           │   ├── health.ts           # GET /health
│           │   ├── conflicts.ts        # GET /api/conflicts, GET /api/conflicts/:slug
│           │   ├── aircraft.ts         # GET + WS /api/conflicts/:slug/aircraft
│           │   ├── vessels.ts          # GET + WS /api/conflicts/:slug/vessels
│           │   ├── incidents.ts        # GET + SSE /api/conflicts/:slug/incidents
│           │   ├── theater.ts          # GET /api/conflicts/:slug/theater
│           │   ├── sitrep.ts           # GET /api/conflicts/:slug/sitrep
│           │   └── economic.ts         # GET /api/economic/oil, /rial
│           ├── workers/
│           │   ├── index.ts            # Starts all workers on server boot
│           │   ├── adsb.worker.ts      # Polls adsb.fi + airplanes.live (ALL conflicts)
│           │   ├── ais.worker.ts       # AISStream WebSocket (ALL conflicts)
│           │   ├── gdelt.worker.ts     # GDELT polling (ALL conflicts)
│           │   ├── acled.worker.ts     # ACLED polling (ALL conflicts)
│           │   ├── telegram.worker.ts  # Telegram scraper (ALL conflicts)
│           │   └── sitrep.worker.ts    # Hourly AI sitrep generator
│           ├── services/
│           │   ├── cache.ts            # cachedFetchJson + stampede prevention
│           │   ├── classification.ts   # Groq AI 3-pass classifier
│           │   ├── deduplication.ts    # Haversine + time-window dedup
│           │   ├── vessel-id.ts        # MMSI analysis + AIS-dark detection
│           │   └── circuit-breaker.ts  # Per-feed circuit breaker
│           └── db/
│               ├── index.ts            # SQLite connection
│               ├── schema.sql          # Table definitions
│               └── queries.ts          # Typed query helpers
│
└── packages/
    └── shared/
        ├── types.ts                    # Aircraft, Vessel, Incident, TheaterPosture
        ├── conflicts.ts                # ConflictConfig interface + ALL_CONFLICTS registry
        ├── military-data.ts            # Bases, SAM sites, nuclear sites
        ├── callsign-patterns.ts        # 120+ military callsign prefixes
        └── icao-types.ts               # ICAO type code → fighter/tanker/ISR/transport
```

---

## Architecture Principles

### 1. Config-driven conflicts
Never hardcode a theater name, bounding box, or data source inside a component or worker.
Everything derives from `ConflictConfig` in `packages/shared/conflicts.ts`. To add a new
conflict, add one config object to `ALL_CONFLICTS`. That's it.

### 2. One shared backend, filtered data
Workers iterate `ALL_CONFLICTS` and write conflict-scoped Redis keys (`aircraft:us-iran`,
`vessels:israel-gaza`, etc.). API routes read these keys by slug. No separate backend
instances per conflict.

### 3. Stale > blank
Every API endpoint must return something even when upstream APIs are down. Priority order:
`fresh Redis cache → stale Redis cache (24h) → last-resort backup cache (7 days) → empty array`
Never return a 500 to the frontend. Never show a blank panel.

### 4. Client-side intelligence
Signal aggregation, convergence detection, surge analysis, and CII scoring all run in the
browser (TypeScript services). The backend only proxies, caches, and stores raw data.
This eliminates backend compute cost and latency for the intelligence layer.

### 5. Three-tier cache (from World Monitor)
```
Tier 1: Redis (fresh, TTL varies per source)
Tier 2: Redis stale key (24h, survives source outage)
Tier 3: In-memory fallback (prevents Redis stampede on concurrent misses)
```
Implement via `cachedFetchJson` in `apps/sentinel-api/src/services/cache.ts`.
See Key Patterns section for implementation.

### 6. Circuit breakers per feed
Each upstream API (adsb.fi, AISStream, GDELT, etc.) has its own circuit breaker.
After 3 failures: open for 5 minutes, return stale cache. After cooldown: half-open,
try one request. On success: close.

### 7. URL-encoded map state
All map state (layers, center, zoom, selected entity) is encoded in the URL so any
view is shareable and bookmarkable.
Format: `/conflicts/us-iran?lat=27&lon=51&zoom=5&layers=aircraft,vessels,incidents`

---

## Conflict Configuration System

```typescript
// packages/shared/conflicts.ts — full interface

export interface ConflictConfig {
  slug: string                          // URL: 'us-iran', 'israel-gaza'
  name: string                          // 'US–Iran'
  shortName: string                     // 'Persian Gulf'
  description: string
  status: 'active' | 'frozen' | 'monitoring'
  intensity: 'critical' | 'high' | 'elevated' | 'low'
  startDate: string                     // ISO date

  parties: {
    name: string
    shortCode: string                   // 'US', 'IR', 'IL'
    color: string                       // Hex, used for map markers
    flagEmoji: string
  }[]

  map: {
    center: [number, number]            // [lon, lat]
    zoom: number
    bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
    theaters: {
      id: string
      name: string
      bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
    }[]
  }

  dataSources: {
    adsb: {
      enabled: boolean
      queryPoints: { lat: number; lon: number; radiusNm: number }[]
    }
    ais: {
      enabled: boolean
      boundingBoxes: [[number, number], [number, number]][]
    }
    gdelt: {
      enabled: boolean
      keywords: string[]
      cameoRootCodes: string[]
    }
    acled: {
      enabled: boolean
      regions: number[]
      countries: string[]               // ISO3 codes
    }
    telegram: {
      channels: string[]                // Public channel usernames (no @)
    }
  }

  overlays: {
    bases: MilitaryBase[]
    nuclearSites?: NuclearSite[]
    samSites?: SamSite[]
    shippingLanes?: GeoJSON.Feature[]
    chokepoints?: Chokepoint[]
  }

  card: {
    accentColor: string
    keyMetrics: string[]
  }
}

export const ALL_CONFLICTS: ConflictConfig[] = [US_IRAN, ISRAEL_GAZA]
```

**Launched conflicts:**
- `US_IRAN` — Persian Gulf, Strait of Hormuz, Red Sea. Has nuclear sites, SAM rings,
  Hormuz widget, oil price widget, Rial rate widget.
- `ISRAEL_GAZA` — Gaza, West Bank, Lebanon front, Syria. Has Suez chokepoint.

---

## API Design

All data endpoints are scoped by conflict slug. The slug must exist in `ALL_CONFLICTS`
or the route returns 404.

```
# Conflict registry
GET  /health
GET  /api/conflicts                              → ConflictConfig[] + live stats
GET  /api/conflicts/:slug                        → ConflictConfig + live stats | 404

# Per-conflict live data
GET  /api/conflicts/:slug/aircraft               → Aircraft[]
WS   /ws/conflicts/:slug/aircraft                → Aircraft[] every 5s
GET  /api/conflicts/:slug/vessels                → Vessel[]
WS   /ws/conflicts/:slug/vessels                 → Vessel[] every 10s
GET  /api/conflicts/:slug/incidents              → Incident[] (params: hours, severity, type, bbox)
GET  /api/conflicts/:slug/incidents/geojson      → GeoJSON FeatureCollection
SSE  /api/conflicts/:slug/incidents/stream       → Incident stream (new events only)
GET  /api/conflicts/:slug/theater                → TheaterPosture
GET  /api/conflicts/:slug/sitrep                 → SitrepReport (cached 1h)

# Shared economic data
GET  /api/economic/oil                           → { brent, wti, irn_production }
GET  /api/economic/rial                          → { usd_irr, updated_at }
```

**Redis key conventions:**
```
aircraft:{slug}          TTL 30s    Current aircraft state
vessels:{slug}           TTL 60s    Current vessel state
theater:{slug}           TTL 5m     Theater posture
theater:{slug}:stale     TTL 24h    Stale fallback
sitrep:{slug}            TTL 1h     AI situation report
classify:{sha256}        TTL 24h    Groq classification result cache
economic:oil             TTL 1h     EIA oil prices
economic:rial            TTL 30m    IRR/USD rate
```

---

## Database Schema

```sql
-- apps/sentinel-api/src/db/schema.sql

CREATE TABLE incidents (
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

CREATE INDEX idx_incidents_conflict  ON incidents(conflict_slugs);
CREATE INDEX idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX idx_incidents_geo       ON incidents(lat, lon);

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

CREATE INDEX idx_trails_conflict ON aircraft_trails(conflict_slug, timestamp);

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
  classified      INTEGER DEFAULT 0,  -- 0 | 1
  incident_id     TEXT REFERENCES incidents(id),
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE TABLE data_freshness (
  source_id       TEXT PRIMARY KEY,
  conflict_slug   TEXT,               -- NULL = global source
  last_updated    INTEGER,
  last_status     TEXT,               -- 'fresh' | 'stale' | 'error'
  error_message   TEXT
);
```

---

## Environment Variables

```bash
# ─── AI ────────────────────────────────────────────────────────────────────
GROQ_API_KEY=          # groq.com — free 14,400 req/day (llama-3.1-8b-instant)
ANTHROPIC_API_KEY=     # anthropic.com — analyst chat (claude-sonnet-4-6)
OPENROUTER_API_KEY=    # openrouter.ai — Groq fallback (50 req/day free)

# ─── Cache ─────────────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ─── Flight tracking ───────────────────────────────────────────────────────
# adsb.fi is primary and requires no auth. OpenSky is optional.
OPENSKY_USERNAME=
OPENSKY_PASSWORD=

# ─── Vessel tracking ───────────────────────────────────────────────────────
AISSTREAM_API_KEY=     # aisstream.io — free, register at site

# ─── Conflict data ─────────────────────────────────────────────────────────
ACLED_EMAIL=           # acleddata.com — account email (OAuth2 since 2026)
ACLED_PASSWORD=        # acleddata.com — account password

# ─── Economic ──────────────────────────────────────────────────────────────
EIA_API_KEY=           # eia.gov/opendata — free

# ─── Telegram ──────────────────────────────────────────────────────────────
# Comma-separated public channel usernames, no @ symbol
TELEGRAM_CHANNELS_US_IRAN=
TELEGRAM_CHANNELS_ISRAEL_GAZA=

# ─── Server ────────────────────────────────────────────────────────────────
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

**Minimum required for each phase:**
- Phase 0: none (static data only)
- Phase 1+: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Phase 3+: `GROQ_API_KEY`, `ACLED_EMAIL`, `ACLED_PASSWORD`
- Phase 5+: `ANTHROPIC_API_KEY`
- Phase 6+: `EIA_API_KEY`

---

## Development Phases

### Phase 0 — Foundations 🔨 CURRENT PHASE

**Goal:** Monorepo runs. Home page renders with globe and conflict cards. Both theater
dashboards open with correct map positions. Static overlays visible. Zero real data yet.

**Before writing any UI code in this phase, open and study
`docs/design-reference/conflict-dashboard.jsx`. All components must match its visual language.**

**Tasks:**
- [ ] Turborepo monorepo: `apps/sentinel-fe`, `apps/sentinel-api`, `packages/shared`
- [ ] `packages/shared`: all type interfaces, `ConflictConfig`, `ALL_CONFLICTS` registry,
      military base data for both conflicts, callsign patterns, ICAO type codes
- [ ] Home page `/conflicts`:
  - MapLibre globe (`projection: 'globe'`) with glowing conflict zone polygons
  - Conflict cards grid (2-col desktop, 1-col mobile):
    name, parties (flags), status badge, intensity bar, 3 key metrics, "View Theater →" CTA
  - Clicking globe polygon or card → navigate to `/conflicts/[slug]`
- [ ] Theater dashboard `/conflicts/[slug]`:
  - Dynamic route — 404 on unknown slug
  - MapLibre map initialised from `conflict.map.center` + `conflict.map.zoom`
  - All layer data pre-filtered to `conflict.map.bounds`
  - Header: conflict name, party flags, intensity, Zulu clock
  - Sidebar skeleton: port panel layout directly from the design reference
  - Layer control panel (grouped checkboxes, URL-encoded state)
- [ ] Static overlay layers from `conflict.overlays`:
  - Military bases: `IconLayer`, colored by party
  - Nuclear sites: trefoil icon, colored by status (us-iran only)
  - SAM coverage rings: `GeoJsonLayer` via `@turf/circle`, semi-transparent red (us-iran only)
  - Chokepoints: pulsing circle markers
  - Shipping lanes: `GeoJsonLayer` dashed line (us-iran only)
- [ ] Fastify skeleton:
  - `GET /health`
  - `GET /api/conflicts` → `ALL_CONFLICTS` with zeroed live stats
  - `GET /api/conflicts/:slug` → single config or 404
  - CORS, rate-limit, graceful shutdown, SQLite init

**Definition of done:**
- `localhost:3000/conflicts` shows globe + two conflict cards, matching design reference aesthetic
- Clicking a card navigates to the correct theater dashboard
- Static overlays toggle on/off correctly on each theater map
- `localhost:3001/health` returns 200
- `localhost:3001/api/conflicts` returns both conflict configs

---

### Phase 1 — Live Aircraft Tracking ✅ COMPLETE

**Goal:** Real military aircraft moving on both conflict maps simultaneously.

**Backend:**
- Single `adsb.worker.ts` iterates all enabled conflicts, queries adsb.fi + airplanes.live
- ADSBx hex DB (`basic-ac-db.json.gz`) loaded once at startup, shared across all conflicts
- hexdb.io enrichment for unrecognised hexes
- Full classification pipeline: hex lookup → ICAO type code → callsign pattern → side
- Per-conflict Redis keys: `aircraft:us-iran`, `aircraft:israel-gaza`
- SQLite aircraft trails (24h retention, purge on daily cron)
- `GET /api/conflicts/:slug/aircraft` + `WS /ws/conflicts/:slug/aircraft`
- Strike package detection (us-iran): KC-135 + fighters + AWACS → flag in TheaterPosture

**Frontend:**
- `useAircraftWebSocket(slug)` hook
- `AircraftLayer.tsx`: `IconLayer` rotated to heading, `PathLayer` for 20-position trail
- Colors derived from `conflict.parties[].color` keyed by `aircraft.side`
- Click → detail panel (callsign, type, altitude, speed, lat/lon, hex)
- Home page conflict cards: show live aircraft count

---

### Phase 2 — Naval Tracking ✅ COMPLETE

**Goal:** Vessels on both maps. AIS-dark detection. Strait of Hormuz widget on us-iran.

**Backend:**
- `ais.worker.ts`: persistent AISStream WebSocket, reconnects with exponential backoff
- Bounding boxes from `conflict.dataSources.ais.boundingBoxes` (all conflicts)
- Vessel classification: MMSI prefix (422=Iran, 338/366-369=USA), AIS type code, known vessel DB
- OFAC SDN list: downloaded weekly, sanctioned MMSI flagged as `sanctioned: true`
- AIS-dark: flag gap > 1h for vessels last seen in tracked area, write to `ais_dark_events`
- `GET /api/conflicts/:slug/vessels` + `WS /ws/conflicts/:slug/vessels`

**Frontend:**
- `VesselLayer.tsx`: ship icons by type/side, grey pulsing for AIS-dark
- Sanctioned vessels: orange ring around icon
- `HormuzWidget.tsx` (conditional — us-iran only):
  vessel count in Strait bbox, breakdown by type, OPEN/TENSE/RESTRICTED status

---

### Phase 3 — Incident Feed & OSINT ✅ COMPLETE

**Goal:** Live events on both maps. Telegram → AI pipeline. Incident feed panel.

**Backend:**
- `gdelt.worker.ts`: 15-min poll, keywords + CAMEO from `conflict.dataSources.gdelt`
- `acled.worker.ts`: weekly poll, regions + countries from `conflict.dataSources.acled`
- `telegram.worker.ts`: scrape `t.me/s/{channel}` per conflict, 3–5 min interval,
  2s delay between requests, dedup by post ID in SQLite
- 3-pass Groq classifier: keyword pass (instant) → 8B model (all) → 70B model (sev 4-5)
- Fallback chain: Groq → OpenRouter → keyword-only
- Redis classification cache by `sha256(text)` — prevents re-classifying same content
- Cross-conflict tagging: incidents matching multiple conflict bboxes get multi-slug array
- `GET /api/conflicts/:slug/incidents` + `SSE /api/conflicts/:slug/incidents/stream`

**Frontend:**
- `IncidentLayer.tsx`:
  - `ScatterplotLayer`: radius + color by severity, opacity fades with age
  - `HeatmapLayer`: toggle, 7-day window, weighted by severity
  - `ArcLayer`: missile/drone trajectories (launch origin → impact point)
- `IncidentFeed.tsx`: SSE-powered, severity badges, source icons, click-to-fly-to
- Incident click → map flies to location, marker highlighted, detail panel opens

---

### Phase 4 — Geographic Intelligence Overlays ✅ COMPLETE

**Goal:** All geographic overlays config-driven, fully toggleable.

**Tasks:**
- [x] All overlays render from `conflict.overlays` — zero hardcoding in components
- [x] Strike range rings: render on base hover via `addStrikeRings`/`removeStrikeRings`, multi-ring per aircraft type, cleanup when toggle off
- [x] Nuclear sites: IAEA RSS feed status updates (weekly worker), detail popup per site, live status from `/api/conflicts/:slug/nuclear`
- [x] Shipping lane animation: 14 pre-computed dasharray sequences cycled at ~12fps via requestAnimationFrame
- [x] LayerControl: grouped tree UI (LIVE TRACKS / INTEL / GEOGRAPHY / NUCLEAR), URL-encoded state, keyboard shortcut `L`
- [x] Config-driven party colors: `buildPartyColorMap(conflict)` replaces hardcoded PARTY_COLORS dict

---

### Phase 5 — AI Intelligence Layer ✅ COMPLETE

**Goal:** Convergence alerts, surge detection, per-conflict AI sitrep, analyst chat.

**Tasks:**
- [x] `signal-aggregator.ts` (browser): 0.5°×0.5° grid cells, convergence alert at 3+ signal types
- [x] `military-surge.ts` (browser): Welford streaming mean/variance, 30-day localStorage baseline,
  Z-score thresholds 1.5/2.0/3.0, strike package pattern matching
- [x] `sitrep.worker.ts`: hourly cron, `llama-3.3-70b-versatile`, data scoped to conflict
- [x] `AnalystChat.tsx`: Claude with tool-use, tools scoped to conflict:
  `query_incidents`, `get_aircraft_by_type`, `get_vessel_status`, `get_theater_posture`
- [x] `SitrepPanel.tsx`: threat level badge, summary, key events, force posture
- [x] `useSitrepReport.ts`: fetch + 60-min refetch hook
- [x] `routes/sitrep.ts`: GET /api/conflicts/:slug/sitrep
- [x] `routes/analyst-chat.ts`: POST with Claude tool-use loop (max 5 iterations)

---

### Phase 6 — Economic & Cyber Layer ⏳ UPCOMING

**Goal:** Oil price, Rial rate, internet disruption indicators.

**Tasks:**
- EIA oil: daily poll, Brent + WTI + Iranian production (us-iran only)
- Rial rate: scrape bonbast.com every 30 min (us-iran only)
- Cloudflare Radar: poll countries from each conflict's `acled.countries` list
- `OilPriceWidget.tsx` + `RialWidget.tsx` — conditional render on us-iran
- Internet disruption layer: toggleable markers, cross-reference with Telegram silence

---

### Phase 7 — Polish & Architecture Proof ⏳ UPCOMING

**Goal:** Production-ready. Russia–Ukraine added in <30 min as config-only proof.

**Tasks:**
- Virtual scrolling on incident feed
- Pause WebSocket/SSE on hidden tab, resume on focus
- Pause after 2 min inactivity, resume on interaction
- Memoize deck.gl layers — only recreate when underlying data reference changes
- Circuit breakers hardened and verified for all upstreams
- Globe: auto-rotate (pause on hover), conflict polygons pulse with intensity
- Hover conflict card → highlight that polygon on globe
- Keyboard shortcuts: `L` layers, `F` feed, `⌘K` command palette, `Esc` close
- `RUSSIA_UKRAINE` `ConflictConfig` added to `ALL_CONFLICTS` — everything else automatic
- Update this CLAUDE.md: mark all phases complete, add final architecture notes

---

## Data Sources Reference

### Aircraft

| Source | Endpoint | Auth | Rate limit |
|---|---|---|---|
| adsb.fi (primary) | `https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}` | None | 1 req/s |
| adsb.fi military | `https://opendata.adsb.fi/api/v2/mil` | None | 1 req/s |
| airplanes.live (backup) | `https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}` | None | 1 req/s |
| ADSBx hex DB | `https://downloads.adsbexchange.com/downloads/basic-ac-db.json.gz` | None | Download once |
| hexdb.io enrichment | `https://hexdb.io/api/v1/aircraft/{hex}` | None | 1.1M/day |
| OpenSky (optional) | `https://opensky-network.org/api/states/all` | Optional | 400 credits/day anon |

### Vessels

| Source | Endpoint | Auth | Notes |
|---|---|---|---|
| AISStream.io | `wss://stream.aisstream.io/v0/stream` | Free API key | WebSocket, bbox filter |
| OFAC SDN List | `https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists` | None | Download weekly |
| Global Fishing Watch | `https://gateway.api.globalfishingwatch.org/v3/` | Free key | AIS gaps, SAR detections |

### OSINT / Incidents

| Source | Endpoint | Auth | Update freq |
|---|---|---|---|
| GDELT GEO | `https://api.gdeltproject.org/api/v2/geo/geo` | None | 15 min |
| GDELT DOC | `https://api.gdeltproject.org/api/v2/doc/doc` | None | 15 min |
| ACLED | `https://api.acleddata.com/acled/read` | Free key | Weekly (Sat) |
| Telegram | `https://t.me/s/{channel}` | None | Scrape HTML |

### Economic

| Source | Endpoint | Auth | Update freq |
|---|---|---|---|
| EIA | `https://api.eia.gov/v2/petroleum/pri/spt/data/` | Free key | Daily |
| Bonbast (Rial) | `https://www.bonbast.com` | None | Scrape, 30 min |
| Cloudflare Radar | `https://api.cloudflare.com/client/v4/radar/netflows/timeseries` | Free key | 15 min |

---

## Key Patterns

### cachedFetchJson — stampede-safe three-tier cache

```typescript
// apps/sentinel-api/src/services/cache.ts
import { redis } from './redis'

const inflight = new Map<string, Promise<any>>()

export async function cachedFetchJson<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
  staleKey?: string
): Promise<{ data: T; cacheStatus: 'HIT' | 'MISS' | 'STALE' | 'DEDUP' }> {
  const cached = await redis.get<T>(key)
  if (cached) return { data: cached, cacheStatus: 'HIT' }

  if (inflight.has(key)) {
    const data = await inflight.get(key)
    return { data, cacheStatus: 'DEDUP' }
  }

  const promise = fetcher().catch(async (err) => {
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

### Conflict-scoped worker pattern

```typescript
// apps/sentinel-api/src/workers/adsb.worker.ts
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

### Groq classification with Redis dedup

```typescript
// apps/sentinel-api/src/services/classification.ts
export async function classifyText(text: string): Promise<ClassificationResult> {
  const hash = sha256(text.slice(0, 500))
  const cacheKey = `classify:${hash}`

  const cached = await redis.get<ClassificationResult>(cacheKey)
  if (cached) return cached

  const result = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
  })

  const parsed = JSON.parse(result.choices[0].message.content)
  await redis.set(cacheKey, parsed, { ex: 86400 })
  return parsed
}

const CLASSIFICATION_SYSTEM_PROMPT = `
You are a geospatial intelligence analyst. Extract a JSON object with exactly these fields:
{
  "event_type": "armed_conflict|missile|drone|naval|cyber|protest|diplomatic|nuclear|other",
  "severity": 1-5,
  "location": { "place": "string", "lat": number | null, "lon": number | null },
  "actors": ["string"],
  "summary": "one sentence in English",
  "confidence": 0.0-1.0,
  "is_conflict_related": boolean
}
Return ONLY valid JSON. No other text.`
```

### Deck.gl layer with conflict-derived colors

```typescript
// apps/sentinel-fe/components/map/layers/AircraftLayer.tsx
export function useAircraftLayers(
  aircraft: Aircraft[],
  conflict: ConflictConfig,
  visible: boolean
) {
  const partyColorMap = useMemo(() =>
    Object.fromEntries(
      conflict.parties.map(p => [p.shortCode, hexToRgba(p.color)])
    ),
    [conflict.parties]
  )

  return useMemo(() => {
    if (!visible) return []
    return [
      new IconLayer({
        id: `aircraft-${conflict.slug}`,
        data: aircraft,
        getPosition: d => [d.lon, d.lat],
        getAngle: d => 360 - d.heading,
        getColor: d => partyColorMap[d.side] ?? [150, 150, 150, 255],
        getSize: d => d.mil ? 24 : 14,
        pickable: true,
      }),
      new PathLayer({
        id: `trails-${conflict.slug}`,
        data: aircraft.filter(a => a.trail.length > 1),
        getPath: d => d.trail,
        getColor: d => [...(partyColorMap[d.side] ?? [150, 150, 150]).slice(0,3), 80],
        getWidth: 1,
        widthUnits: 'pixels',
      }),
    ]
  }, [aircraft, visible, conflict.slug, partyColorMap])
}
```

---

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| ADS-B sparse over central Iran | IRIAF activity partially blind | Note gap in DataFreshness panel |
| AIS limited to coastal/port areas | IRGC fast boats in open water invisible | AIS-dark flag + Global Fishing Watch SAR |
| GDELT geocoding unreliable for small towns | Incidents cluster at wrong location | ACLED takes priority; confidence score shown |
| Groq 14,400 req/day limit | High-volume channels exhaust quota | Redis dedup by sha256 — one call per unique text |
| AISStream disconnects ~every 2 min | Vessel gaps of up to 30s | Auto-reconnect + stale Redis cache fills gap |
| Telegram t.me/s/ returns ~20 posts max | No deep history backfill | Track highest post ID per channel, new-only |
| ACLED updates weekly | Ground events lag up to 7 days | GDELT + Telegram fill gap for breaking events |
| No authentication | Anyone with the URL can access | Add NextAuth in Phase 7 if needed |

---

## Running Locally

```bash
# Install all dependencies
npm install

# Copy env template and fill in keys
cp .env.example .env

# Start everything (Turborepo parallel)
npm run dev

# Individual services
npm run dev --workspace=apps/sentinel-fe    # → http://localhost:3000
npm run dev --workspace=apps/sentinel-api   # → http://localhost:3001

# Type check shared package
npm run typecheck --workspace=packages/shared

# Build all
npm run build
```

---

*Last updated: Phase 0 start — update this file at the end of each phase.*
