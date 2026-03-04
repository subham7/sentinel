// Curated RSS/Atom feed registry for the SENTINEL incident pipeline.
// Workers use this config — never hardcode feed URLs in worker files.

export interface RssFeed {
  id:                  string    // unique slug used in incident source_id
  url:                 string    // RSS/Atom feed URL
  label:               string    // short display name for the UI badge
  tier:                1 | 2 | 3 | 4
  propagandaRisk:      boolean   // true = T4 state-affiliated media
  theaters:            string[]  // conflict slugs this feed covers, or ['all']
  pollIntervalMinutes: number
  language:            string    // ISO 639-1
}

export const ALL_RSS_FEEDS: RssFeed[] = [

  // ── Tier 1 — Official / Government ─────────────────────────────────────────

  {
    id: 'iaea', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.iaea.org/rss/press-releases.rss',
    label: 'IAEA', theaters: ['us-iran'], pollIntervalMinutes: 15,
  },
  {
    id: 'un-mideast', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/rss.xml',
    label: 'UN', theaters: ['all'], pollIntervalMinutes: 15,
  },
  {
    id: 'state-dept', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.state.gov/rss-feeds/press-releases/',
    label: 'STATE', theaters: ['all'], pollIntervalMinutes: 30,
  },
  {
    id: 'dod', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=800&Site=945',
    label: 'PENTAGON', theaters: ['all'], pollIntervalMinutes: 30,
  },
  {
    id: 'centcom', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.centcom.mil/MEDIA/RSS/',
    label: 'CENTCOM', theaters: ['us-iran'], pollIntervalMinutes: 30,
  },
  {
    id: 'idf', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.idf.il/en/rss/',
    label: 'IDF', theaters: ['israel-gaza'], pollIntervalMinutes: 10,
  },
  {
    id: 'nato', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.nato.int/cps/en/natolive/news.rss',
    label: 'NATO', theaters: ['russia-ukraine'], pollIntervalMinutes: 30,
  },
  {
    id: 'icrc', tier: 1, propagandaRisk: false, language: 'en',
    url: 'https://www.icrc.org/en/rss.xml',
    label: 'ICRC', theaters: ['all'], pollIntervalMinutes: 60,
  },

  // ── Tier 2 — Credible Regional ──────────────────────────────────────────────

  {
    id: 'iran-intl', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.iranintl.com/en/rss',
    label: 'IRAN INTL', theaters: ['us-iran'], pollIntervalMinutes: 10,
  },
  {
    id: 'times-of-israel', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.timesofisrael.com/feed/',
    label: 'TOI', theaters: ['israel-gaza'], pollIntervalMinutes: 10,
  },
  {
    id: 'kyiv-independent', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://kyivindependent.com/feed/',
    label: 'KYIV IND', theaters: ['russia-ukraine'], pollIntervalMinutes: 10,
  },
  {
    id: 'meduza', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://meduza.io/rss/en/all',
    label: 'MEDUZA', theaters: ['russia-ukraine'], pollIntervalMinutes: 15,
  },
  {
    id: 'aljazeera', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    label: 'AJE', theaters: ['all'], pollIntervalMinutes: 10,
  },
  {
    id: 'mee', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.middleeasteye.net/rss',
    label: 'MEE', theaters: ['us-iran'], pollIntervalMinutes: 15,
  },
  {
    id: 'rudaw', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.rudaw.net/english/rss.xml',
    label: 'RUDAW', theaters: ['us-iran'], pollIntervalMinutes: 30,
  },
  {
    id: 'rferl', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.rferl.org/api/epiqqdiqei',
    label: 'RFE/RL', theaters: ['all'], pollIntervalMinutes: 15,
  },
  {
    id: 'bbc-mideast', tier: 1, propagandaRisk: false, language: 'en',
    url: 'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
    label: 'BBC', theaters: ['us-iran', 'israel-gaza'], pollIntervalMinutes: 10,
  },
  {
    id: 'france24', tier: 2, propagandaRisk: false, language: 'en',
    url: 'https://www.france24.com/en/rss',
    label: 'F24', theaters: ['all'], pollIntervalMinutes: 15,
  },

  // ── Tier 3 — OSINT / Monitoring ─────────────────────────────────────────────

  {
    id: 'isw', tier: 3, propagandaRisk: false, language: 'en',
    url: 'https://www.understandingwar.org/rss.xml',
    label: 'ISW', theaters: ['russia-ukraine'], pollIntervalMinutes: 60,
  },
  {
    id: 'bellingcat', tier: 3, propagandaRisk: false, language: 'en',
    url: 'https://www.bellingcat.com/feed/',
    label: 'BCAT', theaters: ['all'], pollIntervalMinutes: 60,
  },
  {
    id: 'crisis-group', tier: 3, propagandaRisk: false, language: 'en',
    url: 'https://www.crisisgroup.org/rss.xml',
    label: 'ICG', theaters: ['all'], pollIntervalMinutes: 60,
  },
  {
    id: 'reliefweb', tier: 3, propagandaRisk: false, language: 'en',
    url: 'https://reliefweb.int/updates/rss.xml',
    label: 'RLWEB', theaters: ['all'], pollIntervalMinutes: 60,
  },
  {
    id: 'un-sc', tier: 3, propagandaRisk: false, language: 'en',
    url: 'https://www.un.org/press/en/rss.xml',
    label: 'UN S/C', theaters: ['all'], pollIntervalMinutes: 30,
  },

  // ── Tier 4 — State-affiliated (ingest as signal, flag in UI) ────────────────

  {
    id: 'irna', tier: 4, propagandaRisk: true, language: 'en',
    url: 'https://en.irna.ir/rss',
    label: 'IRNA', theaters: ['us-iran'], pollIntervalMinutes: 30,
  },
  {
    id: 'mehr', tier: 4, propagandaRisk: true, language: 'en',
    url: 'https://en.mehrnews.com/rss',
    label: 'MEHR', theaters: ['us-iran'], pollIntervalMinutes: 30,
  },
  {
    id: 'tass', tier: 4, propagandaRisk: true, language: 'en',
    url: 'https://tass.com/rss/v2.xml',
    label: 'TASS', theaters: ['russia-ukraine'], pollIntervalMinutes: 30,
  },
]

export function getRssFeeds(conflictSlug?: string): RssFeed[] {
  if (!conflictSlug) return ALL_RSS_FEEDS
  return ALL_RSS_FEEDS.filter(f =>
    f.theaters.includes(conflictSlug) || f.theaters.includes('all'),
  )
}

/** Look up a feed label from an incident's source_id ('rss:{feedId}:{hash}') */
export function rssFeedLabel(sourceId: string | undefined): string {
  if (!sourceId?.startsWith('rss:')) return 'RSS'
  const feedId = sourceId.split(':')[1]
  return ALL_RSS_FEEDS.find(f => f.id === feedId)?.label ?? 'RSS'
}

/** Returns true if the feed for this source_id is propaganda-risk (T4) */
export function isRssPropagandaRisk(sourceId: string | undefined): boolean {
  if (!sourceId?.startsWith('rss:')) return false
  const feedId = sourceId.split(':')[1]
  return ALL_RSS_FEEDS.find(f => f.id === feedId)?.propagandaRisk ?? false
}
