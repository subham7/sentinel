// Analyst chat — Claude claude-sonnet-4-6 with tool-use, scoped per conflict
// POST /api/conflicts/:slug/analyst-chat
// Body: { message: string; history: { role: 'user' | 'assistant'; content: string }[] }

import type { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { getConflict } from '@sentinel/shared'
import type { Aircraft, Vessel } from '@sentinel/shared'
import { cacheGet }           from '../services/cache.js'
import { getRecentIncidents } from '../db/queries.js'

const MAX_TOOL_ITERATIONS = 5

let anthropic: Anthropic | null = null
function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropic
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name:        'query_incidents',
    description: 'Query recent incidents for this conflict theater. Returns incidents from the database.',
    input_schema: {
      type:       'object' as const,
      properties: {
        hours:        { type: 'number',  description: 'How many hours back to query (default 24, max 168)' },
        severity_min: { type: 'number',  description: 'Minimum severity 1-5 (default 1)' },
        category:     { type: 'string',  description: 'Filter by category: armed_conflict, missile, drone, naval, cyber, etc.' },
      },
      required: [],
    },
  },
  {
    name:        'get_aircraft_by_type',
    description: 'Get currently tracked aircraft in this conflict theater, optionally filtered.',
    input_schema: {
      type:       'object' as const,
      properties: {
        type: { type: 'string', description: 'Filter by type: fighter, tanker, isr, transport, uav, unknown' },
        side: { type: 'string', description: 'Filter by side: US, ALLIED, IR, IL, UNKNOWN' },
      },
      required: [],
    },
  },
  {
    name:        'get_vessel_status',
    description: 'Get currently tracked vessels in this conflict theater.',
    input_schema: {
      type:       'object' as const,
      properties: {
        ais_dark_only: { type: 'boolean', description: 'If true, only return AIS-dark vessels' },
      },
      required: [],
    },
  },
  {
    name:        'get_theater_posture',
    description: 'Get a summary of the theater posture: aircraft counts, vessel counts, and recent incident stats.',
    input_schema: {
      type:       'object' as const,
      properties: {},
      required:   [],
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name:  string,
  input: Record<string, unknown>,
  slug:  string,
): Promise<string> {
  try {
    if (name === 'query_incidents') {
      const hours       = Math.min(Number(input.hours ?? 24), 168)
      const severityMin = Number(input.severity_min ?? 1)
      const category    = input.category as string | undefined
      const incidents   = getRecentIncidents(slug, hours, 50)
      const filtered    = incidents
        .filter(i => i.severity >= severityMin)
        .filter(i => !category || i.category === category)
      return JSON.stringify(filtered.slice(0, 30).map(i => ({
        id:            i.id,
        timestamp:     i.timestamp,
        title:         i.title,
        severity:      i.severity,
        category:      i.category,
        location_name: i.location_name,
        actors:        i.actors,
        summary:       i.summary,
      })))
    }

    if (name === 'get_aircraft_by_type') {
      const aircraft = await cacheGet<Aircraft[]>(`aircraft:${slug}`) ?? []
      const typeFilter = input.type as string | undefined
      const sideFilter = input.side as string | undefined
      const filtered   = aircraft
        .filter(a => !typeFilter || a.type === typeFilter)
        .filter(a => !sideFilter || a.side === sideFilter)
      return JSON.stringify(filtered.slice(0, 50).map(a => ({
        callsign: a.callsign, type: a.type, side: a.side,
        altitude: a.altitude, speed: a.speed, heading: a.heading,
        lat: a.lat, lon: a.lon, mil: a.mil,
      })))
    }

    if (name === 'get_vessel_status') {
      const vessels      = await cacheGet<Vessel[]>(`vessels:${slug}`) ?? []
      const darkOnly     = Boolean(input.ais_dark_only)
      const filtered     = darkOnly ? vessels.filter(v => v.ais_dark) : vessels
      return JSON.stringify(filtered.slice(0, 50).map(v => ({
        mmsi: v.mmsi, name: v.name, type: v.type, side: v.side,
        speed: v.speed, heading: v.heading, lat: v.lat, lon: v.lon,
        ais_dark: v.ais_dark, sanctioned: v.sanctioned,
      })))
    }

    if (name === 'get_theater_posture') {
      const aircraft = await cacheGet<Aircraft[]>(`aircraft:${slug}`) ?? []
      const vessels  = await cacheGet<Vessel[]>(`vessels:${slug}`)   ?? []
      const inc24h   = getRecentIncidents(slug, 24, 1000)
      const inc6h    = getRecentIncidents(slug, 6,  1000)
      return JSON.stringify({
        aircraft_total:   aircraft.length,
        aircraft_by_side: aircraft.reduce((acc, a) => { acc[a.side] = (acc[a.side] ?? 0) + 1; return acc }, {} as Record<string, number>),
        aircraft_by_type: aircraft.reduce((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc }, {} as Record<string, number>),
        vessels_total:    vessels.length,
        vessels_ais_dark: vessels.filter(v => v.ais_dark).length,
        vessels_by_side:  vessels.reduce((acc, v) => { acc[v.side] = (acc[v.side] ?? 0) + 1; return acc }, {} as Record<string, number>),
        incidents_24h:    inc24h.length,
        incidents_6h:     inc6h.length,
        highest_severity: inc24h.length > 0 ? Math.max(...inc24h.map(i => i.severity)) : 0,
      })
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` })
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message })
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface ChatBody {
  message: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export async function registerAnalystChatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { slug: string }; Body: ChatBody }>(
    '/api/conflicts/:slug/analyst-chat',
    async (req, reply) => {
      const conflict = getConflict(req.params.slug)
      if (!conflict) return reply.status(404).send({ error: 'Not found' })

      const client = getAnthropic()
      if (!client) {
        return reply.status(503).send({
          error: 'Analyst unavailable',
          message: 'ANTHROPIC_API_KEY not configured',
        })
      }

      const { message, history = [] } = req.body
      if (!message?.trim()) {
        return reply.status(400).send({ error: 'message required' })
      }

      const systemPrompt = `You are SENTINEL Analyst, an AI military intelligence analyst embedded in the SENTINEL geospatial intelligence platform.
You have access to real-time data for the ${conflict.name} conflict (${conflict.shortName}).
Parties: ${conflict.parties.map(p => `${p.flagEmoji} ${p.name} (${p.shortCode})`).join(', ')}.
Current intensity: ${conflict.intensity.toUpperCase()}.

Use the provided tools to query live data before answering. Be concise, precise, and use military terminology.
When citing data, include counts and timestamps. Flag uncertainties explicitly.`

      // Build message history
      const messages: Anthropic.MessageParam[] = [
        ...history.map(h => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
        { role: 'user', content: message },
      ]

      const toolsUsed: string[] = []
      let iterations = 0

      // Tool-use loop
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++

        const response = await client.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 1024,
          system:     systemPrompt,
          tools:      TOOLS,
          messages,
        })

        if (response.stop_reason === 'end_turn') {
          // Extract text content
          const text = response.content
            .filter(b => b.type === 'text')
            .map(b => (b as Anthropic.TextBlock).text)
            .join('')
          return { response: text, tools_used: toolsUsed }
        }

        if (response.stop_reason === 'tool_use') {
          // Execute all tool calls in this response
          const assistantContent = response.content
          messages.push({ role: 'assistant', content: assistantContent })

          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const block of assistantContent) {
            if (block.type !== 'tool_use') continue
            toolsUsed.push(block.name)
            const result = await executeTool(block.name, block.input as Record<string, unknown>, conflict.slug)
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
          }
          messages.push({ role: 'user', content: toolResults })
          continue
        }

        // Unexpected stop reason — return whatever we have
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('')
        return { response: text || '// NO RESPONSE', tools_used: toolsUsed }
      }

      return { response: '// MAX ITERATIONS REACHED — partial analysis complete', tools_used: toolsUsed }
    },
  )
}
