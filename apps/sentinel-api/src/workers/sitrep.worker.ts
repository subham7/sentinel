// Hourly AI sitrep generator — Groq llama-3.3-70b-versatile
// Non-fatal if GROQ_API_KEY absent or API fails

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

async function generateSitrep(slug: string): Promise<SitrepReport | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const conflict = ALL_CONFLICTS.find(c => c.slug === slug)
  if (!conflict) return null

  const incidents  = getRecentIncidents(slug, 24, 20)
  const aircraft   = await cacheGet<{ side: string; callsign: string; type: string }[]>(`aircraft:${slug}`)
  const vessels    = await cacheGet<{ side: string; name: string; type: string; ais_dark: boolean }[]>(`vessels:${slug}`)

  const acList  = aircraft ?? []
  const vsList  = vessels  ?? []

  const userPrompt = `CONFLICT: ${conflict.name} (${conflict.shortName})
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

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:           'llama-3.3-70b-versatile',
        messages:        [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
        response_format: { type: 'json_object' },
        max_tokens:      600,
        temperature:     0.3,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      console.warn(`[sitrep] Groq HTTP ${resp.status} for ${slug}`)
      return null
    }

    const json = await resp.json() as { choices: { message: { content: string } }[] }
    const raw  = json.choices[0]?.message?.content
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      summary: string
      threat_level: string
      key_events: string[]
      force_posture: string
    }

    const report: SitrepReport = {
      slug,
      summary:       parsed.summary       ?? '',
      threat_level:  (['normal','elevated','high','critical'].includes(parsed.threat_level)
                       ? parsed.threat_level : 'normal') as SitrepReport['threat_level'],
      key_events:    Array.isArray(parsed.key_events) ? parsed.key_events.slice(0, 5) : [],
      force_posture: parsed.force_posture ?? '',
      generated_at:  Date.now(),
      model:         'llama-3.3-70b-versatile',
    }
    return report
  } catch (e) {
    console.warn(`[sitrep] Error generating sitrep for ${slug}:`, (e as Error).message)
    return null
  }
}

async function poll(): Promise<void> {
  for (const conflict of ALL_CONFLICTS) {
    try {
      const report = await generateSitrep(conflict.slug)
      if (report) {
        await cacheSet(`sitrep:${conflict.slug}`,       report, 3_600)
        await cacheSet(`sitrep:${conflict.slug}:stale`, report, 86_400)
        console.log(`[sitrep] Generated sitrep for ${conflict.slug} — threat: ${report.threat_level}`)
      }
    } catch (e) {
      console.warn(`[sitrep] poll error for ${conflict.slug}:`, (e as Error).message)
    }
    // Brief pause between conflicts
    await new Promise(r => setTimeout(r, 3000))
  }
}

export function startSitrepWorker(): void {
  const hasKey = !!process.env.GROQ_API_KEY
  console.log(`[sitrep] worker started (1h interval)${hasKey ? '' : ' — GROQ_API_KEY absent, sitreps disabled'}`)
  if (!hasKey) return
  void poll()
  setInterval(() => void poll(), POLL_MS)
}
