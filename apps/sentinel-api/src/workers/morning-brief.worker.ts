// Daily 06:00 UTC intelligence brief in BLUF format
// Fallback chain: Groq 70B → Groq 8B → OpenRouter → Anthropic
// Non-fatal if all providers absent

import { ALL_CONFLICTS } from '@sentinel/shared'
import type { MorningBrief } from '@sentinel/shared'
import { cacheGet, cacheSet, writeFreshness } from '../services/cache.js'
import { getRecentIncidents } from '../db/queries.js'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

const CACHE_KEY = (slug: string, date: string) => `morning-brief:${slug}:${date}`

const SYSTEM_PROMPT = `You are a senior military intelligence analyst writing a classified daily brief.
Produce a JSON object with exactly these fields:
{
  "bluf": "1-2 sentence bottom line up front — most critical operational judgment",
  "judgments": [
    { "confidence": "HIGH",     "text": "..." },
    { "confidence": "MODERATE", "text": "..." },
    { "confidence": "LOW",      "text": "..." }
  ],
  "evidence": "2-3 sentences summarising the key data driving the above",
  "outlook": "key indicators and warning signs to watch in next 24-72 hours",
  "overall_confidence": "HIGH" | "MODERATE" | "LOW"
}
Confidence uses ODNI ICD 203 standards: HIGH=well-corroborated by 3+ independent sources, MODERATE=credible but gaps remain, LOW=fragmentary/significant assumptions.
Return ONLY valid JSON. No markdown, no preamble.`

function buildPrompt(
  slug:      string,
  incidents: ReturnType<typeof getRecentIncidents>,
  acCount:   number,
  vsCount:   number,
): string {
  const conflict  = ALL_CONFLICTS.find(c => c.slug === slug)!
  const bySource  = (src: string) => incidents.filter(i => i.source === src).length
  const sourceParts = [
    bySource('gdelt')    > 0 && `GDELT(n=${bySource('gdelt')})`,
    bySource('acled')    > 0 && `ACLED(n=${bySource('acled')})`,
    bySource('telegram') > 0 && `TELEGRAM(n=${bySource('telegram')})`,
    acCount > 0 && `ADS-B(${acCount} tracks)`,
    vsCount > 0 && `AIS(${vsCount} vessels)`,
  ].filter(Boolean).join(', ')

  const hiSev = incidents.filter(i => i.severity >= 4).slice(0, 10)

  return `THEATER: ${conflict.name} / ${conflict.shortName}
DATE: ${todayUTC()} UTC
INTENSITY: ${conflict.intensity.toUpperCase()}
PARTIES: ${conflict.parties.map(p => p.name).join(' vs ')}
DATA SOURCES: ${sourceParts || 'limited'}

EVENTS LAST 24H (${incidents.length} total):
${incidents.slice(0, 30).map(i =>
    `[SEV${i.severity}/${i.category.toUpperCase()}] ${i.timestamp.slice(0, 16)}Z ${i.title}`
  ).join('\n') || '  No events reported'}

HIGH-SEVERITY EVENTS (SEV 4-5):
${hiSev.map(i => `• ${i.title}${i.summary ? ': ' + i.summary : ''}`).join('\n') || '  None'}

Generate the intelligence brief now.`
}

// ── Provider helpers ──────────────────────────────────────────────────────────

async function callOpenAICompat(baseUrl: string, key: string, model: string, prompt: string): Promise<string | null> {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages:        [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 700, temperature: 0.2,
    }),
    signal: AbortSignal.timeout(35_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json() as { choices: { message: { content: string } }[] }
  return j.choices[0]?.message?.content ?? null
}

async function callAnthropic(key: string, prompt: string): Promise<string | null> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 700,
      system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(35_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json() as { content: { type: string; text: string }[] }
  return j.content.find(b => b.type === 'text')?.text ?? null
}

// ── JSON parser (validates + constructs MorningBrief) ─────────────────────────

function parseBrief(raw: string, slug: string, date: string, sourcesStr: string, model: string): MorningBrief | null {
  try {
    // Strip markdown code fences if model wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const p = JSON.parse(cleaned) as {
      bluf?: string
      judgments?: { confidence?: string; text?: string }[]
      evidence?: string
      outlook?: string
      overall_confidence?: string
    }
    if (!p.bluf) return null   // minimum viable response check
    const conf = (v?: string): 'HIGH' | 'MODERATE' | 'LOW' =>
      (['HIGH', 'MODERATE', 'LOW'].includes(v ?? '') ? v as 'HIGH' | 'MODERATE' | 'LOW' : 'LOW')
    return {
      slug, date,
      bluf:               p.bluf,
      judgments:          (p.judgments ?? []).slice(0, 5).map(j => ({ confidence: conf(j.confidence), text: j.text ?? '' })),
      evidence:           p.evidence ?? '',
      outlook:            p.outlook  ?? '',
      overall_confidence: conf(p.overall_confidence),
      sources:            sourcesStr,
      generated_at:       Date.now(),
      model,
    }
  } catch {
    return null
  }
}

// ── Generator ─────────────────────────────────────────────────────────────────

async function generateBrief(slug: string): Promise<MorningBrief | null> {
  const conflict = ALL_CONFLICTS.find(c => c.slug === slug)
  if (!conflict) return null

  const date     = todayUTC()
  const cacheKey = CACHE_KEY(slug, date)

  // Already generated today
  const existing = await cacheGet<MorningBrief>(cacheKey)
  if (existing) return existing

  const incidents  = getRecentIncidents(slug, 24, 100)
  const aircraft   = await cacheGet<unknown[]>(`aircraft:${slug}`)
  const vessels    = await cacheGet<unknown[]>(`vessels:${slug}`)
  const prompt     = buildPrompt(slug, incidents, aircraft?.length ?? 0, vessels?.length ?? 0)

  const bySource   = (src: string) => incidents.filter(i => i.source === src).length
  const sourcesStr = [
    bySource('gdelt')    > 0 && `GDELT(n=${bySource('gdelt')})`,
    bySource('acled')    > 0 && `ACLED(n=${bySource('acled')})`,
    bySource('telegram') > 0 && `TELEGRAM(n=${bySource('telegram')})`,
  ].filter(Boolean).join(', ') || 'No active sources'

  const groqKey       = process.env.GROQ_API_KEY
  const openrouterKey = process.env.OPENROUTER_API_KEY
  const anthropicKey  = process.env.ANTHROPIC_API_KEY

  // Each step: call provider, parse JSON, return on first valid result.
  // This ensures a bad/empty response from one provider doesn't block the rest.

  // 1. Groq llama-3.3-70b-versatile (primary)
  if (groqKey) {
    try {
      const raw = await callOpenAICompat('https://api.groq.com/openai/v1', groqKey, 'llama-3.3-70b-versatile', prompt)
      const brief = raw ? parseBrief(raw, slug, date, sourcesStr, 'llama-3.3-70b') : null
      if (brief) { console.log(`[brief] ${slug} ✓ groq/llama-3.3-70b`); return brief }
    } catch (e) { console.warn(`[brief] groq/70b failed for ${slug}: ${(e as Error).message}`) }
  }

  // 2. Groq llama-3.1-8b-instant (higher quota, same key)
  if (groqKey) {
    try {
      const raw = await callOpenAICompat('https://api.groq.com/openai/v1', groqKey, 'llama-3.1-8b-instant', prompt)
      const brief = raw ? parseBrief(raw, slug, date, sourcesStr, 'llama-3.1-8b') : null
      if (brief) { console.log(`[brief] ${slug} ✓ groq/llama-3.1-8b (fallback)`); return brief }
    } catch (e) { console.warn(`[brief] groq/8b failed for ${slug}: ${(e as Error).message}`) }
  }

  // 3. OpenRouter — free tier 70B (promoted above Anthropic)
  if (openrouterKey) {
    try {
      const raw = await callOpenAICompat('https://openrouter.ai/api/v1', openrouterKey, 'meta-llama/llama-3.3-70b-instruct:free', prompt)
      const brief = raw ? parseBrief(raw, slug, date, sourcesStr, 'openrouter/llama-3.3-70b') : null
      if (brief) { console.log(`[brief] ${slug} ✓ openrouter/llama-3.3-70b (fallback)`); return brief }
    } catch (e) { console.warn(`[brief] openrouter failed for ${slug}: ${(e as Error).message}`) }
  }

  // 4. Anthropic claude-haiku (last resort — costs money)
  if (anthropicKey) {
    try {
      const raw = await callAnthropic(anthropicKey, prompt)
      const brief = raw ? parseBrief(raw, slug, date, sourcesStr, 'claude-haiku-4-5') : null
      if (brief) { console.log(`[brief] ${slug} ✓ anthropic/haiku (fallback)`); return brief }
    } catch (e) { console.warn(`[brief] anthropic failed for ${slug}: ${(e as Error).message}`) }
  }

  // 5. Stale cache — serve yesterday's brief rather than nothing
  const stale = await cacheGet<MorningBrief>(`${cacheKey}:stale`)
  if (stale) {
    console.warn(`[brief] ${slug} all providers failed — stale brief from ${stale.date} still cached`)
    return null  // route serves stale; don't overwrite today's cache key
  }

  console.warn(`[brief] ${slug} all providers failed, no stale available`)
  return null
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function scheduleDailyAt(hourUTC: number, fn: () => Promise<void>): void {
  function msUntilNext(): number {
    const now  = new Date()
    const next = new Date()
    next.setUTCHours(hourUTC, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next.getTime() - now.getTime()
  }
  function go() { setTimeout(() => { void fn(); go() }, msUntilNext()) }
  go()
}

async function poll(): Promise<void> {
  const hasKey = !!(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY)
  if (!hasKey) return
  for (const c of ALL_CONFLICTS) {
    try {
      const brief = await generateBrief(c.slug)
      if (brief) await writeFreshness(`morning-brief:${c.slug}`, 'ok')
    } catch (e) {
      console.warn(`[brief] poll error ${c.slug}:`, (e as Error).message)
      await writeFreshness(`morning-brief:${c.slug}`, 'error', (e as Error).message)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
}

export function startMorningBriefWorker(): void {
  const hasKey = !!(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY)
  if (!hasKey) {
    console.log('[brief] worker started — no AI keys, briefs disabled')
    return
  }
  console.log('[brief] worker started — daily at 06:00 UTC')
  void poll()                     // generate on startup if today's brief missing
  scheduleDailyAt(6, poll)        // then every day at 06:00 UTC
}
