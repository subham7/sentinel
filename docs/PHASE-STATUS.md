# SENTINEL — Phase Status
Last updated: 2026-03-03

---

## ✅ COMPLETE

### Phases 1–6: Foundation
- Turborepo monorepo: apps/sentinel-fe, apps/sentinel-api, packages/shared
- ConflictConfig system — every theater derives from one config object
- Three-tier Redis cache with in-flight stampede prevention
- deck.gl + MapLibre map infrastructure (WebGL layers)
- ADS-B aircraft tracking (adsb.fi + airplanes.live + hexdb.io enrichment + ICAO type DB)
- AIS vessel tracking (AISStream WebSocket) + OFAC SDN sanctions flagging
- AIS-dark detection (gap >1h in tracked area → `ais_dark_events` table)
- GDELT + ACLED incident ingestion + cross-conflict multi-slug tagging
- Telegram HTML scraper (`t.me/s/{channel}`, 3–5 min interval)
- 3-pass Groq classifier + Redis dedup by sha256 + OpenRouter fallback
- Geographic overlays: military bases, SAM rings, nuclear sites, shipping lanes, chokepoints
- Strike range rings on base hover (turf.js multi-ring circles)
- Animated shipping lane dasharray (14-frame RAF loop)
- AI sitrep (Groq llama-3.3-70b, hourly, cached 1h)
- Analyst chat (Claude Sonnet 4.6, 5 tool-call iterations, conflict-scoped tools)
- Economic widgets: Brent/WTI (EIA), IRR (Bonbast two-strategy scraper)
- Hormuz vessel counter widget (us-iran only)
- Virtual scrolling on incident feed (@tanstack/react-virtual)
- WebSocket/SSE pause on hidden tab + 2-min inactivity
- Keyboard shortcuts: L / F / ⌘K / Esc
- Command palette: conflict nav, layer toggles, aircraft/incident search

### Phase 7: Multi-Conflict Platform ✅
- Russia–Ukraine added as config-only proof — zero code changes outside conflicts.ts
- URL-encoded map state: `?lat=&lon=&zoom=&layers=&satdate=`
- Live at sentinelnetwork.info

### Phase 8A — Satellite Imagery (partial)
- [x] NASA GIBS VIIRS tile layers: True Color, Nighttime Lights, Thermal Anomalies
- [x] Date picker with ◄/► day steppers in LayerControl
- [x] SATELLITE group in LayerControl with opacity slider

### Phase 8B — Home Page Widgets (partial)
- [x] Animated incident counters (GlobalIncidentCounter.tsx, react-countup)
- [x] 30-day escalation sparklines per conflict card (ThreatSparklines.tsx, @tremor/react)
- [x] 6-axis threat radar chart per conflict card (ThreatRadar.tsx, Recharts)
- [x] Diplomatic event timeline with live countdowns (DiplomaticTimeline.tsx)

### Phase 8C — AI Intelligence Features ✅
- [x] Morning brief worker (06:00 UTC, BLUF format, Groq 70B → Anthropic → OpenRouter)
      Route: GET /api/conflicts/:slug/morning-brief · Cache: 23h
- [x] Entity relationship graph (actor co-occurrence, browser-side, 30d window)
      Route: GET /api/conflicts/:slug/entity-graph
- [x] Z-score anomaly detection: SPIKE (>2.5σ) + SURGE (7d trend)
      Service: anomaly.service.ts (browser-side Welford)
- [x] Rhetoric temperature gauge (0–100, Groq → Anthropic Haiku, 4h cache)
      Route: GET /api/conflicts/:slug/rhetoric
- [x] Incident trend endpoint: GET /api/conflicts/:slug/incidents/trend?days=30

### Phase 8D — Telegram Media (partial)
- [x] Media API: GET /api/conflicts/:slug/media (paginated, type filter)
- [x] MediaFeed.tsx: 2-column masonry, lightbox, video playback, SSE new-item push

---

## 🔨 IN PROGRESS — Phase 8

### Sprint 1: Instant Differentiators
- [ ] **Breaking news ticker** — WebSocket-driven, CRITICAL/HIGH only, sticky below nav
      Component: `ui/NewsTicker.tsx` · Source: existing incident feed
      Config: auto-scroll, pause-on-hover, source badge per item
- [ ] **Emergency helplines modal** — static `data/emergency-helplines.json`, 12 countries
      Triggered by `H` keyboard shortcut + footer link. Zero API needed.
      Countries: IR, IL, LB, YE, IQ, JO, AE, SA, PK, RU, UA, US
- [ ] **Data freshness monitor** — `GET /api/health/freshness`
      Redis key `freshness:{source}` = ISO timestamp of last successful fetch
      Status: fresh (<15min) · stale (<1h) · very_stale (<6h) · error
      Component: `panels/DataFreshness.tsx` (already scaffolded — wire up the endpoint)
- [ ] **Casualty + incident counters** — ACLED `fatalities` field, MIL/CIV split
      Component: `ui/TheaterCounters.tsx` · Library: `react-countup`
      Counters: incidents (30d) · killed (est.) · aircraft tracked · vessels tracked

### Sprint 2: Financial Intelligence Layer
- [ ] **Lightweight Charts v5.1.0** — `FinancialChart.tsx` base component
      OSINT event markers overlay: `createSeriesMarkers()`, colors → `--sev-*` tokens
      Dual-pane: price chart 70% + volume histogram 30%
- [ ] **EIA futures curve + war premium** — add `RCLC1`–`RCLC4` series to existing EIA worker
      `warPremium = (spot - futures3Month) / futures3Month * 100`
      Widget: `financial/WarPremiumWidget.tsx` (us-iran only)
- [ ] **FRED signals** — VIX (`VIXCLS`), OVX (`OVXCLS`), Gold (`GOLDAMGBD228NLBM`)
      Route: `GET /api/financial/fred/:series` · Cache: 24h · Needs: `FRED_API_KEY`
- [ ] **Defense stock sparklines** — `yahoo-finance2` server-side, watchlist.ts
      Route: `GET /api/financial/equities` · Cache: 5min market hours / 15min off-hours
      Market status badge: PRE-MARKET / OPEN / AFTER-HOURS / CLOSED
- [ ] **Currency signals** — ILS (Frankfurter, no key), RUB (ExchangeRate-API)
      Navasan as Bonbast backup for IRR (120 calls/month free, `NAVASAN_API_KEY`)
      Alert: >2% ILS single-day move = Bank of Israel intervention signal
- [ ] **OpenSanctions entity matching** — wire into analyst chat `lookup_entity` tool
      Needs: `OPENSANCTIONS_API_KEY` (free for open-source)
- [ ] **IMF PortWatch chokepoint monitor** — ArcGIS GeoServices REST, no auth
      Chokepoints: Hormuz, Suez, Bab el-Mandeb · Cache: 24h · Update: Tuesdays
      Alert threshold: disruptionIndex > 0.15 → ticker event

### Sprint 3: OSINT-to-Market Pipeline
- [ ] **Polymarket contract index** — Gamma API, no auth, keyword filter per theater
      ⚠️ `outcomePrices` + `clobTokenIds` are stringified JSON — always `JSON.parse()`
      Route: `GET /api/markets/polymarket` · Cache: 10min
- [ ] **Polymarket WebSocket streaming** — `wss://ws-subscriptions-clob.polymarket.com`
      Flash animation on moves >3% in 5 min via existing SSE infrastructure
- [ ] **OSINT-to-contract semantic matching** — vectra + `text-embedding-3-small`
      Worker: `contract-embeddings.worker.ts` (15-min cycle)
      Thresholds: ≥0.80 auto-surface · 0.70–0.79 flag · <0.70 discard
      Needs: `OPENAI_API_KEY`
- [ ] **Kalshi contracts** — `api.elections.kalshi.com/trade-api/v2`, no auth
      Prices in cents (÷100 for parity) · Merge with Polymarket in unified panel

### Sprint 4: Map Intelligence
- [ ] **Internet connectivity panel** — 3-bar widget per theater (Cloudflare + IODA + OONI)
      Route: `GET /api/signals/internet/:countryCode`
      Needs: `CLOUDFLARE_RADAR_TOKEN` (free)
      Status: NORMAL / DEGRADED / DISRUPTED / BLOCKED
- [ ] **GPS/GNSS jamming layer** — GPSJam.org daily GeoJSON, no auth
      deck.gl `GridLayer`, opacity → jamming intensity, cache 24h
      Layer group: SIGNALS · Color: transparent → amber → red
- [ ] **VIIRS nighttime lights base layer** — NASA GIBS, no API key
      Alternative base map; date picker for blackout detection
- [ ] **SAM engagement ring visualization** — static `data/sam-positions.json`
      deck.gl ScatterplotLayer (center) + circle primitive (engagement envelope)
      Color: blue = US/Allied, red = Iran/adversary, green = Israel
- [ ] **Time-windowed incident heatmap** — deck.gl `HeatmapLayer` time selector
      Windows: 24H / 7D / 30D / ALL · Weight = incident severity (1–5)
      Auto-activates when >50 incidents visible

### Sprint 5: AI Signal Processing
- [ ] **Two-stage event classifier** — keyword lexicon Stage 1 + Groq 8B Stage 2
      Stage 2 only runs when Stage 1 confidence <0.9
      Wire into: ticker filter, contract matching metadata
- [ ] **Welford anomaly detection** — Redis-backed 90-day baseline, browser-side
      Segments: event_type × theater × day_of_week × hour
      Alerts: 1.5σ elevated · 2.0σ significant · 3.0σ extreme
- [ ] **AI morning brief (BLUF)** — already complete in Phase 8C ✅ (verify cron is live)
- [x] **Country Instability Index (CII)** — 0–100 composite score, 15-min update
      Formula: `(baseline×0.4) + (unrest×0.2) + (security×0.2) + (velocity×0.2)`
      Service: `services/cii.service.ts` (browser-side, pure TS)
      Theater header: colored badge (CII NN LEVEL) with tooltip breakdown

### Sprint 6: Content Enrichment
- [ ] **Source credibility tiering** — extend ConflictConfig with `sources[]` array
      T1 blue (Reuters/AP/BBC) · T2 green (Haaretz/Kyiv Independent) · T3 amber (Bellingcat/ISW) · T4 red ⚠️ (RT/TASS/PressTV)
      Filter toggle: "Tier 1–2 only" for analyst mode
- [ ] **Live TV embed panel** — YouTube live stream IDs (no API key)
      Lazy-load via Intersection Observer · auto-pause 5min · destroy when hidden
      Per-theater presets: us-iran → Iran International + Al Arabiya + Bloomberg
- [ ] **Webcam grid panel** — 2×2 iframe grid, region tabs (ALL/MIDEAST/IRAN/EUROPE)
      Same Intersection Observer + pause pattern as TV embeds
- [ ] **Telegram MTProto media extraction** — replace HTML scraper with `@mtcute/node`
      Sharp WebP conversion + thumbnails · NSFWJS classification (nsfw_score >0.6 hidden)
      Perceptual hash dedup (Hamming distance <5 = near-duplicate, skip)
      EXIF geolocation extraction via `exifr`
      Needs: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION_STRING`
      Needs: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

### Sprint 7: Platform Scale
- [ ] **Multi-language + RTL** — `next-intl`, locales: en / ar / fa / he
      `dir="rtl"` on `<html>` for ar/fa/he · flip flex directions · auto-detect browser lang
      AI briefs: pass `language` param to Groq for translated output
- [ ] **Historical playback / Time Machine** — timeline scrubber below map
      Range: 6H → 24H → 7D → 30D · Speed: 1× / 5× / 10× / 50×
      ADS-B/AIS: 72h position history in Redis sorted sets
      URL deep link: `?playback=ISO_TIMESTAMP`
- [ ] **NASA FIRMS thermal WMS** — WMS overlay via `FIRMS_MAP_KEY`
      URL: `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/{key}/...`
      Layer: FIRMS_VIIRS_NOAA20_24 · Sublayer under SATELLITE in LayerControl
- [ ] **Before/after comparison slider** — `maplibre-gl-compare-plus`
      Two sync'd panels, draggable divider · left=before date, right=after date
      Activated by COMPARE MODE toggle in LayerControl (only when satellite layer active)
- [ ] **Copernicus Sentinel-2 10m imagery** — Sentinel Hub WMS via OAuth2 proxy
      Backend mints short-lived tokens: `GET /api/conflicts/:slug/satellite/wms-token`
      Needs: `SENTINEL_HUB_CLIENT_ID`, `SENTINEL_HUB_CLIENT_SECRET`
- [ ] **STAC scene discovery** — Element84 Earth Search daily poll per conflict bbox
      `POST https://earth-search.aws.element84.com/v1/search` (Sentinel-2 L2A, cloud <20%)
      Stores scene metadata in SQLite · Date picker highlights available dates in green
      Route: `GET /api/conflicts/:slug/satellite/scenes`
- [ ] **Global conflict choropleth** — UCDP GED API on home globe
      `GET https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=1&StartDate=2025-01-01`
      Country-level intensity bucket (0–4) as MapLibre fill layer, opacity 0.3
      Cache: `GET /api/intel/global-intensity` TTL 24h
- [ ] **Draggable widget grid** — `react-grid-layout` on home page
      Save layout to `localStorage` under `sentinel:home-layout`
      Reset Layout button
- [ ] **Entity graph with Cytoscape.js** — replace browser-side SVG with full layout
      `cytoscape` + `cytoscape-d3-force` · force-directed, gravity 0.3, repulsion 4500
      Click node → filter incident feed by actor
- [ ] **ConfliBERT NER microservice** — Python/FastAPI Docker sidecar (port 8001)
      Model: `snowood1/ConfliBERT-scr-uncased` · Endpoint: `POST /extract`
      `ner-enrichment.worker.ts` enriches 50 most-recent unclassified incidents every 15min
      Writes to `incident_entities` table
      Needs: `NER_SERVICE_URL=http://ner-service:8001`
- [ ] **Geotagged media map layer** — `MediaLayer.tsx`, camera icon markers
      Only renders when EXIF lat/lon present on media items
      Layer group: SIGNALS · Click → MediaCard popup
- [ ] **TripsLayer animated aircraft trails** — replace PathLayer with deck.gl TripsLayer
      `@deck.gl/geo-layers` · `fadeTrail: true` · `trailLength: 180s`
      Route: `GET /api/conflicts/:slug/aircraft/:icao24/trail?hours=4`
- [ ] **Frontline / territorial control layer** — GeoJSON per conflict in `packages/shared`
      `packages/shared/src/frontlines.ts` — community-PR'd GeoJSON updates
      Render: MapLibre fill layer, Ukrainian blue / Russian red / contested amber hatched
      Uncertainty band: `turf.buffer(frontline, 5, 'km')` at 5% opacity
- [ ] **ADIZ + maritime boundary layers** — static GeoJSON in `packages/shared/src/adiz.ts`
      ADIZ: Iran, Israeli airspace, CENTCOM-relevant zones
      EEZ / territorial waters: 12NM + 24NM zones for Persian Gulf states
      Source: MarineRegions.org shapefiles (CC BY 4.0), pre-converted to GeoJSON
      Layer group: INFRASTRUCTURE
- [ ] **AIS ship-to-ship transfer detection** — extend `vessel-id.service.ts`
      Heuristic: both SOG <1kt + distance <500m for >2h + tanker type + not in port
      Write to `ais_sts_events` table · Render link icon between vessel markers
- [ ] **Web Push notifications (VAPID)** — `web-push` npm package + Service Worker
      `POST /api/push/subscribe` stores PushSubscription in SQLite
      Fires on FLASH-tier alerts only
      Needs: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`

---

## ⏸ DEFERRED (conscious decisions, revisit after revenue)

| Feature | Reason |
|---|---|
| X/Twitter API | $100/month minimum for useful access tier |
| TradingView embedded widgets | Redundant with Lightweight Charts investment |
| Browser-side Transformers.js ML | ~5MB model download; revisit post-RTL |
| Victim/memorial database | Sensitive; requires careful editorial pipeline |