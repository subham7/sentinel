// 3-pass Groq classifier with Redis dedup cache
// Pass 1: keyword check (instant, no API call)
// Pass 2: llama-3.1-8b-instant (all items that passed keyword check)
// Pass 3: llama-3.3-70b-versatile (re-assess items scoring sev 4–5)

import { createHash } from 'node:crypto'
import type { IncidentCategory, IncidentSeverity } from '@sentinel/shared'
import { cacheGet, cacheSet } from './cache.js'

export interface ClassificationResult {
  event_type:          IncidentCategory
  severity:            IncidentSeverity
  location:            { place: string; lat: number | null; lon: number | null }
  actors:              string[]
  summary:             string
  confidence:          number
  is_conflict_related: boolean
}

// ── Keyword pass ──────────────────────────────────────────────────────────────

const CONFLICT_KEYWORDS = [
  'airstrike', 'air strike', 'bombing', 'missile', 'rocket', 'drone', 'uav',
  'explosion', 'blast', 'attack', 'military', 'troops', 'warship', 'nuclear',
  'uranium', 'enrichment', 'irgc', 'houthi', 'hezbollah', 'hamas', 'idf',
  'centcom', 'hormuz', 'persian gulf', 'natanz', 'fordow', 'seized', 'killed',
  'casualties', 'combat', 'forces', 'strike', 'shelling', 'gunfire', 'ambush',
  'convoy', 'blockade', 'intercept', 'incursion', 'artillery', 'mortar',
]

const SEV5 = ['nuclear', 'ballistic missile', 'mass casualt', 'declared war', 'chemical weapon']
const SEV4 = ['missile strike', 'rocket attack', 'airstrike', 'explosion', 'blast', 'seized vessel', 'warship', 'killed', 'casualties']
const SEV3 = ['military exercise', 'deployment', 'sanctions', 'intercept', 'threat', 'tensions escalat']
const SEV2 = ['warning', 'protest', 'statement', 'drill', 'patrol', 'meeting']

function keywordPass(text: string): ClassificationResult | null {
  const lower = text.toLowerCase()
  if (!CONFLICT_KEYWORDS.some(kw => lower.includes(kw))) return null

  let severity: IncidentSeverity = 1
  let event_type: IncidentCategory = 'other'

  if (SEV5.some(p => lower.includes(p)))      severity = 5
  else if (SEV4.some(p => lower.includes(p))) severity = 4
  else if (SEV3.some(p => lower.includes(p))) severity = 3
  else if (SEV2.some(p => lower.includes(p))) severity = 2

  if      (lower.includes('missile') || lower.includes('ballistic'))    event_type = 'missile'
  else if (lower.includes('drone') || lower.includes('uav'))            event_type = 'drone'
  else if (lower.includes('naval') || lower.includes('warship') || lower.includes('vessel')) event_type = 'naval'
  else if (lower.includes('nuclear') || lower.includes('uranium'))      event_type = 'nuclear'
  else if (lower.includes('cyber') || lower.includes('hack'))           event_type = 'cyber'
  else if (lower.includes('protest') || lower.includes('demonstr'))     event_type = 'protest'
  else if (lower.includes('diplomati') || lower.includes('talks'))      event_type = 'diplomatic'
  else if (lower.includes('explosion') || lower.includes('blast') || lower.includes('airstrike')) event_type = 'explosion'
  else if (lower.includes('attack') || lower.includes('combat'))        event_type = 'armed_conflict'

  return {
    event_type, severity,
    location: { place: '', lat: null, lon: null },
    actors: [], summary: text.slice(0, 200), confidence: 0.4,
    is_conflict_related: true,
  }
}

// ── Groq API ──────────────────────────────────────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const SYSTEM_PROMPT = `You are a geospatial intelligence analyst. Extract exactly this JSON:
{"event_type":"armed_conflict|explosion|missile|drone|cyber|naval|protest|diplomatic|nuclear|other","severity":1,"location":{"place":"","lat":null,"lon":null},"actors":[],"summary":"one sentence","confidence":0.5,"is_conflict_related":false}
Severity: 1=monitoring 2=low 3=elevated 4=significant violence 5=critical/mass casualty. Return ONLY valid JSON.`

async function groqClassify(text: string, model: string): Promise<ClassificationResult | null> {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: text.slice(0, 800) },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 250,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return null
    const data    = await resp.json() as { choices: { message: { content: string } }[] }
    const content = data.choices[0]?.message.content
    if (!content) return null
    return JSON.parse(content) as ClassificationResult
  } catch {
    return null
  }
}

// ── 3-pass entry point ────────────────────────────────────────────────────────

export async function classifyText(text: string): Promise<ClassificationResult | null> {
  const hash     = createHash('sha256').update(text.slice(0, 500)).digest('hex').slice(0, 32)
  const cacheKey = `classify:${hash}`

  const cached = await cacheGet<ClassificationResult>(cacheKey)
  if (cached !== null) return cached

  // Pass 1 — keywords (instant gate)
  const kwResult = keywordPass(text)
  if (!kwResult) return null

  // Pass 2 — 8B model
  const result8b = await groqClassify(text, 'llama-3.1-8b-instant')
  const mid = result8b ?? kwResult
  if (!mid.is_conflict_related) return null

  // Pass 3 — 70B model only for high-severity
  let final = mid
  if (mid.severity >= 4) {
    const result70b = await groqClassify(text, 'llama-3.3-70b-versatile')
    if (result70b && result70b.is_conflict_related) final = result70b
  }
  if (!final.is_conflict_related) return null

  await cacheSet(cacheKey, final, 86_400)
  return final
}
