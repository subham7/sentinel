// Prediction markets worker
// Polls Polymarket (public API, no auth) every 15 minutes.
// Optionally polls Kalshi if KALSHI_API_KEY is set.
//
// Polymarket strategy: fetch top active markets by volume (no search param —
// it is not reliably supported by the Gamma API), then filter locally by
// conflict keywords.  Two passes:
//   1. Fetch broader set (limit=200) sorted by volume24hr
//   2. Score each market by keyword overlap
//   3. Optional Groq semantic re-scoring for top candidates

import { ALL_CONFLICTS } from '@sentinel/shared'
import type { PredictionMarket } from '@sentinel/shared'
import { cacheGet, cacheSet, writeFreshness } from '../services/cache.js'
import { getRecentIncidents } from '../db/queries.js'

const POLL_MS        = 15 * 60 * 1000
const POLYMARKET_API = 'https://gamma-api.polymarket.com/markets'
const KALSHI_API     = 'https://api.kalshi.com/trade-api/v2/markets'

// ── Polymarket ────────────────────────────────────────────────────────────────

interface PolyMarket {
  id:            string
  question:      string
  outcomePrices: string | number[]   // JSON array string OR actual array
  volume:        number
  volume24hr:    number
  active:        boolean
  closed?:       boolean
  endDate?:      string | null
  slug?:         string
  conditionId?:  string
}

function normalisePolyResponse(raw: unknown): PolyMarket[] {
  if (Array.isArray(raw)) return raw as PolyMarket[]
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    for (const key of ['results', 'data', 'markets']) {
      if (Array.isArray(r[key])) return r[key] as PolyMarket[]
    }
  }
  return []
}

function parsePolyProb(outcomePrices: string | number[]): number {
  try {
    const arr: number[] = typeof outcomePrices === 'string'
      ? JSON.parse(outcomePrices) as number[]
      : outcomePrices
    return Array.isArray(arr) ? Math.min(1, Math.max(0, arr[0] ?? 0.5)) : 0.5
  } catch { return 0.5 }
}

async function fetchPolymarketBulk(limit: number): Promise<PolyMarket[]> {
  // Fetch active markets sorted by volume — no keyword search (unreliable)
  const params = new URLSearchParams({
    active:       'true',
    closed:       'false',
    limit:        String(limit),
    order:        'volume24hr',
    ascending:    'false',
  })
  try {
    const resp = await fetch(`${POLYMARKET_API}?${params}`, {
      signal:  AbortSignal.timeout(20_000),
      headers: { 'Accept': 'application/json' },
    })
    if (!resp.ok) {
      console.warn(`[markets] Polymarket bulk fetch failed: ${resp.status}`)
      return []
    }
    const raw = await resp.json()
    const markets = normalisePolyResponse(raw)
    console.log(`[markets] Polymarket returned ${markets.length} markets (limit=${limit})`)
    return markets
  } catch (e) {
    console.warn('[markets] Polymarket fetch error:', (e as Error).message)
    return []
  }
}

// ── Kalshi ───────────────────────────────────────────────────────────────────

interface KalshiMarket {
  ticker:     string
  title:      string
  yes_bid:    number
  yes_ask:    number
  volume:     number
  volume_24h: number
  close_time: string | null
  status:     string
}

async function fetchKalshi(keyword: string, apiKey: string): Promise<KalshiMarket[]> {
  try {
    const params = new URLSearchParams({ limit: '20', status: 'open', search: keyword })
    const resp = await fetch(`${KALSHI_API}?${params}`, {
      signal:  AbortSignal.timeout(15_000),
      headers: { 'Accept': 'application/json', 'Authorization': `Token ${apiKey}` },
    })
    if (!resp.ok) return []
    const data = await resp.json() as { markets?: KalshiMarket[] }
    return data.markets ?? []
  } catch { return [] }
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

function keywordScore(question: string, keywords: string[]): { score: number; matched: string[] } {
  const q       = question.toLowerCase()
  const matched = keywords.filter(kw => q.includes(kw.toLowerCase()))
  const score   = matched.length === 0 ? 0
                : matched.length === 1 ? 0.4
                : matched.length === 2 ? 0.7
                : 1.0
  return { score, matched }
}

async function groqRelevanceScore(
  question:     string,
  slug:         string,
  keywords:     string[],
  recentTitles: string[],
): Promise<number> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey || !recentTitles.length) return 0
  try {
    const body = {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'Respond with ONLY valid JSON: {"score": <0.0-1.0>}' },
        { role: 'user',   content: `Market: "${question}"\nConflict: ${slug}\nKeywords: ${keywords.join(', ')}\nRecent incidents: ${recentTitles.slice(0, 5).join(' | ')}\n\nHow relevant is this market to monitoring this conflict? 0.0=irrelevant, 1.0=directly relevant.` },
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

// Shared bulk fetch cache — all conflicts share one Polymarket API call per cycle
let polyCache: { markets: PolyMarket[]; fetchedAt: number } | null = null

async function getPolymarkets(): Promise<PolyMarket[]> {
  const now = Date.now()
  if (polyCache && now - polyCache.fetchedAt < POLL_MS - 60_000) {
    return polyCache.markets
  }
  const markets = await fetchPolymarketBulk(500)
  polyCache = { markets, fetchedAt: now }
  return markets
}

async function pollMarkets(): Promise<void> {
  const kalshiKey = process.env.KALSHI_API_KEY

  // One shared bulk fetch for all conflicts
  const polyAll = await getPolymarkets()

  for (const conflict of ALL_CONFLICTS) {
    const keywords = conflict.dataSources.gdelt.keywords

    try {
      // Filter Polymarket bulk results by keyword
      const polyFiltered: PolyMarket[] = polyAll.filter(
        m => !m.closed && m.active !== false &&
             keywords.some(kw => m.question.toLowerCase().includes(kw.toLowerCase()))
      )

      // Kalshi: keyword search (optional)
      const kalshiRaw: KalshiMarket[] = kalshiKey
        ? (await Promise.all(keywords.slice(0, 2).map(kw => fetchKalshi(kw, kalshiKey)))).flat()
        : []

      // Recent incident titles for semantic scoring
      const recentTitles = getRecentIncidents(conflict.slug, 48, 20).map(i => i.title)

      const markets: PredictionMarket[] = []

      for (const m of polyFiltered) {
        const { score: kwScore, matched } = keywordScore(m.question, keywords)
        if (kwScore === 0) continue

        let finalScore = kwScore
        if (kwScore >= 0.7) {
          const groqScore = await groqRelevanceScore(m.question, conflict.slug, keywords, recentTitles)
          if (groqScore > 0) finalScore = kwScore * 0.4 + groqScore * 0.6
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
          url:              `https://polymarket.com/event/${m.slug ?? m.id}`,
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
          volume_24h:       m.volume_24h ?? 0,
          volume_total:     m.volume     ?? 0,
          close_time:       m.close_time ?? null,
          active:           true,
          url:              `https://kalshi.com/markets/${m.ticker}`,
          relevance_score:  kwScore,
          matched_keywords: matched,
        })
      }

      // Deduplicate by id, sort relevance → volume
      const seen = new Set<string>()
      const deduped = markets.filter(m => seen.has(m.id) ? false : (seen.add(m.id), true))
      deduped.sort((a, b) =>
        b.relevance_score !== a.relevance_score
          ? b.relevance_score - a.relevance_score
          : b.volume_24h - a.volume_24h
      )

      const payload = { markets: deduped.slice(0, 25), updated_at: Date.now() }
      await cacheSet(`markets:${conflict.slug}`,       payload, 1_800)
      await cacheSet(`markets:${conflict.slug}:stale`, payload, 86_400)

      console.log(`[markets] ${conflict.slug}: ${deduped.length} markets from ${polyAll.length} poly total`)
      await writeFreshness('markets', 'ok')
    } catch (e) {
      console.warn(`[markets] ${conflict.slug} error:`, (e as Error).message)
      await writeFreshness('markets', 'error', (e as Error).message)
    }
  }
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export function startMarketsWorker(): void {
  console.log('[markets] worker started (Polymarket bulk 500 + local filter, 15min)')
  void pollMarkets()
  setInterval(() => void pollMarkets(), POLL_MS)
}
