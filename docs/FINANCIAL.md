# SENTINEL — Data Sources & Environment Variables

Every external integration, its endpoints, rate limits, and env var.

---

## Environment Variables (Complete List)
```bash
# ── AI ──────────────────────────────────────────────────────────────────────
GROQ_API_KEY=           # groq.com — free 14,400 req/day
ANTHROPIC_API_KEY=      # anthropic.com — analyst chat (claude-sonnet-4-6)
OPENROUTER_API_KEY=     # openrouter.ai — Groq fallback (50 req/day free)
OPENAI_API_KEY=         # openai.com — text-embedding-3-small (~$0.02/1M tokens)

# ── Cache ────────────────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ── Aircraft ─────────────────────────────────────────────────────────────────
# adsb.fi is primary and requires no auth
OPENSKY_USERNAME=       # optional backup
OPENSKY_PASSWORD=

# ── Vessels ──────────────────────────────────────────────────────────────────
AISSTREAM_API_KEY=      # aisstream.io — free registration

# ── OSINT ────────────────────────────────────────────────────────────────────
ACLED_EMAIL=            # acleddata.com — OAuth2 account email
ACLED_PASSWORD=         # acleddata.com — account password

# ── Economic ─────────────────────────────────────────────────────────────────
EIA_API_KEY=            # eia.gov/opendata — free
FRED_API_KEY=           # fred.stlouisfed.org — free
NAVASAN_API_KEY=        # navasan.tech — 120 calls/month free; key via @navasan_contact_bot on Telegram
CLOUDFLARE_RADAR_TOKEN= # Cloudflare dashboard → My Profile → API Tokens (free)

# ── Prediction Markets ────────────────────────────────────────────────────────
# Polymarket: no auth needed for read endpoints
# Kalshi: no auth for read endpoints

# ── Sanctions / Entity ────────────────────────────────────────────────────────
OPENSANCTIONS_API_KEY=  # opensanctions.org/api — free for open-source projects

# ── Telegram ─────────────────────────────────────────────────────────────────
TELEGRAM_CHANNELS_US_IRAN=       # comma-separated public channel usernames, no @
TELEGRAM_CHANNELS_ISRAEL_GAZA=
TELEGRAM_CHANNELS_RUSSIA_UKRAINE=
# MTProto (for media extraction):
TELEGRAM_API_ID=        # my.telegram.org/apps
TELEGRAM_API_HASH=      # my.telegram.org/apps
TELEGRAM_SESSION_STRING= # generate once: npx ts-node scripts/telegram-auth.ts

# ── Media Storage (Cloudflare R2) ─────────────────────────────────────────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=sentinel-media
R2_PUBLIC_URL=          # https://{account}.r2.cloudflarestorage.com

# ── Satellite Imagery ─────────────────────────────────────────────────────────
FIRMS_MAP_KEY=          # firms.modaps.eosdis.nasa.gov — free registration
# NASA GIBS tiles require no auth

# ── Push Notifications ────────────────────────────────────────────────────────
VAPID_PUBLIC_KEY=       # generate: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_EMAIL=            # mailto:your@email.com

# ── Server ────────────────────────────────────────────────────────────────────
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

---

## Aircraft Tracking

| Source | Endpoint | Auth | Rate Limit |
|---|---|---|---|
| adsb.fi (primary) | `https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}` | None | 1 req/s |
| adsb.fi military | `https://opendata.adsb.fi/api/v2/mil` | None | 1 req/s |
| airplanes.live (backup) | `https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}` | None | 1 req/s |
| ADSBx hex DB | `https://downloads.adsbexchange.com/downloads/basic-ac-db.json.gz` | None | Download once |
| hexdb.io enrichment | `https://hexdb.io/api/v1/aircraft/{hex}` | None | 1.1M/day |
| OpenSky (optional) | `https://opensky-network.org/api/states/all` | Optional | 400 credits/day |

---

## Vessel Tracking

| Source | Endpoint | Auth | Notes |
|---|---|---|---|
| AISStream.io | `wss://stream.aisstream.io/v0/stream` | Free API key | WebSocket, bbox filter |
| OFAC SDN List | `https://ofac.treasury.gov/...` | None | Download weekly |
| Global Fishing Watch | `https://gateway.api.globalfishingwatch.org/v3/` | Free key | AIS gaps, SAR |

---

## OSINT / Incidents

| Source | Endpoint | Auth | Update Freq |
|---|---|---|---|
| GDELT GEO | `https://api.gdeltproject.org/api/v2/geo/geo` | None | 15 min |
| GDELT DOC | `https://api.gdeltproject.org/api/v2/doc/doc` | None | 15 min |
| ACLED | `https://api.acleddata.com/acled/read` | OAuth2 | Weekly (Sat) |
| Telegram | `https://t.me/s/{channel}` (HTML scraper) / MTProto | None / API keys | 3–5 min |

---

## Economic & Financial

| Source | Endpoint | Auth | Update Freq | Theater |
|---|---|---|---|---|
| EIA (Brent/WTI) | `https://api.eia.gov/v2/petroleum/pri/spt/data/` | Free key | Daily 3:30 PM ET | us-iran |
| EIA Futures | `RCLC1`–`RCLC4` series via same EIA endpoint | Free key | Daily | us-iran |
| Bonbast (IRR) | `https://www.bonbast.com` | None (scrape) | 30 min | us-iran |
| Navasan (IRR backup) | `https://api.navasan.tech/latest/?api_key=KEY&item=usd_sell` | Free key | 2h | us-iran |
| Frankfurter (ILS) | `https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS` | None | Daily | israel-gaza |
| ExchangeRate-API (RUB) | `https://v6.exchangerate-api.com/v6/{key}/latest/USD` | Free (1,500/mo) | Daily | russia-ukraine |
| FRED | `https://api.stlouisfed.org/fred/series/observations?series_id={id}` | Free key | Daily | all |
| yahoo-finance2 | server-side npm package | None (ToS) | 5 min market hours | all |
| IMF PortWatch | ArcGIS GeoServices REST (public) | None | Weekly (Tues) | us-iran |
| OpenSanctions | `https://api.opensanctions.org/match/default` | Free key | Daily | all |

### FRED Series Reference

| Series ID | Metric | Conflict Relevance |
|---|---|---|
| `VIXCLS` | CBOE VIX | General market fear |
| `OVXCLS` | Oil Volatility Index | Hormuz/supply disruption |
| `GOLDAMGBD228NLBM` | Gold price (USD/oz) | Safe-haven demand |

### Equity Watchlist (`apps/sentinel-api/src/data/watchlist.ts`)
```typescript
export const WATCHLIST = {
  defense:     ['RTX', 'LMT', 'NOC', 'BA', 'GD', 'KTOS', 'LHX'],
  israelDef:   ['ESLT', 'ESLT.TA'],
  defenseETFs: ['ITA', 'XAR'],
  energy:      ['XOM', 'CVX', 'XLE'],
  volatility:  ['^VIX', '^OVX'],
}
```

---

## Prediction Markets

| Source | Base URL | Auth | Notes |
|---|---|---|---|
| Polymarket Gamma | `https://gamma-api.polymarket.com/markets` | None | ⚠️ `outcomePrices` is stringified JSON — always `JSON.parse()` |
| Polymarket WS | `wss://ws-subscriptions-clob.polymarket.com` | None | Subscribe by `clobTokenIds` |
| Kalshi | `https://api.elections.kalshi.com/trade-api/v2` | None for reads | Prices in cents (0–100) — divide by 100 |

---

## Signals / Intelligence

| Source | Endpoint | Auth | Notes |
|---|---|---|---|
| Cloudflare Radar | `https://api.cloudflare.com/client/v4/radar/traffic/timeseries` | Free token | Per-country traffic anomalies |
| IODA | `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/country` | None | BGP + probing + darknet |
| OONI | `https://api.ooni.io/api/v1/measurements?probe_cc={cc}` | None | Censorship measurements |
| GPSJam | `https://gpsjam.org/export.json?day=YYYY-MM-DD` | None | Daily jamming GeoJSON |
| NASA GIBS | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/...` | None | Satellite tiles |
| NASA FIRMS | `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/{key}/...` | Free key | Thermal WMS |