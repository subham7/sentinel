// Telegram public channel scraper
// Scrapes t.me/s/{channel} HTML — no API key required
// Tracks highest seen post ID per channel to avoid re-processing

import { createHash } from 'node:crypto'
import { ALL_CONFLICTS }       from '@sentinel/shared'
import type { Incident }       from '@sentinel/shared'
import { classifyText }        from '../services/classification.js'
import { isDuplicateIncident } from '../services/deduplication.js'
import { incidentExists, insertIncident } from '../db/queries.js'
import { emitIncident }        from '../services/incident-bus.js'
import { getDb }               from '../db/index.js'

const POLL_MS   = 4 * 60 * 1000   // 4 minutes
const DELAY_MS  = 2500             // 2.5s between channel fetches (respect rate limit)

// Track last-seen post ID per channel to avoid reprocessing
const lastPostId = new Map<string, number>()

function getLastPostId(channel: string): number {
  if (lastPostId.has(channel)) return lastPostId.get(channel)!
  try {
    const row = getDb().prepare(
      'SELECT id FROM telegram_posts WHERE channel = ? ORDER BY rowid DESC LIMIT 1',
    ).get(channel) as { id: string } | undefined
    if (row) {
      const parts = row.id.split('/')
      const n = parseInt(parts[1] ?? '0', 10)
      lastPostId.set(channel, n)
      return n
    }
  } catch { /* db not ready */ }
  return 0
}

function parseChannelPage(html: string, channel: string): { id: number; text: string; postedAt: string }[] {
  const posts: { id: number; text: string; postedAt: string }[] = []

  // Match each message block
  const msgRegex = /data-post="[^/]+\/(\d+)"[\s\S]*?class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?datetime="([^"]+)"/gm
  let m: RegExpExecArray | null

  while ((m = msgRegex.exec(html)) !== null) {
    const id       = parseInt(m[1] ?? '0', 10)
    const rawHtml  = m[2] ?? ''
    const postedAt = m[3] ?? new Date().toISOString()

    // Strip HTML tags and decode basic entities
    const text = rawHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()

    if (id > 0 && text.length > 20) posts.push({ id, text, postedAt })
  }

  return posts
}

async function scrapeChannel(channel: string, conflictSlug: string): Promise<number> {
  const url = `https://t.me/s/${channel}`
  let html: string
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelBot/1.0)' },
      signal:  AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return 0
    html = await resp.text()
  } catch {
    return 0
  }

  const minId  = getLastPostId(channel)
  const posts  = parseChannelPage(html, channel).filter(p => p.id > minId)
  if (!posts.length) return 0

  const maxId  = Math.max(...posts.map(p => p.id))
  let inserted = 0

  for (const post of posts) {
    const dbId = `${channel}/${post.id}`
    if (incidentExists(`tg-${dbId}`)) continue

    const cls = await classifyText(post.text)

    // Store in telegram_posts table regardless of classification
    try {
      getDb().prepare(`
        INSERT OR IGNORE INTO telegram_posts
          (id, conflict_slug, channel, text, post_url, posted_at, classified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(dbId, conflictSlug, channel, post.text,
        `https://t.me/${dbId}`, post.postedAt, cls ? 1 : 0)
    } catch { /* non-fatal */ }

    if (!cls || !cls.is_conflict_related) continue

    // We need coordinates — try location from classifier, else skip
    const lat = cls.location.lat
    const lon = cls.location.lon
    if (lat === null || lon === null) continue

    const timestamp = new Date(post.postedAt).toISOString()
    if (isDuplicateIncident(lat, lon, timestamp, cls.event_type, 20, 1)) continue

    const textHash = createHash('sha256').update(post.text.slice(0, 500)).digest('hex').slice(0, 16)
    const id       = `tg-${channel}-${textHash}`

    const incident: Incident = {
      id,
      conflict_slugs: [conflictSlug],
      source:         'telegram',
      timestamp,
      lat, lon,
      location_name:  cls.location.place,
      category:       cls.event_type,
      severity:       cls.severity,
      title:          post.text.slice(0, 120).replace(/\n/g, ' '),
      summary:        cls.summary,
      actors:         cls.actors,
      source_url:     `https://t.me/${dbId}`,
      confidence:     cls.confidence,
    }

    insertIncident(incident)
    emitIncident(incident)
    inserted++
  }

  lastPostId.set(channel, maxId)
  return inserted
}

async function poll(): Promise<void> {
  for (const conflict of ALL_CONFLICTS) {
    const channels = conflict.dataSources.telegram.channels
    for (const channel of channels) {
      try {
        const n = await scrapeChannel(channel, conflict.slug)
        if (n > 0) console.log(`[telegram] @${channel}: +${n} incidents`)
      } catch (e) {
        console.warn(`[telegram] @${channel} error:`, (e as Error).message)
      }
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }
}

export function startTelegramWorker(): void {
  const allChannels = ALL_CONFLICTS.flatMap(c => c.dataSources.telegram.channels)
  if (!allChannels.length) {
    console.log('[telegram] no channels configured — worker idle')
    return
  }
  console.log(`[telegram] worker started — ${allChannels.length} channels (4-min poll)`)
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
