// RSS/Atom feed ingestion worker
// Polls ALL_RSS_FEEDS on per-feed intervals, classifies items, deduplicates,
// and inserts into the shared incidents pipeline (source: 'rss').
// No API key required — all feeds are public.

import { createHash }        from 'node:crypto'
import RSSParser             from 'rss-parser'
import { ALL_CONFLICTS }     from '@sentinel/shared'
import type { Incident }     from '@sentinel/shared'
import { ALL_RSS_FEEDS }     from '@sentinel/shared'
import type { RssFeed }      from '@sentinel/shared'
import { classifyText }      from '../services/classification.js'
import { isDuplicateIncident } from '../services/deduplication.js'
import { incidentExists, insertIncident } from '../db/queries.js'
import { emitIncident }      from '../services/incident-bus.js'
import { writeFreshness }    from '../services/cache.js'

type CustomItem = {
  title?:          string
  link?:           string
  guid?:           string
  isoDate?:        string
  pubDate?:        string
  contentSnippet?: string
  content?:        string
  summary?:        string
  'geo:lat'?:      string
  'geo:long'?:     string
  'geo:lon'?:      string
}

const parser = new RSSParser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ['geo:lat',  'geo:lat'],
      ['geo:long', 'geo:long'],
      ['geo:lon',  'geo:lon'],
    ],
  },
  timeout: 20_000,
  headers: {
    // Some servers (406 Not Acceptable) reject requests without a browser UA
    'User-Agent': 'Mozilla/5.0 (compatible; SentinelBot/1.0; +https://sentinelnetwork.info)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
})

// Resolve feed theaters → actual conflict slugs
function resolveTheaters(feed: RssFeed): string[] {
  if (feed.theaters.includes('all')) return ALL_CONFLICTS.map(c => c.slug)
  return feed.theaters.filter(t => ALL_CONFLICTS.some(c => c.slug === t))
}

// For multi-theater feeds, filter slugs to those whose keywords match the item text
function filterByKeywords(text: string, slugs: string[]): string[] {
  const lower = text.toLowerCase()
  return slugs.filter(slug => {
    const conflict = ALL_CONFLICTS.find(c => c.slug === slug)
    if (!conflict) return false
    return conflict.dataSources.gdelt.keywords.some(kw => lower.includes(kw.toLowerCase()))
  })
}

async function processFeed(feed: RssFeed): Promise<void> {
  let feedObj: Awaited<ReturnType<typeof parser.parseURL>>
  try {
    feedObj = await parser.parseURL(feed.url)
  } catch (e) {
    console.warn(`[rss] ${feed.id} fetch error: ${(e as Error).message}`)
    await writeFreshness(`rss:${feed.id}`, 'error', (e as Error).message)
    return
  }

  const allTheaterSlugs = resolveTheaters(feed)
  const isAllTheater    = feed.theaters.includes('all')
  let inserted          = 0

  for (const item of feedObj.items ?? []) {
    const url = item.link ?? item.guid
    if (!url) continue

    const urlHash = createHash('sha256').update(url).digest('hex').slice(0, 16)
    const id      = `rss-${feed.id}-${urlHash}`
    if (incidentExists(id)) continue

    // Build text for classifier
    const text = [item.title, item.contentSnippet ?? item.summary ?? item.content]
      .filter(Boolean).join(' ').slice(0, 800)
    if (!text) continue

    const cls = await classifyText(text)
    if (!cls || !cls.is_conflict_related) continue

    // Determine conflict slugs
    const conflictSlugs = isAllTheater
      ? filterByKeywords(text, allTheaterSlugs)
      : allTheaterSlugs
    if (conflictSlugs.length === 0) continue

    // Parse timestamp (fallback to now)
    const timestamp = item.isoDate ?? (item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString())

    // Parse geo coords (geo namespace or classifier)
    const geoLat  = item['geo:lat']  ?? item['geo:lon']  // geo:lat
    const geoLon  = item['geo:long'] ?? item['geo:lon']  // geo:long
    const lat = geoLat  ? parseFloat(geoLat)  : (cls.location.lat  ?? undefined)
    const lon = geoLon  ? parseFloat(geoLon)  : (cls.location.lon  ?? undefined)

    // Haversine dedup only when we have coordinates
    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      if (isDuplicateIncident(lat, lon, timestamp, cls.event_type)) continue
    }

    const incident: Incident = {
      id,
      conflict_slugs: conflictSlugs,
      source:         'rss',
      source_id:      `rss:${feed.id}:${urlHash}`,
      source_url:     url,
      timestamp,
      lat:            lat ?? 0,
      lon:            lon ?? 0,
      location_name:  cls.location.place ?? '',
      category:       cls.event_type,
      severity:       cls.severity,
      title:          (item.title ?? '').slice(0, 200),
      summary:        cls.summary,
      actors:         cls.actors,
      confidence:     cls.confidence,
    }

    insertIncident(incident)
    emitIncident(incident)
    inserted++
  }

  await writeFreshness(`rss:${feed.id}`, 'ok')
  if (inserted > 0) console.log(`[rss] ${feed.id}: +${inserted} incidents`)
}

function scheduleFeed(feed: RssFeed, initialDelayMs: number): void {
  const pollMs = feed.pollIntervalMinutes * 60_000

  async function poll(): Promise<void> {
    try {
      await processFeed(feed)
    } catch (e) {
      console.warn(`[rss] ${feed.id} unhandled:`, (e as Error).message)
    }
    setTimeout(() => void poll(), pollMs)
  }

  // Stagger startup across feeds to avoid thundering herd
  setTimeout(() => void poll(), initialDelayMs)
}

export function startRSSWorker(): void {
  console.log(`[rss] worker started — ${ALL_RSS_FEEDS.length} feeds`)
  // Space initial polls ~3s apart so we don't hammer everything at once
  ALL_RSS_FEEDS.forEach((feed, i) => scheduleFeed(feed, i * 3_000))
}
