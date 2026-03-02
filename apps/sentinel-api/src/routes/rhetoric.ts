import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { RhetoricScore } from '@sentinel/shared'
import { cacheGet, cacheSet } from '../services/cache.js'
import { getDb } from '../db/index.js'

const RHETORIC_SYSTEM = `You are an intelligence analyst evaluating escalatory language in conflict-related posts.
Score the provided text on a 0-100 escalation scale:
- 0-24: ROUTINE (normal military/diplomatic chatter)
- 25-49: ELEVATED (increased tension language)
- 50-74: THREATENING (explicit threats or aggressive posturing)
- 75-89: CRISIS (imminent action indicators, ultimatums)
- 90-100: IMMINENT (direct attack warnings, declared intentions)

Return ONLY valid JSON:
{
  "score": <integer 0-100>,
  "label": "ROUTINE" | "ELEVATED" | "THREATENING" | "CRISIS" | "IMMINENT",
  "key_phrases": ["phrase1", "phrase2", "phrase3"]
}`

const CONF_LABELS = ['ROUTINE', 'ELEVATED', 'THREATENING', 'CRISIS', 'IMMINENT'] as const
type RhetoricLabel = typeof CONF_LABELS[number]

async function scoreRhetoric(texts: string[], slug: string): Promise<{ score: number; label: string; key_phrases: string[] } | null> {
  const groqKey      = process.env.GROQ_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!groqKey && !anthropicKey) return null

  const combined   = texts.slice(0, 25).join('\n---\n').slice(0, 3500)
  const userPrompt = `CONFLICT: ${slug}\nRECENT POSTS (24h):\n${combined}\n\nScore the escalatory rhetoric level.`

  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model:           'llama-3.1-8b-instant',
          messages:        [{ role: 'system', content: RHETORIC_SYSTEM }, { role: 'user', content: userPrompt }],
          response_format: { type: 'json_object' },
          max_tokens: 300, temperature: 0.2,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (r.ok) {
        const j = await r.json() as { choices: { message: { content: string } }[] }
        const raw = j.choices[0]?.message?.content
        if (raw) return JSON.parse(raw) as { score: number; label: string; key_phrases: string[] }
      }
    } catch { /* fall through */ }
  }

  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 300,
          system: RHETORIC_SYSTEM, messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (r.ok) {
        const j = await r.json() as { content: { type: string; text: string }[] }
        const raw = j.content.find(b => b.type === 'text')?.text
        if (raw) return JSON.parse(raw) as { score: number; label: string; key_phrases: string[] }
      }
    } catch { /* fall through */ }
  }

  return null
}

export async function registerRhetoricRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/rhetoric', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const cacheKey = `rhetoric:${conflict.slug}`
    const cached   = await cacheGet<RhetoricScore>(cacheKey)
    if (cached) return cached

    let texts: string[] = []
    try {
      const rows = getDb().prepare(`
        SELECT text FROM telegram_posts
        WHERE conflict_slug = ? AND posted_at > datetime('now', '-24 hours') AND text IS NOT NULL
        ORDER BY rowid DESC LIMIT 30
      `).all(conflict.slug) as { text: string }[]
      texts = rows.map(r => r.text).filter(t => t && t.length > 20)
    } catch { /* table not ready */ }

    if (texts.length === 0) {
      return reply.status(202).send({ pending: true, message: 'No Telegram data available' })
    }

    const result = await scoreRhetoric(texts, conflict.slug)
    if (!result) return reply.status(202).send({ pending: true, message: 'AI service unavailable' })

    const toLabel = (v: string): RhetoricLabel =>
      (CONF_LABELS.includes(v as RhetoricLabel) ? v as RhetoricLabel : 'ROUTINE')

    const score: RhetoricScore = {
      slug:         conflict.slug,
      score:        Math.min(100, Math.max(0, Math.round(result.score ?? 0))),
      label:        toLabel(result.label ?? 'ROUTINE'),
      key_phrases:  (result.key_phrases ?? []).slice(0, 5),
      post_count:   texts.length,
      generated_at: Date.now(),
    }

    await cacheSet(cacheKey, score, 4 * 3600)
    return score
  })
}
