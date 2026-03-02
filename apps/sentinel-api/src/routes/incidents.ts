// Incident routes: REST list + GeoJSON export + SSE stream

import type { FastifyInstance } from 'fastify'
import { getConflict }           from '@sentinel/shared'
import type { Incident }         from '@sentinel/shared'
import { getRecentIncidents, getIncidentTrend, getIncidentCategoryBreakdown } from '../db/queries.js'
import { incidentBus }           from '../services/incident-bus.js'

type SlugParams = { Params: { slug: string } }

export async function registerIncidentRoutes(app: FastifyInstance): Promise<void> {

  // ── GET list ────────────────────────────────────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/incidents', async (req, reply) => {
    const { slug } = req.params
    if (!getConflict(slug)) return reply.status(404).send({ error: 'Not found' })

    const qs       = req.query as Record<string, string>
    const hours    = Math.min(parseInt(qs.hours ?? '24', 10), 168)   // max 7 days
    const limit    = Math.min(parseInt(qs.limit ?? '200', 10), 500)
    const minSev   = parseInt(qs.severity ?? '1', 10)

    let incidents = getRecentIncidents(slug, hours, limit)
    if (minSev > 1) incidents = incidents.filter(i => i.severity >= minSev)

    return { incidents, total: incidents.length, hours, slug }
  })

  // ── GET GeoJSON ─────────────────────────────────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/incidents/geojson', async (req, reply) => {
    const { slug } = req.params
    if (!getConflict(slug)) return reply.status(404).send({ error: 'Not found' })

    const qs    = req.query as Record<string, string>
    const hours = Math.min(parseInt(qs.hours ?? '24', 10), 168)
    const items = getRecentIncidents(slug, hours, 500)

    const fc = {
      type:     'FeatureCollection' as const,
      features: items.filter(i => i.lat && i.lon).map(i => ({
        type:       'Feature' as const,
        geometry:   { type: 'Point' as const, coordinates: [i.lon, i.lat] },
        properties: { id: i.id, title: i.title, category: i.category, severity: i.severity, timestamp: i.timestamp },
      })),
    }
    return fc
  })

  // ── Trend (daily counts, 30-day default) ───────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/incidents/trend', async (req, reply) => {
    const { slug } = req.params
    if (!getConflict(slug)) return reply.status(404).send({ error: 'Not found' })
    const days = Math.min(parseInt((req.query as Record<string, string>).days ?? '30', 10), 90)
    return { trend: getIncidentTrend(slug, days), slug, days }
  })

  // ── Category breakdown (7-day default) ─────────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/incidents/categories', async (req, reply) => {
    const { slug } = req.params
    if (!getConflict(slug)) return reply.status(404).send({ error: 'Not found' })
    const days = Math.min(parseInt((req.query as Record<string, string>).days ?? '7', 10), 30)
    return { categories: getIncidentCategoryBreakdown(slug, days), slug, days }
  })

  // ── SSE stream ──────────────────────────────────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/incidents/stream', async (req, reply) => {
    const { slug } = req.params
    if (!getConflict(slug)) return reply.status(404).send({ error: 'Not found' })

    // Hijack the response so Fastify doesn't attempt to serialise the return value
    // after the handler resolves (which would double-write headers and close the stream)
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    // Send initial batch (last 24h)
    const initial = getRecentIncidents(slug, 24, 200)
    reply.raw.write(`event: init\ndata: ${JSON.stringify(initial)}\n\n`)

    // Send keepalive every 25s to prevent proxy timeouts
    const keepalive = setInterval(() => {
      if (!reply.raw.writableEnded) reply.raw.write(': keepalive\n\n')
    }, 25_000)

    const onIncident = (incident: Incident) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`event: incident\ndata: ${JSON.stringify(incident)}\n\n`)
      }
    }

    incidentBus.on(`incident:${slug}`, onIncident)

    reply.raw.on('close', () => {
      clearInterval(keepalive)
      incidentBus.off(`incident:${slug}`, onIncident)
    })

    // Keep the handler open
    await new Promise<void>(resolve => reply.raw.on('close', resolve))
  })
}
