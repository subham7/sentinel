# SENTINEL

> Real-time conflict intelligence platform — live at [sentinelnetwork.info](https://sentinelnetwork.info)

SENTINEL is a military-grade intelligence terminal that aggregates live ADS-B flight tracking, AIS vessel tracking, OSINT incident feeds, AI analysis, satellite imagery, and financial signals across active conflict theaters. Built for analysts who need signal over noise.

---

## Features

### Intelligence Feeds
- **RSS Ingestion** — 23 curated feeds across Tier 1 (IAEA, UN, State Dept, Pentagon, CENTCOM, IDF), Tier 2 (BBC, Al Jazeera, Times of Israel, Kyiv Independent, Meduza, RFE/RL, France24, MEE), Tier 3 (Bellingcat, Crisis Group, ReliefWeb, UN S/C), and Tier 4 state-affiliated media (TASS, IRNA, Mehr) with `⚠ STATE` badges. Per-feed polling intervals (10–60 min), staggered startup.
- **GDELT** — News event geocoding, 15-min poll, no auth required.
- **ACLED** — Conflict event database with fatalities, OAuth2 token auth, daily sync.
- **Telegram** — Public OSINT channel scraper (`t.me/s/`), 3–5 min interval, no auth.
- **GNews / NewsData.io** — Supplemental breaking news, budget-capped (≤24 req/day GNews, ≤2/day NewsData), optional API keys.
- **AI Classification** — Three-pass Groq classifier (keyword gate → llama-3.1-8b-instant → llama-3.3-70b-versatile) extracts location, severity, category, actors, and confidence. OpenRouter fallback. SHA-256 Redis dedup.
- **Credibility tiers** — Every incident carries a T1–T4 source credibility badge. Analyst Mode filters to T1–T2 only.

### Tracking
- **Aircraft** — Live military positions via adsb.fi + airplanes.live. Callsign classification, ICAO type enrichment (hexdb.io), trail rendering, strike package detection. 30s poll.
- **Vessels** — Real-time AIS via AISStream WebSocket. OFAC SDN sanctions flagging, AIS-dark detection (>1h silence in tracked area), Strait of Hormuz status widget.

### Map
- **MapLibre GL JS + deck.gl** — WebGL rendering with globe projection on home page, Mercator on theater dashboards.
- **Satellite Imagery** — NASA GIBS VIIRS layers: True Color, Nighttime Lights, Thermal Anomalies. Date picker with ◄/► steppers, opacity slider, renders below all OSINT layers.
- **Static overlays** — Military bases (with strike range rings on hover), nuclear sites, SAM coverage rings, shipping lanes (animated dasharray), chokepoints.
- **Incident layers** — Heatmap + circle + label layers, click-to-fly.
- **URL-encoded state** — `?lat=&lon=&zoom=&layers=&satdate=` — shareable map views.

### AI Intelligence
- **Morning Brief** — Daily BLUF-format brief generated at 06:00 UTC. On-demand generation on first request. Fallback chain: Groq 70B → OpenRouter → Groq 8B → Anthropic Haiku. Cached 23h.
- **Sitrep** — Hourly AI situation report with threat level, actor posture, and event summary. Groq llama-3.3-70b-versatile.
- **Rhetoric Gauge** — 0–100 escalation temperature per theater, updated every 4h.
- **Entity Graph** — Actor co-occurrence graph built from 30-day incident window, rendered browser-side.
- **Anomaly Detection** — Z-score spike detection (>2.5σ vs 30-day baseline) with INCIDENT SPIKE banners.
- **Signal Convergence** — 0.5°×0.5° grid detects simultaneous aircraft + vessel + incident clustering.
- **Surge Detection** — Welford online algorithm maintains localStorage baseline and surfaces Z-score anomalies in track counts.

### Financial
- **Oil Prices** — EIA Brent (RBRTE) + WTI (RCLC1), 60-day sparkline, hourly refresh.
- **Iranian Rial** — Parallel market rate from bonbast.com (two-strategy scraper), 30-min refresh, 24h change %, depreciation bar.
- **Equity / FX** — War-premium stocks (LMT, RTX, NOC, GD, BA), currencies, commodities via yahoo-finance2 server-side proxy.
- **Prediction Markets** — Polymarket + Kalshi conflict contracts (price, volume, 24h change).

### UX
- **Breaking news ticker** — Severity ≥4 events scroll below nav with FLASH badge, pause-on-hover.
- **Emergency helplines modal** — 12-country resource list (IR, IL, LB, YE, IQ, JO, AE, SA, PK, RU, UA, US), triggered by `H` key.
- **Command palette** — `⌘K` for conflict nav, layer toggles, aircraft/incident search.
- **Keyboard shortcuts** — `L` layers, `F` feed, `H` helplines, `⌘K` search, `Esc` close.
- **Virtual scrolling** — `@tanstack/react-virtual` on incident feed, handles 1000s of items.
- **Telegram media feed** — 2-column masonry with lightbox, video playback, SSE push.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript |
| Map | MapLibre GL JS + deck.gl (WebGL) |
| Charts | Lightweight Charts v5.1.0 |
| Backend | Fastify (Node.js), TypeScript |
| Cache | Redis via Upstash (`@upstash/redis`) |
| Database | SQLite (`better-sqlite3`) |
| AI — Classification | Groq (`llama-3.1-8b-instant` / `llama-3.3-70b-versatile`) |
| AI — Briefs | Groq 70B → OpenRouter → Groq 8B → Anthropic Haiku |
| AI — Analyst Chat | Anthropic Claude Sonnet 4.6 |
| Embeddings | OpenAI `text-embedding-3-small` + vectra |
| Monorepo | Turborepo + npm workspaces |
| Fonts | Share Tech Mono, Orbitron |

---

## Repository Structure

```
sentinel/
├── apps/
│   ├── sentinel-fe/                 # Next.js 15 frontend
│   │   ├── app/conflicts/           # Home page + [slug] theater dashboards
│   │   ├── components/
│   │   │   ├── map/                 # TheaterMap, ConflictGlobe, LayerControl, layers/
│   │   │   ├── panels/              # IncidentFeed, SitrepPanel, MorningBriefPanel, MediaFeed
│   │   │   ├── financial/           # OilPrice, Rial, equity, markets widgets
│   │   │   └── ui/                  # NewsTicker, Counters, Sparklines, ThreatRadar
│   │   └── hooks/                   # useIncidentSSE, useAircraftWebSocket, useMorningBrief, ...
│   └── sentinel-api/                # Fastify backend + workers
│       └── src/
│           ├── routes/              # All API endpoints
│           ├── workers/             # adsb, ais, gdelt, acled, telegram, rss, news-api,
│           │                           sitrep, morning-brief, iaea, economic, markets
│           ├── services/            # cache, classification, deduplication, circuit-breaker
│           └── db/                  # schema.sql, queries.ts
└── packages/
    └── shared/                      # Types, ConflictConfig, rss-feeds, callsign-patterns,
                                        military-data, icao-types
```

---

## Active Theaters

| Slug | Theater | Unique Sources |
|---|---|---|
| `us-iran` | Persian Gulf / CENTCOM | EIA oil, IRR/USD rate, Hormuz widget, IAEA, IRNA, Mehr, CENTCOM RSS |
| `israel-gaza` | Levant / Gaza | IDF RSS, Times of Israel, BBC Middle East |
| `russia-ukraine` | Eastern Europe | Kyiv Independent, Meduza, TASS |

All three share: ADS-B, AIS, GDELT, ACLED, Telegram, GNews, NewsData, Al Jazeera, France24, RFE/RL, Bellingcat, Crisis Group, ReliefWeb, UN, State Dept, Pentagon RSS.

Adding a new theater = one `ConflictConfig` object in `packages/shared/src/conflicts.ts`. Zero other changes.

---

## Getting Started

### Prerequisites

- Node.js 22+
- npm 10+

### Install

```bash
git clone https://github.com/your-username/sentinel.git
cd sentinel
npm install
```

### Environment Variables

```bash
cp .env.example .env
```

```bash
# ── AI ─────────────────────────────────────────────────────────────────────
GROQ_API_KEY=              # groq.com — free tier (required for classification + sitreps)
ANTHROPIC_API_KEY=         # anthropic.com — analyst chat + brief fallback
OPENROUTER_API_KEY=        # openrouter.ai — brief fallback chain

# ── Cache ──────────────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=    # upstash.com — free tier available
UPSTASH_REDIS_REST_TOKEN=

# ── Vessel Tracking ────────────────────────────────────────────────────────
AISSTREAM_API_KEY=         # aisstream.io — free, register at site

# ── Incident Data ──────────────────────────────────────────────────────────
ACLED_EMAIL=               # acleddata.com — free academic/research access
ACLED_PASSWORD=

# ── Economic ───────────────────────────────────────────────────────────────
EIA_API_KEY=               # eia.gov/opendata — free

# ── News APIs (optional) ───────────────────────────────────────────────────
GNEWS_API_KEY=             # gnews.io — free tier (100 req/day)
NEWSDATA_API_KEY=          # newsdata.io — free tier (200 req/day)

# ── Embeddings (optional) ──────────────────────────────────────────────────
OPENAI_API_KEY=            # text-embedding-3-small for contract embeddings

# ── Telegram ───────────────────────────────────────────────────────────────
TELEGRAM_CHANNELS_US_IRAN=         # comma-separated public channel usernames
TELEGRAM_CHANNELS_ISRAEL_GAZA=
TELEGRAM_CHANNELS_RUSSIA_UKRAINE=

# ── Server ─────────────────────────────────────────────────────────────────
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

**Minimum keys to get live data:**

| Keys | Unlocks |
|---|---|
| None | Static map, overlays, UI fully functional |
| `UPSTASH_*` | Persistent caching (falls back to in-memory) |
| `GROQ_API_KEY` | AI classification, sitreps, morning brief, rhetoric gauge |
| `AISSTREAM_API_KEY` | Live vessel tracking |
| `ACLED_EMAIL` + `ACLED_PASSWORD` | ACLED conflict events |
| `EIA_API_KEY` | Oil price charts |
| `ANTHROPIC_API_KEY` | Analyst chat, brief fallback |

### Run

```bash
# Both frontend and API in parallel
npm run dev

# Or individually
npm run dev --workspace=apps/sentinel-fe   # → http://localhost:3000
npm run dev --workspace=apps/sentinel-api  # → http://localhost:3001
```

---

## Deployment

### Frontend → Vercel

1. Import repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `apps/sentinel-fe`
3. Add env var: `NEXT_PUBLIC_API_URL=https://your-api.railway.app`
4. Deploy

### API → Railway

1. New project on [railway.app](https://railway.app) → deploy from GitHub
2. **Settings → Build** → set Dockerfile path to `apps/sentinel-api/Dockerfile`
3. Add a **Volume** mounted at `/data` (persists SQLite)
4. Add all environment variables
5. Set `ALLOWED_ORIGINS=https://your-app.vercel.app`

---

## Data Sources

| Source | What | Auth | Interval |
|---|---|---|---|
| adsb.fi + airplanes.live | Live military aircraft | None | 30s |
| hexdb.io | ICAO type enrichment | None | per-aircraft |
| AISStream.io | Live vessel AIS | Free key | WebSocket |
| GDELT | News/event geocoding | None | 15 min |
| ACLED | Conflict events + fatalities | Free key | Daily |
| Telegram `t.me/s/` | OSINT channels (HTML scrape) | None | 3–5 min |
| RSS (23 feeds) | T1–T4 curated news feeds | None | 10–60 min |
| GNews | Breaking news search | Free key | 65 min |
| NewsData.io | Regional news by country | Free key | 12h |
| EIA | Brent/WTI oil prices | Free key | Hourly |
| bonbast.com | IRR/USD parallel rate | None (scrape) | 30 min |
| IAEA RSS | Nuclear site status | None | Weekly |
| NASA GIBS | Satellite imagery tiles | None | Daily |
| Polymarket / Kalshi | Prediction market contracts | None | 15 min |
| yahoo-finance2 | Equities, FX, commodities | None | 5 min |

---

## API Endpoints

```
GET  /health
GET  /api/health/freshness                       → per-source freshness timestamps
GET  /api/conflicts                              → ConflictConfig[] + live stats
GET  /api/conflicts/:slug                        → Single conflict config
GET  /api/conflicts/:slug/aircraft               → Aircraft[]
WS   /ws/conflicts/:slug/aircraft                → Aircraft[] push every 5s
GET  /api/conflicts/:slug/vessels                → Vessel[]
WS   /ws/conflicts/:slug/vessels                 → Vessel[] push every 10s
GET  /api/conflicts/:slug/incidents              → Incident[] (params: hours, severity)
GET  /api/conflicts/:slug/incidents/trend        → 30-day daily counts for anomaly detection
SSE  /api/conflicts/:slug/incidents/stream       → Live incident push
GET  /api/conflicts/:slug/sitrep                 → AI situation report (cached 1h)
GET  /api/conflicts/:slug/morning-brief          → Daily BLUF brief (cached 23h)
GET  /api/conflicts/:slug/rhetoric               → Escalation temperature 0–100 (cached 4h)
GET  /api/conflicts/:slug/entity-graph           → Actor co-occurrence graph (30d)
GET  /api/conflicts/:slug/nuclear                → Nuclear site status (IAEA + config)
GET  /api/conflicts/:slug/media                  → Telegram media (paginated)
GET  /api/conflicts/:slug/counters               → Incident/fatality counts
GET  /api/conflicts/:slug/theater                → Theater posture summary
POST /api/conflicts/:slug/analyst-chat           → Claude tool-use chat
GET  /api/economic/oil                           → Brent + WTI prices + 60d history
GET  /api/economic/rial                          → USD/IRR parallel market rate
GET  /api/financial/stocks                       → War-premium equities
GET  /api/financial/currencies                   → FX rates
GET  /api/markets/contracts                      → Polymarket + Kalshi contracts
GET  /api/signals                                → Convergence + anomaly signals
GET  /api/stats/global                           → Cross-theater incident counts
```

---

## Architecture Notes

- **Config-driven** — All conflicts, data sources, overlays, and map bounds are defined in `packages/shared/src/conflicts.ts`. Zero hardcoding in workers or components.
- **Stale > blank** — Every endpoint returns cached data when upstream APIs are down. Priority: fresh cache → stale cache (24h) → empty array. Never a 500 to the frontend.
- **Three-tier cache** — in-memory Map → Redis fresh key → Redis stale key (24h). Works without Redis credentials in dev.
- **Client-side intelligence** — Convergence detection, surge analysis, anomaly detection, strike package detection, and entity graph all run in the browser. The backend proxies and stores raw data only.
- **Keyword-gated theater assignment** — RSS/news items are only assigned to a theater if the text matches that conflict's GDELT keyword list. Prevents off-topic state media (e.g. TASS covering Iran) from polluting unrelated theater feeds.
- **Circuit breakers** — Each upstream API has its own breaker (3 failures → 5 min cooldown).
- **Rate discipline** — GNews: ≤24 req/day tracked in-process per theater. NewsData: ≤2 req/day. ADS-B: 1.1s delay between query points.

---

## License

MIT
