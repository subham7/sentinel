# SENTINEL — Conflict Intelligence Platform
**Live:** sentinelnetwork.info | **Phase 7** ✅ | **Phase 8** 🔨 in progress

Real-time multi-conflict intelligence terminal: ADS-B aircraft, AIS vessels,
OSINT incidents, AI analysis, and financial signals across active conflict theaters.

> **Before touching any area of the codebase, read the relevant doc first:**
> Architecture / cache / DB schema → `docs/ARCHITECTURE.md`
> Adding or changing a conflict theater → `docs/THEATERS.md`
> API integrations and every env var → `docs/DATA-SOURCES.md`
> Financial terminal (charts, EIA, FRED, stocks, markets) → `docs/FINANCIAL.md`
> AI classification, embeddings, anomaly detection → `docs/PIPELINE.md`
> Map layers, deck.gl, MapLibre config → `docs/MAP-LAYERS.md`
> What's built, in progress, and planned → `docs/PHASE-STATUS.md`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript, Tailwind CSS |
| Map | MapLibre GL JS + deck.gl (WebGL) |
| Charts | Lightweight Charts v5.1.0 (Apache-2.0) |
| Backend | Fastify (Node.js, TypeScript) |
| Cache | Redis via Upstash (`@upstash/redis`) |
| Database | SQLite (`better-sqlite3`) |
| State | Zustand (global) + TanStack Query (server state) |
| AI | Groq Llama 3.1 8B / 70B + Claude Sonnet 4.6 (analyst chat) |
| Embeddings | OpenAI `text-embedding-3-small` + vectra (local vector store) |
| Media | Cloudflare R2 + Sharp + `@mtcute/node` |
| Monorepo | Turborepo + npm workspaces |
| Fonts | Share Tech Mono, Orbitron (military terminal aesthetic) |

---

## Repository Structure
```
sentinel/
├── CLAUDE.md                        ← this file (orientation only)
├── docs/                            ← load the relevant file before working in that area
│   ├── ARCHITECTURE.md
│   ├── THEATERS.md
│   ├── DATA-SOURCES.md
│   ├── FINANCIAL.md
│   ├── AI-PIPELINE.md
│   ├── MAP-LAYERS.md
│   └── PHASE-STATUS.md
├── apps/
│   ├── sentinel-fe/                 ← Next.js 15 frontend
│   │   ├── app/conflicts/           ← home page + [slug] theater dashboards
│   │   ├── components/
│   │   │   ├── map/                 ← ConflictGlobe, TheaterMap, layers/, LayerControl
│   │   │   ├── charts/              ← FinancialChart, Sparkline wrappers
│   │   │   ├── financial/           ← EIA, FRED, stocks, currencies, PortWatch
│   │   │   ├── markets/             ← Polymarket + Kalshi panels
│   │   │   ├── panels/              ← IncidentFeed, TrackList, SitrepPanel, AnalystChat
│   │   │   └── ui/                  ← SeverityBadge, IntensityBar, Ticker, Counters
│   │   └── hooks/                   ← useAircraftWebSocket, useIncidentSSE, etc.
│   └── sentinel-api/                ← Fastify backend
│       └── src/
│           ├── routes/              ← conflicts, aircraft, vessels, incidents,
│           │                           sitrep, economic, financial, markets, signals
│           ├── workers/             ← adsb, ais, gdelt, acled, telegram, sitrep,
│           │                           morning-brief, anomaly, contract-embeddings
│           ├── services/            ← cache, classification, deduplication,
│           │                           vessel-id, circuit-breaker, anomaly, embeddings
│           └── db/                  ← schema.sql, queries.ts
└── packages/
    └── shared/                      ← Aircraft, Vessel, Incident, ConflictConfig,
                                        callsign-patterns, icao-types, military-data
```

---

## Active Theaters

`us-iran` · `israel-gaza` · `russia-ukraine`

Adding a theater = one `ConflictConfig` object. Zero other changes required.
→ Full guide: `docs/THEATERS.md`

---

## Non-Negotiable Rules

**1. Config over code.** All theater-specific data (keywords, bboxes, overlays,
API filters) lives in `ConflictConfig`. Never hardcode a country name, coordinate,
or theater slug inside a worker, route, or component.

**2. Three-tier cache, always.** Every upstream API call must go through
`cachedFetchJson`: in-memory Map → Redis fresh → Redis stale (24h) → upstream.
Never call external APIs directly from a component or route handler.
→ Implementation: `docs/ARCHITECTURE.md`

**3. Stale > blank.** Always return stale cache over an error. Return `[]` over a
500. The frontend must never render a blank panel due to a backend failure.

**4. Financial data is server-side only.** `yahoo-finance2` has CORS restrictions.
All equity and market data fetches happen in Fastify routes, never in the browser.

**5. TypeScript strict, no `any`.** `tsconfig strict: true` across all packages.
Shared types live in `packages/shared/src/types/` — never duplicate them locally.

**6. Severity vocabulary is canonical.** Only: `critical · high · medium · low`
These map 1:1 to `--sev-critical` through `--sev-low` CSS tokens. Never introduce
new severity labels anywhere in the stack.

**7. AI content is always attributed.** Every AI-generated string cached in Redis
must carry `{ model, generatedAt, theater, promptVersion }`. Never surface stale
AI content without a visible timestamp in the UI.

**8. Client-side intelligence, server-side data.** Signal aggregation, CII scoring,
convergence detection, and anomaly alerts all run in the browser. The backend only
proxies, caches, and stores raw data.

---

## Design System (Summary)

Military operations terminal. No white backgrounds, no light mode, monospace everywhere.
```css
--bg-base: #0a0e1a  --bg-surface: #0d1224  --bg-elevated: #111827
--text-primary: #e2e8f0  --text-secondary: #94a3b8  --text-muted: #475569
--sev-critical: #ef4444  --sev-high: #f97316  --sev-medium: #eab308  --sev-low: #22c55e
--price-up: #26a69a  --price-down: #ef5350  --chart-line: #2962ff
```

Max border-radius: `4px`. No `box-shadow` — use `border` only. No loading spinners —
use skeleton pulse. Full token list and component patterns: `docs/MAP-LAYERS.md`

---

## Running Locally
```bash
npm install
cp .env.example .env    # see docs/DATA-SOURCES.md for every variable
npm run dev             # fe → localhost:3000, api → localhost:3001
```

**Minimum keys:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`GROQ_API_KEY`, `ACLED_EMAIL`, `ACLED_PASSWORD`, `EIA_API_KEY`