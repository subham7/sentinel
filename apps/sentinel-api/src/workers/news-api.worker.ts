// Free news API ingestion: GNews (100 req/day) + NewsData.io (200 req/day)
// Both supplement RSS by catching breaking events not yet in feeds.
//
// Budget discipline (enforced in-process per calendar day UTC):
//   GNews:    1 req/hour/theater  → max 72/day  (limit 100)
//   NewsData: 2 req/day/theater   → max 6/day   (limit 200)
//
// New env vars (optional — workers skip gracefully if absent):
//   GNEWS_API_KEY
//   NEWSDATA_API_KEY

import { createHash }           from 'node:crypto'
import { ALL_CONFLICTS }        from '@sentinel/shared'
import type { Incident }        from '@sentinel/shared'
import { classifyText }         from '../services/classification.js'
import { isDuplicateIncident }  from '../services/deduplication.js'
import { incidentExists, insertIncident } from '../db/queries.js'
import { emitIncident }         from '../services/incident-bus.js'
import { writeFreshness }       from '../services/cache.js'

// ── Per-day request counters ───────────────────────────────────────────────────

function todayUTC(): string { return new Date().toISOString().slice(0, 10) }

const gnewsCounts    = new Map<string, number>()   // key: `${slug}:${date}`
const newsdataCounts = new Map<string, number>()

function gnewsAllowed(slug: string): boolean {
  const key   = `${slug}:${todayUTC()}`
  const count = gnewsCounts.get(key) ?? 0
  return count < 24   // 1/hour × 24 theaters safety margin
}

function newsdataAllowed(slug: string): boolean {
  const key   = `${slug}:${todayUTC()}`
  const count = newsdataCounts.get(key) ?? 0
  return count < 2
}

function incGnews(slug: string): void {
  const key = `${slug}:${todayUTC()}`
  gnewsCounts.set(key, (gnewsCounts.get(key) ?? 0) + 1)
}

function incNewsdata(slug: string): void {
  const key = `${slug}:${todayUTC()}`
  newsdataCounts.set(key, (newsdataCounts.get(key) ?? 0) + 1)
}

// ── Country code mapping per theater ─────────────────────────────────────────

const NEWSDATA_COUNTRIES: Record<string, string> = {
  'us-iran':        'ir,iq,sa,ae,ye',
  'israel-gaza':    'il,ps,lb,sy',
  'russia-ukraine': 'ru,ua',
}

// ── Shared incident pipeline ──────────────────────────────────────────────────

interface NewsArticle {
  title:       string
  description: string | null
  url:         string
  publishedAt: string   // ISO or RFC 2822
}

async function processArticles(
  articles:  NewsArticle[],
  slug:      string,
  sourceKey: 'gnews' | 'newsdata',
): Promise<number> {
  let inserted = 0

  for (const art of articles) {
    if (!art.title || !art.url) continue

    const hash = createHash('sha256').update(art.url).digest('hex').slice(0, 16)
    const id   = `${sourceKey}-${slug}-${hash}`
    if (incidentExists(id)) continue

    const text = [art.title, art.description].filter(Boolean).join(' ').slice(0, 800)
    const cls  = await classifyText(text)
    if (!cls || !cls.is_conflict_related) continue

    const timestamp = (() => {
      try { return new Date(art.publishedAt).toISOString() }
      catch { return new Date().toISOString() }
    })()

    const lat = cls.location.lat ?? undefined
    const lon = cls.location.lon ?? undefined

    if (lat !== undefined && lon !== undefined) {
      if (isDuplicateIncident(lat, lon, timestamp, cls.event_type)) continue
    }

    const incident: Incident = {
      id,
      conflict_slugs: [slug],
      source:         sourceKey,
      source_id:      `${sourceKey}:${slug}:${hash}`,
      source_url:     art.url,
      timestamp,
      lat:            lat ?? 0,
      lon:            lon ?? 0,
      location_name:  cls.location.place ?? '',
      category:       cls.event_type,
      severity:       cls.severity,
      title:          art.title.slice(0, 200),
      summary:        cls.summary,
      actors:         cls.actors,
      confidence:     cls.confidence,
    }

    insertIncident(incident)
    emitIncident(incident)
    inserted++
  }

  return inserted
}

// ── GNews ─────────────────────────────────────────────────────────────────────

async function pollGNews(slug: string): Promise<void> {
  const key = process.env.GNEWS_API_KEY
  if (!key || !gnewsAllowed(slug)) return

  const conflict = ALL_CONFLICTS.find(c => c.slug === slug)
  if (!conflict) return

  const q = conflict.dataSources.gdelt.keywords.slice(0, 3).join(' OR ')
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&token=${key}`

  incGnews(slug)

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      console.warn(`[gnews] ${slug} HTTP ${res.status}`)
      return
    }

    const data = await res.json() as {
      articles?: { title: string; description: string | null; url: string; publishedAt: string }[]
    }

    const n = await processArticles(data.articles ?? [], slug, 'gnews')
    if (n > 0) console.log(`[gnews] ${slug}: +${n} incidents`)
    await writeFreshness(`gnews:${slug}`, 'ok')
  } catch (e) {
    console.warn(`[gnews] ${slug} error:`, (e as Error).message)
    await writeFreshness(`gnews:${slug}`, 'error', (e as Error).message)
  }
}

// ── NewsData.io ───────────────────────────────────────────────────────────────

async function pollNewsData(slug: string): Promise<void> {
  const key = process.env.NEWSDATA_API_KEY
  if (!key || !newsdataAllowed(slug)) return

  const conflict = ALL_CONFLICTS.find(c => c.slug === slug)
  if (!conflict) return

  const countries = NEWSDATA_COUNTRIES[slug]
  if (!countries) return

  const q = conflict.dataSources.gdelt.keywords.slice(0, 3).join(' OR ')
  const url = `https://newsdata.io/api/1/news?apikey=${key}&q=${encodeURIComponent(q)}&country=${countries}&language=en`

  incNewsdata(slug)

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) {
      console.warn(`[newsdata] ${slug} HTTP ${res.status}`)
      return
    }

    const data = await res.json() as {
      results?: { title: string; description: string | null; link: string; pubDate: string }[]
    }

    const articles: NewsArticle[] = (data.results ?? []).map(r => ({
      title:       r.title,
      description: r.description,
      url:         r.link,
      publishedAt: r.pubDate,
    }))

    const n = await processArticles(articles, slug, 'newsdata')
    if (n > 0) console.log(`[newsdata] ${slug}: +${n} incidents`)
    await writeFreshness(`newsdata:${slug}`, 'ok')
  } catch (e) {
    console.warn(`[newsdata] ${slug} error:`, (e as Error).message)
    await writeFreshness(`newsdata:${slug}`, 'error', (e as Error).message)
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

async function gnewsPoll(): Promise<void> {
  for (const c of ALL_CONFLICTS) {
    await pollGNews(c.slug)
    await new Promise(r => setTimeout(r, 2000))
  }
}

async function newsdataPoll(): Promise<void> {
  for (const c of ALL_CONFLICTS) {
    await pollNewsData(c.slug)
    await new Promise(r => setTimeout(r, 3000))
  }
}

export function startNewsAPIWorker(): void {
  const hasGnews    = !!process.env.GNEWS_API_KEY
  const hasNewsdata = !!process.env.NEWSDATA_API_KEY

  if (!hasGnews && !hasNewsdata) {
    console.log('[news-api] worker started — no keys, skipping GNews + NewsData')
    return
  }

  if (hasGnews) {
    console.log('[news-api] GNews enabled — 1 req/hour/theater')
    void gnewsPoll()
    setInterval(() => void gnewsPoll(), 65 * 60_000)   // every 65min
  }

  if (hasNewsdata) {
    console.log('[news-api] NewsData.io enabled — 2 req/day/theater')
    // First run at startup, then every 12h
    setTimeout(() => {
      void newsdataPoll()
      setInterval(() => void newsdataPoll(), 12 * 60 * 60_000)
    }, 5 * 60_000)   // delay 5min so RSS worker runs first
  }
}
