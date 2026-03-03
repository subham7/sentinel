# SENTINEL — AI & Intelligence Pipeline

Two-stage event classification, embedding-based contract matching, anomaly
detection, daily brief generation, and the analyst chat tool loop.

---

## Two-Stage Event Classifier (`services/classification.ts`)

### Stage 1 — Keyword Lexicon (synchronous, <5ms)
```typescript
// apps/sentinel-api/src/data/threat-lexicon.ts
export const THREAT_LEXICON: Record<Severity, string[]> = {
  critical: ['nuclear', 'wmd', 'icbm', 'ballistic missile', 'radiological', 'dirty bomb'],
  high:     ['airstrike', 'missile strike', 'warship', 'naval battle', 'artillery', 'drone strike', 'air defense'],
  medium:   ['protest', 'border incident', 'sanctions', 'detained', 'diplomatic expulsion'],
  low:      ['statement', 'meeting', 'report', 'analysis', 'commentary'],
}
```

Returns `{ severity, confidence: 0.7, source: 'keyword' }`.

### Stage 2 — Groq LLM Override (async, ~500ms)

Only runs when Stage 1 confidence < 0.9. Uses `llama-3.1-8b-instant`.
Overrides Stage 1 only if its own confidence is higher.
```typescript
const CLASSIFICATION_PROMPT = `
You are a GEOINT analyst. Return ONLY valid JSON:
{
  "event_type": "armed_conflict|missile|drone|naval|cyber|protest|diplomatic|nuclear|other",
  "severity": 1-5,
  "location": { "place": string, "lat": number|null, "lon": number|null },
  "actors": string[],
  "summary": "one sentence in English",
  "confidence": 0.0-1.0,
  "is_conflict_related": boolean
}`
```

Results cached by `sha256(text.slice(0, 500))` at `classify:{hash}` TTL 24h.
This prevents re-classifying identical content.

### Fallback Chain

`Groq llama-3.1-8b-instant` → `OpenRouter` → `keyword-only (Stage 1 result)`

---

## Anomaly Detection (`services/anomaly.service.ts`)

Runs browser-side — no backend compute required.

### Welford's Online Algorithm

Incrementally computes mean and variance of daily event counts without
storing all historical data.
```typescript
interface WelfordState { count: number; mean: number; M2: number }

function welfordUpdate(state: WelfordState, x: number): WelfordState {
  const n = state.count + 1
  const delta = x - state.mean
  const mean = state.mean + delta / n
  const M2 = state.M2 + delta * (x - mean)
  return { count: n, mean, M2 }
}

function zScore(state: WelfordState, x: number): number {
  const variance = state.M2 / (state.count - 1)
  return (x - state.mean) / Math.sqrt(variance)
}
```

**Redis key:** `anomaly:baseline:{theater}:{event_type}:{dayOfWeek}:{hour}`
(Segmented by day-of-week + hour to account for weekly/daily patterns)

**Z-score thresholds:**
| Z-score | Status | UI |
|---|---|---|
| ≥1.5 | Elevated | Amber dot in theater header |
| ≥2.0 | Significant | Amber banner above incident feed |
| ≥3.0 | Extreme | Red banner + ticker event |

**Alert format:** `"ANOMALY: Airstrike frequency in Tehran Province is 3.2σ above 90-day baseline"`

Alerts stored in Redis sorted set, expire after 24h.

---

## Country Instability Index (CII)

Composite 0–100 score per country, updated every 15 minutes.
```typescript
CII = (baseline * 0.4) + (unrest * 0.2) + (security * 0.2) + (infoVelocity * 0.2)
```

| Component | Source | Description |
|---|---|---|
| `baseline` | ACLED 90-day rolling | Historical incident mean (normalized) |
| `unrest` | Current incident rate | Normalized vs. baseline |
| `security` | Recent incidents | Severity-weighted (CRITICAL events ×3) |
| `infoVelocity` | GDELT article volume | Z-score of article count vs. 30-day mean |

Countries tracked: IR, IL, PS, RU, UA, LB, IQ, SY, YE
Display: colored badge in theater header (0–33 green · 34–66 amber · 67–100 red)
Home page: choropleth layer on globe using CII scores

---

## Morning Brief (`workers/morning-brief.worker.ts`)

Runs at **06:00 UTC daily** via `node-cron`. Model: `llama-3.3-70b-versatile`.
Cached at `morning-brief:{slug}:{YYYY-MM-DD}` TTL 23h.

### BLUF Format (ODNI ICD 203 Standard)
```
BOTTOM LINE: [1–2 sentence key judgment]

KEY JUDGMENTS:
- [HIGH CONFIDENCE] ...
- [MODERATE CONFIDENCE] ...
- [LOW CONFIDENCE] ...

SIGNIFICANT ACTIVITY (Last 24h):
- [top 5 events from ACLED/GDELT, severity-sorted]

MARKET SIGNALS:
- Polymarket: [contracts with >5% probability shift]
- Oil: [Brent price + war premium change]
- Currencies: [ILS/IRR/RUB notable moves]

ANOMALIES: [active Z-score alerts, if any]

OUTLOOK (24–48h): [forward assessment]

CONFIDENCE: HIGH | MODERATE | LOW
SOURCES: ACLED (n=47), GDELT (n=312), ADS-B (n=23 tracks), Telegram (n=18)
```

**Confidence language maps to ODNI probabilities:**
- HIGH: corroborated by 3+ independent sources
- MODERATE: credible sourcing, some analytical gaps
- LOW: fragmentary, significant assumptions required

---

## Rhetoric Temperature Gauge

**Route:** `POST /api/conflicts/:slug/rhetoric`
**Cache:** `rhetoric:{slug}` TTL 4h
**Model:** Groq `llama-3.1-8b-instant` → Anthropic Haiku fallback

Scores official Telegram channel posts 0–100 on an escalatory language rubric:
`0=routine · 25=elevated · 50=threatening · 75=crisis · 100=imminent`

---

## Analyst Chat (`routes/analyst-chat.ts`)

**Model:** Claude Sonnet 4.6 with tool use. Max 5 tool-call iterations per request.

### Available Tools (scoped per conflict slug)
```typescript
tools = [
  'query_incidents',        // filter by type, severity, time, bbox
  'get_aircraft_by_type',   // filter by mil/type/side
  'get_vessel_status',      // vessel details + AIS-dark status
  'get_theater_posture',    // current TheaterPosture object
  'get_entity_graph',       // actor co-occurrence network
  'match_contracts',        // find Polymarket/Kalshi contracts related to a topic
  'lookup_entity',          // OpenSanctions cross-reference
]
```

Tool results are scoped to the current theater — the analyst cannot query
data from other theaters in a single session.

---

## Groq Rate Limiting

Free tier: 14,400 requests/day

Strategies to stay within limits:
1. Redis cache by `sha256(text)` — one Groq call per unique text content
2. Stage 1 keyword filter — Groq only called when keyword confidence < 0.9
3. 70B model only for daily brief (low volume) — 8B for everything else
4. OpenRouter fallback when Groq quota exhausted