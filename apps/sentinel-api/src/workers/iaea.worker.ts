// IAEA RSS worker — polls weekly for Iran nuclear programme updates
// Feed: https://www.iaea.org/rss/iran  (IAEA press releases on Iran)
// Keyword-matches headlines to update nuclear site status overrides in SQLite.
// Falls back gracefully — static config data is always the ground truth.

import { ALL_CONFLICTS } from '@sentinel/shared'
import { upsertNuclearSiteStatus } from '../db/queries.js'

const FEED_URL = 'https://www.iaea.org/rss/iran'
const POLL_MS  = 7 * 24 * 60 * 60 * 1000   // weekly

// Site-specific keyword rules for status inference
interface SiteRule {
  siteId:   string
  name:     string
  keywords: string[]  // any match → check status keywords below
}

const SITE_RULES: SiteRule[] = [
  { siteId: 'natanz',  name: 'Natanz FEP',  keywords: ['natanz', 'fep', 'fuel enrichment'] },
  { siteId: 'fordow',  name: 'Fordow FFEP', keywords: ['fordow', 'ffep'] },
  { siteId: 'isfahan', name: 'Isfahan UCF', keywords: ['isfahan', 'ucf', 'uranium conversion'] },
  { siteId: 'arak',    name: 'Arak IR-40',  keywords: ['arak', 'ir-40', 'heavy water'] },
  { siteId: 'parchin', name: 'Parchin',     keywords: ['parchin', 'high explosive', 'weapons'] },
]

function inferStatus(text: string): string | null {
  const t = text.toLowerCase()
  if (t.includes('suspend') || t.includes('halt') || t.includes('stopped') || t.includes('freeze')) return 'shutdown'
  if (t.includes('reduce') || t.includes('modified') || t.includes('limited'))                       return 'modified'
  if (t.includes('enrich') || t.includes('centrifuge') || t.includes('install') || t.includes('expand')) return 'active'
  if (t.includes('inspectors') || t.includes('iaea access') || t.includes('monitoring'))             return 'active'
  return null
}

function parseRssItems(xml: string): { title: string; pubDate: string; description: string }[] {
  const items: { title: string; pubDate: string; description: string }[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1] ?? ''
    const title       = (/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(block) ?? /<title[^>]*>(.*?)<\/title>/i.exec(block))?.[1]?.trim() ?? ''
    const pubDate     = (/<pubDate[^>]*>(.*?)<\/pubDate>/i.exec(block))?.[1]?.trim() ?? ''
    const description = (/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/i.exec(block) ?? /<description[^>]*>(.*?)<\/description>/i.exec(block))?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
    if (title) items.push({ title, pubDate, description })
  }
  return items
}

async function poll(): Promise<void> {
  let xml: string
  try {
    const resp = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'SENTINEL/1.0' },
      signal:  AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return
    xml = await resp.text()
  } catch (e) {
    console.warn('[iaea] fetch failed:', (e as Error).message)
    return
  }

  const items = parseRssItems(xml)
  if (!items.length) return

  // Find the conflict slug that has nuclear sites
  const nuclearConflict = ALL_CONFLICTS.find(c => (c.overlays.nuclearSites?.length ?? 0) > 0)
  if (!nuclearConflict) return

  let updated = 0
  for (const item of items.slice(0, 20)) {
    const combined = `${item.title} ${item.description}`.toLowerCase()

    for (const rule of SITE_RULES) {
      if (!rule.keywords.some(kw => combined.includes(kw))) continue

      const status = inferStatus(combined)
      if (!status) continue

      const note = item.title.slice(0, 200)
      upsertNuclearSiteStatus(rule.siteId, nuclearConflict.slug, rule.name, status, note)
      updated++
    }
  }

  if (updated > 0) console.log(`[iaea] ${updated} site status(es) updated from RSS`)
  else             console.log('[iaea] RSS polled — no status changes inferred')
}

export function startIAEAWorker(): void {
  const hasNuclear = ALL_CONFLICTS.some(c => (c.overlays.nuclearSites?.length ?? 0) > 0)
  if (!hasNuclear) {
    console.log('[iaea] no conflicts with nuclear sites — worker idle')
    return
  }
  console.log('[iaea] worker started (7-day poll)')
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
