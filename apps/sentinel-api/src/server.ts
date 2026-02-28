import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'
import { ALL_CONFLICTS, getConflict } from '@sentinel/shared'

const app = Fastify({ logger: { level: 'warn' } })

await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
})

await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

// ── Health ─────────────────────────────────────────────────────────────────

app.get('/health', async () => ({
  status:    'ok',
  phase:     0,
  uptime:    process.uptime(),
  timestamp: new Date().toISOString(),
}))

// ── Conflict registry ──────────────────────────────────────────────────────

app.get('/api/conflicts', async () => ({
  conflicts: ALL_CONFLICTS.map(c => ({
    ...c,
    stats: {
      aircraft_count:   0,
      vessel_count:     0,
      incidents_24h:    0,
      last_updated:     null,
    },
  })),
}))

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug', async (req, reply) => {
  const conflict = getConflict(req.params.slug)
  if (!conflict) {
    return reply.status(404).send({ error: 'Conflict not found', slug: req.params.slug })
  }
  return {
    ...conflict,
    stats: {
      aircraft_count:   0,
      vessel_count:     0,
      incidents_24h:    0,
      last_updated:     null,
    },
  }
})

// ── Per-conflict stubs (Phase 1+) ──────────────────────────────────────────

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/aircraft', async (req, reply) => {
  if (!getConflict(req.params.slug)) return reply.status(404).send({ error: 'Not found' })
  return { aircraft: [], cache_status: 'PHASE_0' }
})

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/vessels', async (req, reply) => {
  if (!getConflict(req.params.slug)) return reply.status(404).send({ error: 'Not found' })
  return { vessels: [], cache_status: 'PHASE_0' }
})

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/incidents', async (req, reply) => {
  if (!getConflict(req.params.slug)) return reply.status(404).send({ error: 'Not found' })
  return { incidents: [], total: 0, cache_status: 'PHASE_0' }
})

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/theater', async (req, reply) => {
  const conflict = getConflict(req.params.slug)
  if (!conflict) return reply.status(404).send({ error: 'Not found' })
  return {
    slug:                    conflict.slug,
    theater:                 conflict.shortName,
    level:                   conflict.intensity === 'critical' ? 'critical'
                           : conflict.intensity === 'high'     ? 'high'
                           : conflict.intensity === 'elevated' ? 'elevated'
                           : 'normal',
    us_aircraft_count:       0,
    ir_aircraft_count:       0,
    us_vessels:              0,
    ir_vessels:              0,
    active_incidents_24h:    0,
    strike_package_detected: false,
    last_updated:            Date.now(),
  }
})

// ── Start ──────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })
console.log(`SENTINEL API — Phase 0 — http://localhost:${port}`)
console.log(`Serving ${ALL_CONFLICTS.length} conflicts: ${ALL_CONFLICTS.map(c => c.slug).join(', ')}`)
