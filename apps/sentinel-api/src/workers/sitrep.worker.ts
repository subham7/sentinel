// Hourly AI sitrep generator
// Fallback chain: Groq 70B → Groq 8B → OpenRouter → Anthropic → stale cache
// Non-fatal if all providers absent or fail

import { ALL_CONFLICTS } from '@sentinel/shared'
import type { SitrepReport } from '@sentinel/shared'
import { cacheGet, cacheSet } from '../services/cache.js'
import { getRecentIncidents }  from '../db/queries.js'

const POLL_MS = 60 * 60 * 1000  // 1 hour

const SYSTEM_PROMPT = `You are a senior military intelligence analyst producing situation reports (SITREPs).
Given current conflict data, produce a concise JSON SITREP with exactly these fields:
{
  "summary": "2-3 sentence operational summary",
  "threat_level": "normal" | "elevated" | "high" | "critical",
  "key_events": ["bullet 1", "bullet 2", "bullet 3"],
  "force_posture": "1 sentence describing current force posture"
}
Return ONLY valid JSON. No preamble, no markdown, no other text.`

function buildUserPrompt(slug: string, acList: { side: string; callsign: string; type: string }[], vsList: { side: string; name: string; type: string; ais_dark: boolean }[], incidents: ReturnType<typeof getRecentIncidents>): string {
  const conflict = ALL_CONFLICTS.find(c => c.slug === slug)!
  return `CONFLICT: ${conflict.name} (${conflict.shortName})
INTENSITY: ${conflict.intensity.toUpperCase()}
STATUS: ${conflict.status.toUpperCase()}
PARTIES: ${conflict.parties.map(p => p.name).join(' vs ')}

AIRCRAFT TRACKED (${acList.length} total):
${acList.slice(0, 20).map(a => `  - ${a.callsign || 'UNKNOWN'} [${a.side}/${a.type}]`).join('\n') || '  None tracked'}

VESSELS TRACKED (${vsList.length} total):
${vsList.slice(0, 20).map(v => `  - ${v.name || 'UNKNOWN'} [${v.side}/${v.type}]${v.ais_dark ? ' (AIS DARK)' : ''}`).join('\n') || '  None tracked'}

RECENT INCIDENTS (last 24h, top 20):
${incidents.map(i => `  [SEV${i.severity}] ${i.timestamp.slice(0, 16)}Z ${i.title}`).join('\n') || '  No incidents reported'}

Generate SITREP JSON now.`
}

function parseSitrepJson(raw: string, slug: string, model: string): SitrepReport | null {
  try {
    const parsed = JSON.parse(raw) as {
      summary: string
      threat_level: string
      key_events: string[]
      force_posture: string
    }
    return {
      slug,
      summary:       parsed.summary       ?? '',
      threat_level:  (['normal','elevated','high','critical'].includes(parsed.threat_level)
                       ? parsed.threat_level : 'normal') as SitrepReport['threat_level'],
      key_events:    Array.isArray(parsed.key_events) ? parsed.key_events.slice(0, 5) : [],
      force_posture: parsed.force_posture ?? '',
      generated_at:  Date.now(),
      model,
    }
  } catch {
    return null
  }
}

// ── Provider: OpenAI-compatible (Groq, OpenRouter) ────────────────────────────

async function tryOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string | null> {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages:        [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
      max_tokens:      600,
      temperature:     0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 120)}`)
  }
  const json = await resp.json() as { choices: { message: { content: string } }[] }
  return json.choices[0]?.message?.content ?? null
}

// ── Provider: Anthropic ───────────────────────────────────────────────────────

async function tryAnthropic(apiKey: string, userPrompt: string): Promise<string | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 120)}`)
  }
  const json = await resp.json() as { content: { type: string; text: string }[] }
  const block = json.content.find(b => b.type === 'text')
  return block?.text ?? null
}

// ── Main generator with fallback chain ───────────────────────────────────────

async function generateSitrep(slug: string): Promise<SitrepReport | null> {
  const conflict = ALL_CONFLICTS.find(c => c.slug === slug)
  if (!conflict) return null

  const incidents = getRecentIncidents(slug, 24, 20)
  const aircraft  = await cacheGet<{ side: string; callsign: string; type: string }[]>(`aircraft:${slug}`)
  const vessels   = await cacheGet<{ side: string; name: string; type: string; ais_dark: boolean }[]>(`vessels:${slug}`)
  const userPrompt = buildUserPrompt(slug, aircraft ?? [], vessels ?? [], incidents)

  const groqKey      = process.env.GROQ_API_KEY
  const openrouterKey = process.env.OPENROUTER_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  // 1. Groq llama-3.3-70b-versatile
  if (groqKey) {
    try {
      const raw = await tryOpenAICompat('https://api.groq.com/openai/v1', groqKey, 'llama-3.3-70b-versatile', userPrompt)
      if (raw) {
        const report = parseSitrepJson(raw, slug, 'llama-3.3-70b-versatile')
        if (report) { console.log(`[sitrep] ${slug} ✓ groq/llama-3.3-70b`); return report }
      }
    } catch (e) {
      console.warn(`[sitrep] groq/llama-3.3-70b failed for ${slug}: ${(e as Error).message}`)
    }
  }

  // 2. Groq llama-3.1-8b-instant (higher quota, same key)
  if (groqKey) {
    try {
      const raw = await tryOpenAICompat('https://api.groq.com/openai/v1', groqKey, 'llama-3.1-8b-instant', userPrompt)
      if (raw) {
        const report = parseSitrepJson(raw, slug, 'llama-3.1-8b-instant')
        if (report) { console.log(`[sitrep] ${slug} ✓ groq/llama-3.1-8b (fallback)`); return report }
      }
    } catch (e) {
      console.warn(`[sitrep] groq/llama-3.1-8b failed for ${slug}: ${(e as Error).message}`)
    }
  }

  // 3. OpenRouter (any capable model)
  if (openrouterKey) {
    try {
      const raw = await tryOpenAICompat('https://openrouter.ai/api/v1', openrouterKey, 'meta-llama/llama-3.1-8b-instruct:free', userPrompt)
      if (raw) {
        const report = parseSitrepJson(raw, slug, 'openrouter/llama-3.1-8b')
        if (report) { console.log(`[sitrep] ${slug} ✓ openrouter (fallback)`); return report }
      }
    } catch (e) {
      console.warn(`[sitrep] openrouter failed for ${slug}: ${(e as Error).message}`)
    }
  }

  // 4. Anthropic claude-haiku (cost-effective)
  if (anthropicKey) {
    try {
      const raw = await tryAnthropic(anthropicKey, userPrompt)
      if (raw) {
        const report = parseSitrepJson(raw, slug, 'claude-haiku-4-5')
        if (report) { console.log(`[sitrep] ${slug} ✓ anthropic/haiku (fallback)`); return report }
      }
    } catch (e) {
      console.warn(`[sitrep] anthropic failed for ${slug}: ${(e as Error).message}`)
    }
  }

  // 5. Serve stale cached sitrep
  const stale = await cacheGet<SitrepReport>(`sitrep:${slug}:stale`)
  if (stale) {
    console.warn(`[sitrep] ${slug} all providers failed — serving stale sitrep from ${new Date(stale.generated_at).toISOString()}`)
    return null  // Don't overwrite fresh key; stale key remains available for the route
  }

  console.warn(`[sitrep] ${slug} all providers failed and no stale cache available`)
  return null
}

async function poll(): Promise<void> {
  const hasAnyKey = !!(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY)
  if (!hasAnyKey) return

  for (const conflict of ALL_CONFLICTS) {
    try {
      const report = await generateSitrep(conflict.slug)
      if (report) {
        await cacheSet(`sitrep:${conflict.slug}`,       report, 3_600)
        await cacheSet(`sitrep:${conflict.slug}:stale`, report, 86_400)
        console.log(`[sitrep] Cached sitrep for ${conflict.slug} — threat: ${report.threat_level} via ${report.model}`)
      }
    } catch (e) {
      console.warn(`[sitrep] poll error for ${conflict.slug}:`, (e as Error).message)
    }
    // Brief pause between conflicts to avoid concurrent provider calls
    await new Promise(r => setTimeout(r, 3000))
  }
}

export function startSitrepWorker(): void {
  const keys = [
    process.env.GROQ_API_KEY      && 'groq',
    process.env.OPENROUTER_API_KEY && 'openrouter',
    process.env.ANTHROPIC_API_KEY && 'anthropic',
  ].filter(Boolean).join(', ')

  if (!keys) {
    console.log('[sitrep] worker started — no AI keys configured, sitreps disabled')
    return
  }
  console.log(`[sitrep] worker started (1h interval) — providers: ${keys}`)
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
