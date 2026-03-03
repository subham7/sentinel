// Prediction markets worker
// Polls Polymarket (public API, no auth) every 15 minutes.
// Optionally polls Kalshi if KALSHI_API_KEY is set.
// Filters markets by conflict keywords, scores relevance via keyword overlap
// + optional Groq semantic scoring for top candidates.
// Writes: markets:{slug} (TTL 30min), markets:{slug}:stale (TTL 24h)

import { ALL_CONFLICTS } from '@sentinel/shared'
import type { PredictionMarket } from '@sentinel/shared'
import { cacheGet, cacheSet, writeFreshness } from '../services/cache.js'
import { getRecentIncidents } from '../db/queries.js'

const POLL_MS        = 15 * 60 * 1000
const POLYMARKET_API = 'https://gamma-api.polymarket.com/markets'
const KALSHI_API     = 'https://api.kalshi.com/trade-api/v2/markets'

// ── Polymarket ────────────────────────────────────────────────────────────────

interface PolyMarket {
  id:          string
  question:    string
  outcomePrices: string         // JSON array e.g. "[0.65, 0.35]"
  volume:      number
  volume24hr:  number
  active:      boolean
  closed:      boolean
  endDate:     string | null
  slug:        string           // used for URL
  conditionId?: string
}

async function fetchPolymarket(keyword: string): Promise<PolyMarket[]> {
  try {
    const params = new URLSearchParams({
      active:  'true',
      closed:  'false',
      search:  keyword,
      limit:   '20',
    })
    const resp = await fetch(`${POLYMARKET_API}?${params}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'Accept': 'application/json' },
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

function parsePolyProb(outcomePrices: string): number {
  try {
    const arr = JSON.parse(outcomePrices) as number[]
    return arr[0] ?? 0.5
  } catch { return 0.5 }
}

// ── Kalshi ───────────────────────────────────────────────────────────────────

interface KalshiMarket {
  ticker:        string
  title:         string
  yes_bid:       number   // cents (0–100)
  yes_ask:       number
  volume:        number
  volume_24h:    number
  close_time:    string | null
  status:        string
}

async function fetchKalshi(keyword: string, apiKey: string): Promise<KalshiMarket[]> {
  try {
    const params = new URLSearchParams({
      limit:  '20',
      status: 'open',
      search: keyword,
    })
    const resp = await fetch(`${KALSHI_API}?${params}`, {
      signal:  AbortSignal.timeout(15_000),
      headers: {
        'Accept':        'application/json',
        'Authorization': `Token ${apiKey}`,
      },
    })
    if (!resp.ok) return []
    const data = await resp.json() as { markets?: KalshiMarket[] }
    return data.markets ?? []
  } catch { return [] }
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

// Score 0–1 based on how many conflict keywords appear in the market question.
function keywordScore(question: string, keywords: string[]): { score: number; matched: string[] } {
  const q = question.toLowerCase()
  const matched = keywords.filter(kw => q.includes(kw.toLowerCase()))
  const score   = matched.length === 0 ? 0
                : matched.length === 1 ? 0.4
                : matched.length === 2 ? 0.7
                : 1.0
  return { score, matched }
}

// Optional Groq semantic scoring for high-signal markets
async function groqRelevanceScore(
  question:   string,
  slug:       string,
  keywords:   string[],
  recentTitles: string[],
): Promise<number> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey || !recentTitles.length) return 0

  try {
    const body = {
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are a geospatial intelligence analyst. Respond with ONLY a JSON object: {"score": <0.0-1.0>}',
        },
        {
          role: 'user',
          content: `Prediction market: "${question}"\n\nConflict: ${slug}\nKeywords: ${keywords.join(', ')}\nRecent incidents: ${recentTitles.slice(0, 5).join(' | ')}\n\nHow relevant is this market to monitoring this conflict? Score 0.0 (irrelevant) to 1.0 (directly relevant).`,
        },
      ],
      max_tokens:      50,
      temperature:     0,
      response_format: { type: 'json_object' },
    }
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return 0
    const json = await resp.json() as { choices: { message: { content: string } }[] }
    const parsed = JSON.parse(json.choices[0]?.message?.content ?? '{}') as { score?: number }
    return Math.min(1, Math.max(0, parsed.score ?? 0))
  } catch { return 0 }
}

// ── Main poll ─────────────────────────────────────────────────────────────────

async function pollMarkets(): Promise<void> {
  const kalshiKey = process.env.KALSHI_API_KEY

  for (const conflict of ALL_CONFLICTS) {
    const keywords = conflict.dataSources.gdelt.keywords

    try {
      // Fetch from Polymarket using first 3 keywords to cover different angles
      const polySearches = await Promise.all(
        keywords.slice(0, 3).map(kw => fetchPolymarket(kw))
      )
      const polyRaw: PolyMarket[] = []
      const seen = new Set<string>()
      for (const batch of polySearches) {
        for (const m of batch) {
          if (!seen.has(m.id)) { seen.add(m.id); polyRaw.push(m) }
        }
      }

      // Fetch from Kalshi if key present
      const kalshiRaw: KalshiMarket[] = kalshiKey
        ? (await Promise.all(keywords.slice(0, 2).map(kw => fetchKalshi(kw, kalshiKey)))).flat()
        : []

      // Get recent incident titles for semantic scoring
      const recentTitles = getRecentIncidents(conflict.slug, 48, 20).map(i => i.title)

      // Build scored market list
      const markets: PredictionMarket[] = []

      for (const m of polyRaw) {
        if (m.closed || !m.active) continue
        const { score: kwScore, matched } = keywordScore(m.question, keywords)
        if (kwScore === 0) continue

        // Groq semantic scoring for top keyword matches
        let finalScore = kwScore
        if (kwScore >= 0.7) {
          const groqScore = await groqRelevanceScore(m.question, conflict.slug, keywords, recentTitles)
          finalScore = groqScore > 0 ? kwScore * 0.4 + groqScore * 0.6 : kwScore
        }

        markets.push({
          id:               `poly:${m.id}`,
          source:           'polymarket',
          question:         m.question,
          probability:      parsePolyProb(m.outcomePrices),
          volume_24h:       m.volume24hr ?? 0,
          volume_total:     m.volume     ?? 0,
          close_time:       m.endDate    ?? null,
          active:           true,
          url:              `https://polymarket.com/event/${m.slug}`,
          relevance_score:  Math.round(finalScore * 1000) / 1000,
          matched_keywords: matched,
        })
      }

      for (const m of kalshiRaw) {
        if (m.status !== 'open') continue
        const { score: kwScore, matched } = keywordScore(m.title, keywords)
        if (kwScore === 0) continue

        const prob = ((m.yes_bid + m.yes_ask) / 2) / 100

        markets.push({
          id:               `kalshi:${m.ticker}`,
          source:           'kalshi',
          question:         m.title,
          probability:      Math.min(1, Math.max(0, prob)),
          volume_24h:       m.volume_24h   ?? 0,
          volume_total:     m.volume       ?? 0,
          close_time:       m.close_time   ?? null,
          active:           true,
          url:              `https://kalshi.com/markets/${m.ticker}`,
          relevance_score:  kwScore,
          matched_keywords: matched,
        })
      }

      // Sort by relevance desc, then volume desc
      markets.sort((a, b) =>
        b.relevance_score !== a.relevance_score
          ? b.relevance_score - a.relevance_score
          : b.volume_24h - a.volume_24h
      )

      const payload = { markets: markets.slice(0, 20), updated_at: Date.now() }
      await cacheSet(`markets:${conflict.slug}`,       payload, 1_800)
      await cacheSet(`markets:${conflict.slug}:stale`, payload, 86_400)

      if (markets.length > 0) {
        console.log(`[markets] ${conflict.slug}: ${markets.length} markets (top: "${markets[0]?.question?.slice(0, 60)}…")`)
      } else {
        console.log(`[markets] ${conflict.slug}: 0 relevant markets found`)
      }

      await writeFreshness('markets', 'ok')
    } catch (e) {
      console.warn(`[markets] ${conflict.slug} error:`, (e as Error).message)
      await writeFreshness('markets', 'error', (e as Error).message)
    }
  }
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export function startMarketsWorker(): void {
  console.log('[markets] worker started (Polymarket + Kalshi, 15min)')
  void pollMarkets()
  setInterval(() => void pollMarkets(), POLL_MS)
}
