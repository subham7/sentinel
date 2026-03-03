// Telegram public channel scraper
// Scrapes t.me/s/{channel} HTML — no API key required
// Tracks highest seen post ID per channel to avoid re-processing

import { createHash } from 'node:crypto'
import { ALL_CONFLICTS }       from '@sentinel/shared'
import type { Incident }       from '@sentinel/shared'
import { classifyText }        from '../services/classification.js'
import { isDuplicateIncident } from '../services/deduplication.js'
import { incidentExists, insertIncident, telegramMediaExists, insertTelegramMedia, pruneOldMedia } from '../db/queries.js'
import { emitIncident }        from '../services/incident-bus.js'
import { getDb }               from '../db/index.js'
import { writeFreshness }      from '../services/cache.js'

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

// ── Media extraction from t.me/s/ HTML ───────────────────────────────────────

interface MediaPost {
  id:         number
  url:        string
  mediaType:  'photo' | 'video'
  caption:    string | null
  postedAt:   string
  viewCount:  number
}

function parseMediaFromHtml(html: string): MediaPost[] {
  const media: MediaPost[] = []

  // Split on message boundaries — each block starts with data-post=
  const blocks = html.split(/(?=data-post=)/)

  for (const block of blocks) {
    const idMatch = block.match(/data-post="[^/"]*\/(\d+)"/)
    if (!idMatch) continue
    const id = parseInt(idMatch[1] ?? '0', 10)
    if (!id) continue

    // Photo: background-image:url('CDN_URL') in photo_wrap
    const photoMatch = block.match(/background-image:url\('([^']+)'\)/)

    // Video: <video src="..." or poster="..."
    const videoSrcMatch   = block.match(/<video[^>]+src="([^"]+\.mp4[^"]*)"/)
    const videoPosterMatch = block.match(/<video[^>]+poster="([^"]+)"/)

    if (!photoMatch && !videoSrcMatch && !videoPosterMatch) continue

    const mediaType: 'photo' | 'video' = videoSrcMatch ? 'video' : 'photo'
    const url = photoMatch?.[1] ?? videoPosterMatch?.[1] ?? videoSrcMatch?.[1] ?? ''
    if (!url || !url.startsWith('http')) continue

    // Caption — strip tags
    const captionMatch = block.match(/class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    const rawCaption = captionMatch?.[1] ?? ''
    const caption = rawCaption
      ? rawCaption
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .trim().slice(0, 500) || null
      : null

    // Datetime
    const dtMatch = block.match(/datetime="([^"]+)"/)
    const postedAt = dtMatch?.[1] ? new Date(dtMatch[1]).toISOString() : new Date().toISOString()

    // View count
    const viewMatch = block.match(/class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([^<]+)/)
    const viewStr = viewMatch?.[1]?.trim() ?? '0'
    const viewCount = viewStr.includes('K')
      ? Math.round(parseFloat(viewStr) * 1000)
      : viewStr.includes('M')
        ? Math.round(parseFloat(viewStr) * 1_000_000)
        : parseInt(viewStr, 10) || 0

    media.push({ id, url, mediaType, caption, postedAt, viewCount })
  }

  return media
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

  // Extract and store media items — check ALL parsed posts (dedup via INSERT OR IGNORE)
  // Do NOT filter by minId: photos may exist in already-seen text posts
  const mediaPosts = parseMediaFromHtml(html)
  for (const m of mediaPosts) {
    const mediaId = `${channel}:${m.id}`
    if (telegramMediaExists(mediaId)) continue
    try {
      insertTelegramMedia({
        id:            mediaId,
        conflict_slug: conflictSlug,
        channel,
        message_id:    m.id,
        media_type:    m.mediaType,
        url:           m.url,
        thumbnail_url: null,
        posted_at:     m.postedAt,
        caption:       m.caption,
        view_count:    m.viewCount,
      })
    } catch { /* non-fatal */ }
  }

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

function getChannelsForConflict(conflict: (typeof ALL_CONFLICTS)[0]): string[] {
  // Merge config channels with env var overrides (e.g. TELEGRAM_CHANNELS_US_IRAN)
  const envKey = `TELEGRAM_CHANNELS_${conflict.slug.toUpperCase().replace(/-/g, '_')}`
  const envVal = process.env[envKey] ?? ''
  const envChannels = envVal.split(',').map(s => s.trim()).filter(Boolean)
  const configChannels = conflict.dataSources.telegram.channels
  // Union — env channels take precedence, no duplicates
  return [...new Set([...configChannels, ...envChannels])]
}

let _pollCount = 0

async function poll(): Promise<void> {
  for (const conflict of ALL_CONFLICTS) {
    const channels = getChannelsForConflict(conflict)
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
  // Prune old media every ~24h (360 polls × 4 min = 24h)
  _pollCount++
  if (_pollCount % 360 === 0) {
    try { pruneOldMedia(30) } catch { /* non-fatal */ }
  }
  await writeFreshness('telegram', 'ok')
}

export function startTelegramWorker(): void {
  const allChannels = ALL_CONFLICTS.flatMap(c => getChannelsForConflict(c))
  if (!allChannels.length) {
    console.log('[telegram] no channels configured — worker idle')
    return
  }
  console.log(`[telegram] worker started — channels: ${allChannels.join(', ')} (4-min poll)`)
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
