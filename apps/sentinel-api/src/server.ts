import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
// Load .env from the monorepo root (two levels up from apps/sentinel-api)
loadDotenv({ path: resolve(fileURLToPath(import.meta.url), '../../../../.env') })
import { ALL_CONFLICTS, getConflict } from '@sentinel/shared'
import { getDb } from './db/index.js'
import { cacheGet } from './services/cache.js'
import { registerAircraftRoutes }  from './routes/aircraft.js'
import { registerVesselRoutes }    from './routes/vessels.js'
import { registerIncidentRoutes }  from './routes/incidents.js'
import { registerNuclearRoutes }   from './routes/nuclear.js'
import { getRecentIncidents }      from './db/queries.js'
import { startWorkers } from './workers/index.js'

const app = Fastify({ logger: { level: 'warn' } })

await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
})
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
await app.register(websocket)

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', async () => ({
  status:    'ok',
  phase:     4,
  uptime:    process.uptime(),
  timestamp: new Date().toISOString(),
}))

// ── Conflict registry ───────────────────────────────────────────────────────

app.get('/api/conflicts', async () => {
  const conflicts = await Promise.all(
    ALL_CONFLICTS.map(async c => {
      const [aircraft, vessels] = await Promise.all([
        cacheGet<unknown[]>(`aircraft:${c.slug}`),
        cacheGet<unknown[]>(`vessels:${c.slug}`),
      ])
      const acList = aircraft ?? []
      const vsLList = vessels  ?? []
      const incidents24h = getRecentIncidents(c.slug, 24, 1000).length
      return {
        ...c,
        stats: {
          aircraft_count:  acList.length,
          vessel_count:    vsLList.length,
          incidents_24h:   incidents24h,
          last_updated:    Date.now(),
        },
      }
    }),
  )
  return { conflicts }
})

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug', async (req, reply) => {
  const conflict = getConflict(req.params.slug)
  if (!conflict) {
    return reply.status(404).send({ error: 'Conflict not found', slug: req.params.slug })
  }
  const [aircraft, vessels] = await Promise.all([
    cacheGet<unknown[]>(`aircraft:${conflict.slug}`),
    cacheGet<unknown[]>(`vessels:${conflict.slug}`),
  ])
  const acList   = aircraft ?? []
  const vsLList  = vessels  ?? []
  const inc24h   = getRecentIncidents(conflict.slug, 24, 1000).length
  return {
    ...conflict,
    stats: {
      aircraft_count:  acList.length,
      vessel_count:    vsLList.length,
      incidents_24h:   inc24h,
      last_updated:    Date.now(),
    },
  }
})

// ── Aircraft routes (REST + WS) ─────────────────────────────────────────────

await registerAircraftRoutes(app)

// ── Vessel routes (REST + WS) ────────────────────────────────────────────────

await registerVesselRoutes(app)

// ── Incident routes (REST + SSE) ─────────────────────────────────────────────

await registerIncidentRoutes(app)
await registerNuclearRoutes(app)

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/theater', async (req, reply) => {
  const conflict = getConflict(req.params.slug)
  if (!conflict) return reply.status(404).send({ error: 'Not found' })
  const [aircraft, vessels] = await Promise.all([
    cacheGet<{ side: string }[]>(`aircraft:${conflict.slug}`),
    cacheGet<{ side: string }[]>(`vessels:${conflict.slug}`),
  ])
  const ac = aircraft ?? []
  const vs = vessels  ?? []
  return {
    slug:                    conflict.slug,
    theater:                 conflict.shortName,
    level:                   conflict.intensity === 'critical' ? 'critical'
                           : conflict.intensity === 'high'     ? 'high'
                           : conflict.intensity === 'elevated' ? 'elevated'
                           : 'normal',
    us_aircraft_count:       ac.filter(a => a.side === 'US').length,
    ir_aircraft_count:       ac.filter(a => a.side === 'IR').length,
    us_vessels:              vs.filter(v => v.side === 'US').length,
    ir_vessels:              vs.filter(v => v.side === 'IR').length,
    active_incidents_24h:    0,
    strike_package_detected: false,
    last_updated:            Date.now(),
  }
})

// ── Start ───────────────────────────────────────────────────────────────────

// Init SQLite (non-fatal — logs warn if fails)
try {
  getDb()
  console.log('[db] SQLite initialized')
} catch (e) {
  console.warn('[db] SQLite init failed (non-fatal):', (e as Error).message)
}

// Start background workers
startWorkers()

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })
console.log(`SENTINEL API — Phase 3 — http://localhost:${port}`)
console.log(`Conflicts: ${ALL_CONFLICTS.map(c => c.slug).join(', ')}`)
