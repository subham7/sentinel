# SENTINEL — Claude Code Reference

Multi-conflict geospatial intelligence platform. Tracks military aircraft, naval vessels,
and OSINT incidents across active conflict theaters in real time.

**Current status:** Phase 8 ✅ — All phases complete (8A 8B 8C 8D 8E)

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
- IsaBx hex DB (`basic-ac-db.json.gz`) loaded once at startup, shared across all conflicts
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

### Phase 6 — Economic & Cyber Layer ✅ COMPLETE

**Goal:** Oil price, Rial rate, internet disruption indicators.

**Tasks:**
- [x] `economic.worker.ts`: EIA Brent+WTI hourly poll + bonbast.com rial scrape (30min), two-strategy (POST JSON / HTML regex), Toman→Rial conversion, sanity check 300k–5M IRR range
- [x] `routes/economic.ts`: GET /api/economic/oil + GET /api/economic/rial (fresh → stale → 202)
- [x] `hooks/useEconomicData.ts`: fetch oil + rial, 30-min refetch, non-fatal
- [x] `OilPriceWidget.tsx`: Brent+WTI prices, 60-day SVG sparkline, change label — us-iran only
- [x] `RialWidget.tsx`: USD/IRR parallel market rate, 24h change %, depreciation bar — us-iran only
- [x] Wired into PosturePanel (after Hormuz widget)

---

### Phase 7 — Polish & Architecture Proof ✅ COMPLETE

**Goal:** Production-ready. Russia–Ukraine added in <30 min as config-only proof.

**Tasks:**
- [x] Virtual scrolling on incident feed (`@tanstack/react-virtual` `useVirtualizer`, ~10 DOM nodes visible regardless of list size)
- [x] Pause WebSocket/SSE on hidden tab (`useVisibility` hook), resume on focus
- [x] Pause after 2 min inactivity (`useInactivity` hook), resume on any interaction
- [x] Keyboard shortcuts: `L` layers, `F` feed collapse/expand, `⌘K` command palette, `Esc` clear selection
- [x] `CommandPalette.tsx`: ⌘K overlay with conflict navigation, layer toggles, aircraft search, incident search; arrow-key + enter navigation
- [x] `RUSSIA_UKRAINE` `ConflictConfig` added to `ALL_CONFLICTS` — all workers, routes, home page, and theater dashboard work automatically with zero other code changes

**Architecture proof (Russia–Ukraine):**
- Added `RUSSIA_UKRAINE` object to `packages/shared/src/conflicts.ts` only
- `/api/conflicts` immediately returns 3 conflicts
- `/conflicts/russia-ukraine` opens with correct map, parties, and overlays
- ADSB worker queries Kyiv/Kharkiv/Odesa query points automatically
- AIS worker subscribes to Black Sea bounding box automatically
- GDELT/ACLED workers pick up new keywords/countries automatically

**Keyboard shortcut summary:**
| Key | Action |
|-----|--------|
| `L` | Toggle layer control panel |
| `F` | Collapse/expand incident feed |
| `⌘K` / `Ctrl+K` | Open command palette |
| `Esc` | Close palette / clear selected track |

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

*Last updated: Phase 7 complete — all phases done.*

# SENTINEL — Phase 8 Development Plan

> **Status:** Phase 7 ✅ complete. Phase 8 begins here.
> **Scope:** Satellite imagery layer · Home page widget expansion ·
> AI intelligence features · Telegram media scraping & display ·
> Advanced map capabilities
>
> Every task below is scoped to SENTINEL's existing stack:
> TypeScript · Next.js 15 App Router · Fastify · MapLibre + deck.gl ·
> Redis (Upstash) · SQLite · Zustand · Groq + Claude. Architecture
> principles from Phases 0–7 apply unchanged.

---

## Phase 8 Overview

Phase 8 transforms SENTINEL from a data tracker into a **full-spectrum intelligence
terminal**. It is split into five sub-phases that can be worked in parallel by
different contributors, though the recommended order is listed below:

| Sub-phase | Track | Effort | Value |
|---|---|---|---|
| 8A | Satellite Imagery Layer | 3–5 days | Immediate visual differentiation |
| 8B | Home Page Widget Expansion | 4–6 days | Engagement + retention |
| 8E | Advanced Map Capabilities | 1–2 weeks | Analyst-grade map tools |
| 8D | Telegram Media Feed | 1–2 weeks | OSINT depth |
| 8C | AI Intelligence Features (last) | 1–2 weeks | Core intelligence product |

---

## Phase 8A — Satellite Imagery Layer

**Goal:** Users can overlay near-real-time satellite imagery and thermal
anomaly detection on any theater map. No infrastructure required for the
first integration — NASA GIBS tiles are unauthenticated and browser-direct.

### New files

```
apps/sentinel-fe/components/map/layers/
  SatelliteLayer.tsx          # MapLibre raster tile layer switcher
  ThermalLayer.tsx            # NASA FIRMS WMS overlay
  SatelliteDatePicker.tsx     # Date input that updates tile URL
  BeforeAfterSlider.tsx       # maplibre-gl-compare-plus swipe widget

apps/sentinel-api/src/workers/
  stac.worker.ts              # Element84 Earth Search: discover Sentinel-2 scenes

apps/sentinel-api/src/routes/
  satellite.ts                # GET /api/conflicts/:slug/satellite/scenes
```

### New dependencies

```bash
# Frontend
npm install maplibre-gl-compare-plus leaflet-side-by-side
# (for STAC discovery + TiTiler — backend only)
# TiTiler: deploy as Docker sidecar, no npm package
```

### New env variables

```bash
FIRMS_MAP_KEY=          # firms.modaps.eosdis.nasa.gov — free registration
SENTINEL_HUB_CLIENT_ID=      # dataspace.copernicus.eu — free tier
SENTINEL_HUB_CLIENT_SECRET=  # dataspace.copernicus.eu
```

### Tasks

#### 8A-1 — NASA GIBS tile layer (hours, zero auth)

Add three new satellite base layers to the `LayerControl` panel under a new
group **SATELLITE**:

```typescript
// apps/sentinel-fe/components/map/layers/SatelliteLayer.tsx

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
    label: 'Thermal Anomalies (VIIRS)',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_Thermal_Anomalies_375m_All/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
  },
}
```

The `{date}` token is replaced client-side when the user changes the date
picker. Default to yesterday UTC (GIBS has ~24h latency). Domain-shard
tile fetches across `gibs.earthdata.nasa.gov` and `gibs-{a,b,c}.earthdata.nasa.gov`.

When a GIBS satellite layer is active, render it below all OSINT/track
layers but above the base CARTO tiles. Opacity slider (0.3–1.0) in the
LayerControl panel for satellite layers.

**Nighttime lights is the highest-intelligence layer** — power outages and
infrastructure destruction are immediately visible as dark patches in
formerly lit areas. Note this in the layer tooltip.

#### 8A-2 — NASA FIRMS thermal WMS overlay (1 day)

15-minute-latency thermal anomaly overlay via WMS (requires free MAP_KEY):

```typescript
// In SatelliteLayer.tsx
const FIRMS_WMS = `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${FIRMS_MAP_KEY}/?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=fires_viirs_noaa20_24&TIME={startDate}/{endDate}&BBOX={bbox}&WIDTH=256&HEIGHT=256&SRS=EPSG:3857`
```

Add this as a **FIRMS THERMAL (15 min)** sublayer under SATELLITE in LayerControl.
FRP (Fire Radiative Power) values in the FIRMS legend distinguish military
strikes from agricultural burns — note this in a tooltip: high-FRP point
sources without vegetation context = likely munitions impact.

#### 8A-3 — Date picker for historical imagery (half-day)

```typescript
// apps/sentinel-fe/components/map/layers/SatelliteDatePicker.tsx
// Renders a date <input type="date"> in the LayerControl panel
// Only visible when a GIBS satellite layer is active
// Defaults to yesterday UTC
// On change: updates tile layer URL param, triggers map tile refresh
// Keyboard: ArrowLeft/ArrowRight step by ±1 day
```

Store selected satellite date in URL state alongside existing layer params:
`?layers=aircraft,satellite_truecolor&satdate=2026-02-28`

#### 8A-4 — Copernicus Sentinel Hub WMS (2–3 days)

Register at `dataspace.copernicus.eu`, create a WMS configuration for
Sentinel-2 L2A. Use OAuth2 client credentials flow in the API backend to
mint short-lived tokens, proxied through:

```
GET /api/conflicts/:slug/satellite/wms-token   → { token, expires_at }
```

Frontend uses the token to call:
```
https://sh.dataspace.copernicus.eu/ogc/wms/{INSTANCE_ID}?
  SERVICE=WMS&REQUEST=GetMap&LAYERS=TRUE_COLOR&TIME={date}
  &BBOX={bounds}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true
```

This gives 10m resolution Sentinel-2 imagery — significantly sharper than
GIBS VIIRS (375m) for targeted area inspection.

#### 8A-5 — Before/after comparison slider (1 day)

Install `maplibre-gl-compare-plus`. When a satellite layer is active, a
**COMPARE MODE** toggle appears in the LayerControl. Activating it:

1. Splits the map into two synchronized panels
2. Left panel: user-selected "before" date
3. Right panel: user-selected "after" date
4. Draggable center divider
5. Both panels share pan/zoom

Use case: compare satellite imagery before and after a strike event. The
`SatelliteDatePicker` shows two date inputs when compare mode is active.

#### 8A-6 — STAC scene discovery API (1–2 days)

`stac.worker.ts` polls Element84 Earth Search daily per conflict bbox,
stores scene metadata (cloud cover, acquisition date, COG URL) in SQLite:

```typescript
// POST https://earth-search.aws.element84.com/v1/search
{
  "collections": ["sentinel-2-l2a"],
  "bbox": [conflict.map.bounds.lonMin, conflict.map.bounds.latMin,
           conflict.map.bounds.lonMax, conflict.map.bounds.latMax],
  "datetime": "2026-01-01T00:00:00Z/..",
  "query": { "eo:cloud_cover": { "lt": 20 } },
  "sortby": [{ "field": "datetime", "direction": "desc" }],
  "limit": 30
}
```

New `GET /api/conflicts/:slug/satellite/scenes` endpoint returns a list of
available low-cloud-cover scenes with dates. The `SatelliteDatePicker`
highlights these dates in green so analysts know which dates have usable imagery.

#### 8A-7 — LayerControl integration

Add a **SATELLITE** group to `LayerControl.tsx` with sublayers:

```
▼ SATELLITE
  ○ True Color (GIBS VIIRS)
  ○ Nighttime Lights (GIBS VIIRS)
  ○ Thermal Anomalies (FIRMS · 15 min)
  ○ Sentinel-2 True Color (10m · Copernicus)
  ── Date: [2026-02-28] [◄ ►]    ← only when satellite layer active
  ── [Compare Mode]               ← only when satellite layer active
```

**Definition of done — 8A:**
- Toggling a GIBS layer renders satellite tiles on the theater map
- Date picker changes tiles without full map reload
- FIRMS thermal layer shows heat signatures over known strike areas
- Before/after slider works on Sentinel-2 layers
- STAC scene discovery shows available dates in date picker

---

## Phase 8B — Home Page Widget Expansion

**Goal:** The `/conflicts` home page becomes a live global intelligence
overview, not just a conflict directory. Add five high-impact widgets that
give analysts a reason to land here daily.

### New files

```
apps/sentinel-fe/components/home/
  GlobalIncidentCounter.tsx   # Animated live event counters
  ThreatSparklines.tsx        # 7/30-day trend per theater
  ThreatRadar.tsx             # Multi-axis spider chart per conflict
  GlobalChoropleth.tsx        # Country-level conflict intensity world map
  DiplomaticTimeline.tsx      # Upcoming events / ceasefire countdowns
  HomeWidgetGrid.tsx          # react-grid-layout container
```

### New dependencies

```bash
npm install react-countup framer-motion recharts @tremor/react react-grid-layout
```

### Tasks

#### 8B-1 — Animated incident counters (1–2 days)

Place at the top of `/conflicts` above the globe, styled as a terminal
status bar matching the military aesthetic:

```
[ ACTIVE THEATERS: 3 ]  [ 24H INCIDENTS: 1,247 ]  [ LIVE TRACKS: 89 ]  [ VESSELS DARK: 12 ]
```

Implementation: push updated totals via the existing Socket.IO connection
every 30s. Client-side `react-countup` with `enableScrollSpy={false}` and
`duration={0.8}` animates between values as they tick up. Use
`framer-motion`'s `useSpring` for a slot-machine digit effect on the
24H INCIDENTS counter (highest-signal metric).

Values source:
- **Active theaters**: `ALL_CONFLICTS.filter(c => c.status === 'active').length`
- **24H incidents**: `SELECT COUNT(*) FROM incidents WHERE timestamp > NOW()-86400`
- **Live tracks**: sum of aircraft + vessel counts across all Redis keys
- **Vessels dark**: `SELECT COUNT(*) FROM ais_dark_events WHERE gap_ended_at IS NULL`

#### 8B-2 — Escalation sparklines per theater (2–3 days)

Below each conflict card on the home page, add a 30-day incident trend
sparkline using `@tremor/react`'s `SparkAreaChart`:

```typescript
// apps/sentinel-fe/components/home/ThreatSparklines.tsx
// Data: GET /api/conflicts/:slug/incidents?hours=720&groupBy=day
// Returns: [{ date: '2026-02-01', count: 47, avgSeverity: 3.2 }, ...]
// Render: SparkAreaChart, color = conflict.card.accentColor
// Tooltip: "Feb 1 · 47 events · avg severity 3.2"
```

Add a new backend endpoint to support this:
```
GET /api/conflicts/:slug/incidents/trend?days=30
→ [{ date: string; count: number; avgSeverity: number }]
```
Cached in Redis at `incidents:trend:{slug}` TTL 1h.

#### 8B-3 — Threat radar chart per conflict (2 days)

Replace the static intensity bar on each conflict card with a 6-axis
`RadarChart` (Recharts) that shows current threat composition at a glance:

```
Axes: Military Activity · Diplomatic Tension · Cyber / Comms ·
      Economic Pressure · Humanitarian · Information Warfare
```

Scores (0–100) are computed browser-side from incident categories in the
last 7 days, mapped to CAMEO event codes already stored per incident.
The previous week's scores render as a second semi-transparent `<Radar>`
series for visual trend comparison.

Color: primary series = `conflict.card.accentColor`, secondary = same at
30% opacity. Chart background: `--bg-surface`. No chart grid lines — use
custom `PolarGrid` with `--border` color.

#### 8B-4 — Global conflict choropleth (3–4 days)

Replace the globe's plain base map with a choropleth layer showing global
conflict intensity. Render below conflict zone polygons, above base tiles.

```typescript
// Data: UCDP GED API — no auth required
// GET https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=1&StartDate=2025-01-01
// Country-level incident counts → intensity bucket (0-4)
// Render as MapLibre fill layer on Natural Earth country polygons
// Color scale: transparent (0) → amber (1) → orange (2) → red (3) → crimson (4)
// Opacity: 0.3 — subtle background, not distracting from active conflicts
```

Cache UCDP data at `GET /api/intel/global-intensity` TTL 24h.

Countries with active SENTINEL conflict configs render at higher opacity and
with the `conflict.card.accentColor` pulsing border, not the UCDP color.

#### 8B-5 — Diplomatic event timeline (1–2 days)

A horizontal scrolling timeline at the bottom of the home page showing
upcoming events and active ceasefire countdowns:

```
[●] UNSC Vote — Syria         in 14h
[●] US–Iran Nuke Talks         Feb 28 (2 days)
[►] Gaza Ceasefire Phase 2     EXPIRES in 3d 14h 22m  ← countdown, amber if <48h, red if <12h
[◌] IAEA Inspection — Natanz   Mar 15
```

Data source: manually curated entries in `packages/shared/diplomatic-events.ts`
(an array of `{title, date, type, conflictSlug, countdownEnabled}` objects).
Any contributor can add events with a PR. Countdown timers run client-side.
This is a high-signal feature that requires zero API integration.

#### 8B-6 — Draggable widget grid (optional, 2 days)

Wrap all home page components in a `react-grid-layout` grid so analysts can
rearrange and resize widgets. Save layout to `localStorage` under
`sentinel:home-layout`. Provide a **Reset Layout** button. This is low
priority but architecturally clean to add now before the home page grows
further.

**Definition of done — 8B:**
- `/conflicts` shows live event counters that animate on each update
- Each conflict card has a 30-day sparkline and 6-axis radar chart
- Globe has global choropleth background layer
- Diplomatic timeline shows at least 3 real upcoming events

---

## Phase 8C — AI Intelligence Features

**Goal:** Structured intelligence pipeline. ConfliBERT NER, automated
morning brief, escalation anomaly detection, entity relationship graph.

### New files

```
apps/sentinel-api/src/services/
  ner.service.ts             # HTTP client → Python NER microservice
  anomaly.service.ts         # Z-score + spike detection on incident timeseries
  entity-graph.service.ts    # Build actor relationship graph from incidents

apps/sentinel-api/src/workers/
  morning-brief.worker.ts    # 06:00 UTC daily SITREP with BLUF format
  ner-enrichment.worker.ts   # Background NER enrichment of raw incidents

apps/sentinel-api/src/routes/
  intel.ts                   # GET /api/conflicts/:slug/morning-brief
                             # GET /api/conflicts/:slug/entity-graph
                             # GET /api/conflicts/:slug/anomalies

apps/sentinel-fe/components/panels/
  MorningBriefPanel.tsx      # Daily BLUF intelligence brief
  EntityGraph.tsx            # Cytoscape.js actor relationship graph
  AnomalyBanner.tsx          # Spike detection alert banner above incident feed
  RhetoricGauge.tsx          # Escalatory language temperature gauge

services/
  ner/                       # Python FastAPI microservice (separate Docker container)
    main.py                  # ConfliBERT NER endpoint
    requirements.txt
    Dockerfile
```

### New dependencies

```bash
# Frontend
npm install cytoscape cytoscape-d3-force

# Python NER service (services/ner/)
pip install fastapi uvicorn transformers torch spacy
```

### New env variables

```bash
NER_SERVICE_URL=http://ner-service:8001    # Internal Docker network URL
```

### Tasks

#### 8C-1 — Morning brief (BLUF format) (2–3 days)

`morning-brief.worker.ts` runs at **06:00 UTC daily** via a cron job (use
`node-cron` already in the project). It calls Claude (`claude-sonnet-4-6`)
with a structured prompt using the previous 24h of incident, aircraft, and
vessel data per conflict.

**BLUF format (ODNI standard):**
```
BOTTOM LINE UP FRONT
One to two sentence key judgment. What matters most right now.

KEY JUDGMENTS
1. [HIGH CONFIDENCE] Assessment statement.
2. [MODERATE CONFIDENCE] Assessment statement.
3. [LOW CONFIDENCE] Assessment statement.

EVIDENCE
Brief factual summary of the data driving the above judgments.

OUTLOOK (24–72h)
What to watch. What could change the assessment.

CONFIDENCE: HIGH | MODERATE | LOW
SOURCES: ACLED (n=47), GDELT (n=312), ADS-B (n=23 tracks), Telegram (n=18)
```

Confidence language maps to ODNI ICD 203 probabilities:
- **HIGH**: well-corroborated by 3+ independent sources
- **MODERATE**: credible sourcing, some analytical gaps
- **LOW**: fragmentary, significant assumptions required

Cache at `morning-brief:{slug}:{YYYY-MM-DD}` TTL 23h (regenerates next day).

`MorningBriefPanel.tsx` replaces or sits alongside `SitrepPanel.tsx`. The
existing hourly sitrep retains its position; the morning brief is a
separate, more formal panel accessible via a tab toggle.

#### 8C-2 — ConfliBERT NER microservice (3–5 days)

Create a standalone Python/FastAPI microservice in `services/ner/`:

```python
# services/ner/main.py
from fastapi import FastAPI
from transformers import pipeline

app = FastAPI()

# ConfliBERT: pre-trained on 33GB conflict/politics corpus (NAACL 2022)
ner = pipeline("ner", model="snowood1/ConfliBERT-scr-uncased",
               aggregation_strategy="simple")

@app.post("/extract")
async def extract_entities(text: str):
    entities = ner(text[:512])
    return {
        "actors": [e["word"] for e in entities if e["entity_group"] in ("ORG","NORP","GPE")],
        "locations": [e["word"] for e in entities if e["entity_group"] == "LOC"],
        "events": [e["word"] for e in entities if e["entity_group"] == "EVENT"],
        "weapons": [e["word"] for e in entities if e["entity_group"] in ("WEAPON","PRODUCT")]
    }
```

`ner-enrichment.worker.ts` runs every 15 minutes, takes the 50 most recent
unclassified incidents from SQLite, calls the NER service, and writes
structured entity data back to a new `incident_entities` table:

```sql
CREATE TABLE incident_entities (
  incident_id   TEXT REFERENCES incidents(id),
  entity_type   TEXT,  -- 'actor' | 'location' | 'weapon' | 'event'
  entity_value  TEXT,
  confidence    REAL,
  PRIMARY KEY (incident_id, entity_type, entity_value)
);
```

This powers the entity graph (8C-3) and improves analyst chat context.

#### 8C-3 — Entity relationship graph (3–4 days)

`entity-graph.service.ts` builds a graph from the last 30 days of incident
entities. Nodes: state actors (large), armed groups (medium), individuals
(small). Edges: co-occurrence in same incident (weight = frequency).

```
GET /api/conflicts/:slug/entity-graph
→ {
    nodes: [{ id, label, type, frequency, color }],
    edges: [{ source, target, weight, eventTypes }]
  }
```

`EntityGraph.tsx` renders with Cytoscape.js + `cytoscape-d3-force` layout:

```typescript
// Node colors: derive from conflict.parties[].color for known actors
// Unknown: --text-secondary
// Layout: force-directed, gravity 0.3, node repulsion 4500
// Click node: flies incident feed to filter by that actor
// Edge thickness: proportional to co-occurrence count
// Edge color: red if event_types include 'armed_conflict', blue if 'diplomatic'
```

Accessible via a new **ENTITY GRAPH** tab in the sidebar panel area.

#### 8C-4 — Z-score anomaly detection (1–2 days)

`anomaly.service.ts` runs browser-side (TypeScript, no backend compute),
extending the existing `military-surge.ts` pattern:

```typescript
// Compute rolling 30-day mean + std of daily event counts
// Flag if today's count > mean + (2.5 × std) → SPIKE alert
// Flag if 7-day trend slope > 3× historical average → SURGE alert
// Flag if event_type proportion shifts significantly → TYPE CHANGE alert
```

`AnomalyBanner.tsx` renders above `IncidentFeed.tsx` when anomalies are
detected:

```
⚠ INCIDENT SPIKE DETECTED — us-iran · 3.2σ above 30-day baseline (↑214% in 6h)
```

Color: `--sev-high` (#f97316) background at 15% opacity, full-color border.
Dismissible per session. Feeds into the `FLASH`/`IMMEDIATE` alert tier from
the Phase 7 architecture.

#### 8C-5 — Rhetoric temperature gauge (2 days)

`RhetoricGauge.tsx` is a semi-circular speedometer widget (matching the
design reference's gauge aesthetic) that shows escalatory language
temperature for each conflict.

Data pipeline:
1. `telegram.worker.ts` already scrapes official channel text
2. New `rhetoric.service.ts` (browser-side): calls Claude Haiku via a new
   `POST /api/conflicts/:slug/rhetoric` endpoint with the last 24h of
   official channel posts, scoring 0–100 on an escalatory language rubric
3. Score cached at `rhetoric:{slug}` TTL 4h
4. Widget shows current score, 7-day sparkline, key phrases driving the score

Rubric anchors: 0=routine, 25=elevated, 50=threatening, 75=crisis, 100=imminent.

**Definition of done — 8C:**
- Morning brief panel shows a BLUF-formatted daily assessment for each conflict
- NER service runs and enriches new incidents within 15 minutes of ingestion
- Entity graph renders and updates daily
- Anomaly banner triggers correctly during test spike injection
- Rhetoric gauge renders with live score

---

## Phase 8D — Telegram Media Feed

**Goal:** Photos and videos from monitored Telegram channels appear in the
dashboard as a media intelligence feed. Metadata (channel, timestamp, geotag
if present) is displayed alongside each item.

### New files

```
apps/sentinel-api/src/services/
  telegram-media.service.ts  # Media download, hash, upload to R2

apps/sentinel-api/src/workers/
  telegram-media.worker.ts   # Background media extraction from new posts

apps/sentinel-api/src/routes/
  media.ts                   # GET /api/conflicts/:slug/media

apps/sentinel-fe/components/panels/
  MediaFeed.tsx              # Masonry grid media gallery with lightbox
  MediaCard.tsx              # Individual media item card

apps/sentinel-fe/hooks/
  useMediaFeed.ts            # Paginated media fetch + SSE updates
```

### New dependencies

```bash
# Backend
npm install @mtcute/node @aws-sdk/client-s3 sharp fluent-ffmpeg ffmpeg-static exifr

# Frontend
npm install react-masonry-css lightgallery react-player
```

### New env variables

```bash
# Telegram MTProto (my.telegram.org/apps — free registration)
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION_STRING=    # Serialized session (generate once via CLI helper)

# Cloudflare R2 (zero egress cost vs S3)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=sentinel-media
R2_PUBLIC_URL=              # Public bucket URL for CDN delivery
```

### New database schema

```sql
-- apps/sentinel-api/src/db/schema.sql — append to existing schema

CREATE TABLE telegram_media (
  id              TEXT PRIMARY KEY,       -- '{channel}:{message_id}:{type}:{index}'
  conflict_slug   TEXT NOT NULL,
  channel         TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  media_type      TEXT NOT NULL,          -- 'photo' | 'video' | 'document'
  r2_key          TEXT NOT NULL,          -- Storage key in R2
  thumbnail_key   TEXT,                   -- WebP thumbnail key in R2
  width           INTEGER,
  height          INTEGER,
  duration_secs   INTEGER,                -- video only
  file_size       INTEGER,
  phash           TEXT,                   -- perceptual hash for dedup
  exif_lat        REAL,                   -- GPS if present
  exif_lon        REAL,
  posted_at       TEXT NOT NULL,
  caption         TEXT,
  view_count      INTEGER,
  forward_count   INTEGER,
  nsfw_score      REAL,                   -- NSFWJS classification
  is_visible      INTEGER DEFAULT 1,      -- 0 = filtered/hidden
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_telegram_media_conflict ON telegram_media(conflict_slug, posted_at DESC);
CREATE INDEX idx_telegram_media_geo ON telegram_media(exif_lat, exif_lon)
  WHERE exif_lat IS NOT NULL;
```

### Tasks

#### 8D-1 — MTProto media extraction (3–4 days)

Migrate the existing `telegram.worker.ts` HTML scraper to MTProto for
media-capable channels. Keep the HTML scraper as a fallback for channels
where MTProto fails.

```typescript
// apps/sentinel-api/src/workers/telegram-media.worker.ts
import { TelegramClient } from '@mtcute/node'

const client = new TelegramClient({
  apiId: parseInt(process.env.TELEGRAM_API_ID),
  apiHash: process.env.TELEGRAM_API_HASH,
  storage: 'session.bin',
})

// For each new post with media:
// 1. Download to Buffer (max 50MB per file)
// 2. For photos: Sharp resize to max 1920px wide, convert to WebP
//    + generate 400px thumbnail (WebP)
// 3. For videos: ffmpeg extract frame at 1s for thumbnail (WebP)
//    + transcode to H.264 MP4 with -movflags +faststart for web streaming
// 4. Check phash (via sharp-phash) against last 7-day hashes in Redis
//    → skip if Hamming distance < 5 (near-duplicate)
// 5. Run NSFWJS on thumbnail (TensorFlow.js in Node.js)
//    → set is_visible = 0 if nsfw_score > 0.6
// 6. Extract EXIF via exifr: lat/lon if present
// 7. Upload original + thumbnail to R2 via S3 SDK
// 8. INSERT into telegram_media
```

Rate limiting: 2s delay between media downloads. Max 20 files per polling
cycle to avoid hitting Telegram rate limits. Circuit breaker: if 3 consecutive
download failures, pause for 10 minutes.

#### 8D-2 — Media API endpoint (half-day)

```typescript
// apps/sentinel-api/src/routes/media.ts
// GET /api/conflicts/:slug/media
// Query params: page (default 1), limit (default 24), type ('photo'|'video'|'all')
// Returns: { items: TelegramMedia[], total: number, hasMore: boolean }
// Cache: Redis key media:{slug}:page:{n} TTL 5 minutes

// SSE: /api/conflicts/:slug/media/stream
// Pushes new media items as they are ingested (same pattern as incidents/stream)
```

#### 8D-3 — Media feed UI (2–3 days)

`MediaFeed.tsx` renders as a new **MEDIA** tab in the sidebar panel area
(alongside INCIDENTS, TRACKS, ENTITY GRAPH):

```typescript
// Masonry grid: react-masonry-css, 2 columns at panel width
// Each item: MediaCard.tsx
//   - Thumbnail image (lazy-loaded, WebP)
//   - Channel avatar + name (truncated to 12 chars)
//   - Timestamp (relative: "14 min ago", hover shows UTC)
//   - Caption truncated to 2 lines, expand on hover
//   - Geotag pin icon if exif_lat present (click flies map to location)
//   - Video: play button overlay + duration badge
//   - View/forward count badges (muted, bottom-right)
//
// Click photo: LightGallery lightbox with zoom
// Click video: react-player inline at full panel width
//
// Virtualization: @tanstack/react-virtual (already installed)
// Infinite scroll: load next page when last item enters viewport
```

Media cards use the same panel aesthetic as the incident feed:
- `--bg-surface` background, `--border` border, `4px` border-radius
- No box shadows — borders only
- Hover: `--bg-overlay` background

#### 8D-4 — Map integration for geotagged media (1 day)

If `exif_lat` / `exif_lon` are present on a media item, render a camera
icon marker on the theater map in a new **MEDIA LOCATIONS** layer group.

```typescript
// New layer: apps/sentinel-fe/components/map/layers/MediaLayer.tsx
// IconLayer: camera icon, --text-secondary color, 16px
// Click: opens MediaCard in a popup (same popup style as incident popups)
// Only renders when MEDIA LOCATIONS layer is toggled on
// Layer added to LayerControl under new MEDIA group
```

**Definition of done — 8D:**
- New Telegram posts with media appear in the Media Feed within 5 minutes
- Duplicate images are suppressed (phash dedup)
- NSFW content is hidden by default
- Geotagged media appears as map markers
- Video plays inline in the panel

---

## Phase 8E — Advanced Map Capabilities

**Goal:** Analyst-grade map tools: incident heatmap, geofenced alerts,
frontline visualization, aircraft trail history, maritime intelligence layers.

### New files

```
apps/sentinel-fe/components/map/layers/
  HeatmapLayer.tsx           # deck.gl HeatmapLayer (replaces/enhances existing)
  FrontlineLayer.tsx         # Territory control polygons
  MediaLayer.tsx             # Geotagged Telegram media (from 8D-4)
  ADIZLayer.tsx              # Air Defense Identification Zones
  WeaponRangeLayer.tsx       # Declared weapons ranges (extends BasesLayer)

apps/sentinel-fe/services/
  geofence.service.ts        # Turf.js geofenced alert zones
  trail-history.service.ts   # ADS-B/AIS trail management (Redis sorted sets)
  pattern-detection.ts       # Holding pattern + STS transfer detection

packages/shared/
  frontlines.ts              # GeoJSON frontline data per conflict
  adiz.ts                    # ADIZ boundary GeoJSON
```

### New dependencies

```bash
npm install @turf/turf rbush @deck.gl/geo-layers
# deck.gl already installed; add geo-layers subpackage for TripsLayer
```

### Tasks

#### 8E-1 — Incident density heatmap (hours)

Enhance the existing `HeatmapLayer.tsx` (Phase 3) with time-windowed weights:

```typescript
// deck.gl HeatmapLayer with:
// - weightsTextureSize: 512 (higher resolution)
// - intensity: 1.5
// - radiusPixels: 40
// - colorRange: 6-stop scale from transparent → --sev-critical
// - Data: incidents filtered by active time window
// Time window selector in LayerControl: 24h | 7d | 30d | All
// Weight = incident.severity (1–5), so sev-5 events glow 5× brighter
```

#### 8E-2 — Turf.js geofenced alert zones (1–2 days)

Analysts can draw custom alert zones on the map that trigger WebSocket
alerts when aircraft or vessels enter/exit.

```typescript
// apps/sentinel-fe/services/geofence.service.ts
// Uses @turf/boolean-point-in-polygon + rbush R-tree for performance
// State: stored in Zustand + URL-encoded as base64 GeoJSON in ?geofences= param
// UI: click "Draw Zone" → MapLibre draw mode → creates polygon
//     polygon renders as dashed amber border, transparent fill
//     right-click polygon → delete, edit name, set alert severity

// On each aircraft/vessel WebSocket update:
//   for each geofence: check if asset was outside, now inside → ENTER event
//   distribute via existing alert tier system (IMMEDIATE for military aircraft)
```

#### 8E-3 — Aircraft trail history with deck.gl TripsLayer (1–2 days)

Replace the existing `PathLayer` trail (20-position static) with a
`TripsLayer` that shows animated, time-fading trails:

```typescript
// @deck.gl/geo-layers TripsLayer
// - fadeTrail: true
// - trailLength: 180  (seconds of history shown)
// - currentTime: animationTime (requestAnimationFrame counter)
// - getTimestamps: d => d.trail.map(t => t.timestamp)
// - getPath: d => d.trail.map(t => [t.lon, t.lat])
// - getColor: d => partyColorMap[d.side]

// Backend: GET /api/conflicts/:slug/aircraft/:icao24/trail?hours=4
// Returns: { icao24, trail: [{ lat, lon, alt, ts }] }
// Source: aircraft_trails SQLite table (already exists from Phase 1)
```

#### 8E-4 — Frontline / territorial control layer (2–3 days)

Static GeoJSON frontline data in `packages/shared/frontlines.ts`:

```typescript
// Each conflict can have optional frontline data:
// {
//   conflictSlug: 'russia-ukraine',
//   features: GeoJSON.Feature[],    // MultiPolygon per control zone
//   updatedAt: '2026-02-28',
//   source: 'DeepState Map',
//   confidence: 'high' | 'medium' | 'low'
// }

// Render as MapLibre fill layer:
// - Ukrainian control: #00b0ff at 15% opacity, solid border
// - Russian control: #ef4444 at 15% opacity, solid border
// - Contested: amber hatched SVG pattern
// - Uncertainty band: turf.buffer(frontline, 5, 'km') at 5% opacity
```

Update `ConflictConfig` to support `overlays.frontlines?: FrontlineData`.
Community contributors can submit frontline GeoJSON updates via PRs.

#### 8E-5 — ADIZ and maritime boundary layers (1 day)

Add pre-computed GeoJSON for:
- **ADIZ boundaries**: Iran ADIZ, US CENTCOM-relevant ADIZs, Israeli airspace
  Source: publicly available military geography, stored in `packages/shared/adiz.ts`
- **EEZ / territorial waters**: 12NM + 24NM zones for Persian Gulf states
  Source: MarineRegions.org shapefiles (CC BY 4.0), converted to GeoJSON
- **Shipping lanes**: `newzealandpaul/Shipping-Lanes` dataset

Add as togglable layers under **GEOGRAPHY** in LayerControl:
```
▼ GEOGRAPHY (existing)
  ✓ Military Bases
  ✓ Shipping Lanes
  □ Frontlines / Control Zones    ← new
  □ ADIZ Boundaries               ← new
  □ EEZ / Maritime Zones          ← new
  □ Media Locations               ← from 8D-4
```

#### 8E-6 — AIS ship-to-ship transfer detection (1–2 days)

Extend `vessel-id.service.ts` with STS detection heuristics:

```typescript
// apps/sentinel-api/src/services/vessel-id.ts — add to existing
function detectShipToShip(vessels: Vessel[]): STSEvent[] {
  // For each pair of vessels:
  // 1. Both speed-over-ground < 1 knot (effectively stopped)
  // 2. Distance between them < 500m for > 2 hours
  // 3. At least one is a tanker (AIS type 80–89)
  // 4. Location: not a known port (check against port GeoJSON)
  // → Flag as probable STS transfer
  // Write to new ais_sts_events table
  // Push as PRIORITY alert via existing alert tier
}
```

Render STS events as a link icon between the two vessel markers on the map.

#### 8E-7 — Web Push notifications for FLASH alerts (1–2 days)

```typescript
// apps/sentinel-api: npm install web-push
// Generate VAPID keys once: npx web-push generate-vapid-keys → add to .env

// New route: POST /api/push/subscribe → store PushSubscription in SQLite
// New route: DELETE /api/push/subscribe → remove subscription

// When a FLASH-tier alert fires, call:
//   webpush.sendNotification(subscription, JSON.stringify({
//     title: 'SENTINEL FLASH',
//     body: alertMessage,
//     icon: '/icon-512.png',
//     data: { conflictSlug, incidentId }
//   }))

// Frontend: register Service Worker in layout.tsx
// Show permission prompt after user's 3rd session (not on first visit)
// Notification click → navigate to /conflicts/{slug}#incident/{id}
```

Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to `.env.example`.

**Definition of done — 8E:**
- Heatmap time-window selector works
- Drawing a geofence and triggering it with a test aircraft fires an alert
- Aircraft trails animate with time-fading via TripsLayer
- Frontline layer renders for russia-ukraine
- ADIZ and maritime boundary layers toggle correctly
- STS detection flags appear on sanctioned tankers in the Persian Gulf test data
- Push notification arrives on desktop after subscribing

---

## Phase 8 — Updated CLAUDE.md Sections

### Updated tech stack entries

Append to the **Tech Stack** table in CLAUDE.md:

| Layer | Technology |
|---|---|
| Satellite imagery | NASA GIBS (no auth) + Sentinel Hub (Copernicus free tier) |
| STAC discovery | Element84 Earth Search (`earth-search.aws.element84.com/v1`) |
| Tile server | TiTiler (Docker sidecar, port 8080) |
| NER microservice | Python FastAPI + ConfliBERT (Docker sidecar, port 8001) |
| Media storage | Cloudflare R2 (zero egress, S3-compatible API) |
| Media processing | Sharp (images) + fluent-ffmpeg (video thumbnails) |
| Push notifications | web-push (VAPID) + Service Worker |
| Geospatial analysis | @turf/turf + rbush (R-tree spatial index) |
| Entity graph | Cytoscape.js + cytoscape-d3-force |
| Media library | react-masonry-css + LightGallery + react-player |

### New environment variables (add to .env.example)

```bash
# ─── Satellite ─────────────────────────────────────────────────────────────
FIRMS_MAP_KEY=              # firms.modaps.eosdis.nasa.gov — free
SENTINEL_HUB_CLIENT_ID=     # dataspace.copernicus.eu — free
SENTINEL_HUB_CLIENT_SECRET= # dataspace.copernicus.eu

# ─── Telegram MTProto ──────────────────────────────────────────────────────
TELEGRAM_API_ID=            # my.telegram.org/apps
TELEGRAM_API_HASH=          # my.telegram.org/apps
TELEGRAM_SESSION_STRING=    # Generate with: npx ts-node scripts/telegram-auth.ts

# ─── Media Storage (Cloudflare R2) ─────────────────────────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=sentinel-media
R2_PUBLIC_URL=              # https://{account}.r2.cloudflarestorage.com

# ─── Push Notifications ────────────────────────────────────────────────────
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=                # mailto:your@email.com

# ─── Internal Services ─────────────────────────────────────────────────────
NER_SERVICE_URL=http://localhost:8001
TITILER_URL=http://localhost:8080
```

### Updated development phases section

```
### Phase 8 — Full-Spectrum Intelligence Platform 🔨 CURRENT PHASE

Sub-phases (work in parallel):
- [x] 8A: Satellite imagery layer (NASA GIBS, FIRMS, Copernicus)
- [x] 8B: Home page widget expansion (counters, sparklines, radar, choropleth)
- [x] 8C: AI intelligence features (morning brief, entity graph, anomaly detection, rhetoric gauge)
- [x] 8D: Telegram media feed (HTML scraper, masonry gallery, lightbox)
- [x] 8E: Advanced map capabilities (heatmap windows, frontlines, ADIZ, maritime, STS detection)
```

---

## Recommended build order

If working alone (sequential), the execution order is **8A → 8B → 8E → 8D → 8C**:

1. **8A-1** — NASA GIBS layers (hours, immediate WOW factor for the platform)
2. **8A-3, 8A-7** — Date picker + LayerControl SATELLITE group
3. **8B-1, 8B-2** — Counters + sparklines (uses existing data, no new APIs)
4. **8B-3 through 8B-5** — Radar chart, choropleth, diplomatic timeline
5. **8E-1** — Heatmap time-window (uses existing deck.gl HeatmapLayer)
6. **8E-2 through 8E-7** — Geofences, TripsLayer, frontlines, ADIZ, STS, push
7. **8D-1 through 8D-4** — Telegram media (new infra investment, highest OSINT value)
8. **8C-4** — Anomaly detection (browser-side, no new infra)
9. **8C-1** — Morning brief (uses existing Claude integration + data)
10. **8A-4 through 8A-6** — Copernicus + STAC + TiTiler (heavier infra)
11. **8C-2, 8C-3** — ConfliBERT NER + entity graph (Python sidecar)

---

## Definition of done — Phase 8 complete

- [ ] Satellite tile layers toggle on theater maps; GIBS date picker works
- [ ] Home page shows live counters, sparklines, radar charts, choropleth
- [ ] Morning brief panel generates BLUF-format daily assessments
- [ ] New incidents are NER-enriched within 15 minutes
- [ ] Entity graph renders for each conflict
- [ ] Telegram media appears in Media Feed panel within 5 minutes of posting
- [ ] Geotagged media shows on map
- [ ] Aircraft trails animate with TripsLayer
- [ ] Geofenced alert zone fires correctly
- [ ] Frontline layer renders for russia-ukraine
- [ ] Adding a new conflict = one `ConflictConfig` object (unchanged from Phase 7)

---

*Phase 8 authored post–Phase 7 completion.*
*Previous phases: Foundations (0) · Aircraft (1) · Naval (2) · OSINT (3) ·
Geographic Overlays (4) · AI Intelligence (5) · Economic & Cyber (6) · Polish (7)*