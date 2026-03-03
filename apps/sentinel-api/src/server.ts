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
import { cacheGet, readFreshness } from './services/cache.js'
import { registerAircraftRoutes }    from './routes/aircraft.js'
import { registerVesselRoutes }      from './routes/vessels.js'
import { registerIncidentRoutes }    from './routes/incidents.js'
import { registerNuclearRoutes }     from './routes/nuclear.js'
import { registerSitrepRoutes }      from './routes/sitrep.js'
import { registerAnalystChatRoutes } from './routes/analyst-chat.js'
import { registerEconomicRoutes }    from './routes/economic.js'
import { registerMediaRoutes }       from './routes/media.js'
import { registerMorningBriefRoutes } from './routes/morning-brief.js'
import { registerRhetoricRoutes }     from './routes/rhetoric.js'
import { registerEntityGraphRoutes }  from './routes/entity-graph.js'
import { registerFinancialRoutes }    from './routes/financial.js'
import { registerMarketsRoutes }      from './routes/markets.js'
import { getRecentIncidents }        from './db/queries.js'
import { startWorkers } from './workers/index.js'

const app = Fastify({ logger: { level: 'warn' } })

await app.register(cors, {
  // Allow explicit list from env, or all origins for public deployment
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : true,
  methods: ['GET', 'POST', 'OPTIONS'],
})
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
await app.register(websocket)

// ── Health ──────────────────────────────────────────────────────────────────

app.get('/health', async () => ({
  status:    'ok',
  phase:     6,
  uptime:    process.uptime(),
  timestamp: new Date().toISOString(),
}))

// ── Health / freshness ──────────────────────────────────────────────────────

app.get('/api/health/freshness', async () => {
  const sourceIds = ['adsb', 'ais', 'gdelt', 'acled', 'telegram', 'iaea']
  const entries = await Promise.all(
    sourceIds.map(async id => {
      const data = await readFreshness(id)
      return { id, updatedAt: data?.updatedAt ?? null, result: data?.result ?? null, error: data?.error ?? null }
    }),
  )
  return { sources: entries, timestamp: Date.now() }
})

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

// ── Global stats ─────────────────────────────────────────────────────────────

app.get('/api/stats/global', async () => {
  const [allAircraft, allVessels] = await Promise.all([
    Promise.all(ALL_CONFLICTS.map(c => cacheGet<unknown[]>(`aircraft:${c.slug}`))),
    Promise.all(ALL_CONFLICTS.map(c => cacheGet<unknown[]>(`vessels:${c.slug}`))),
  ])
  const liveTracks =
    allAircraft.reduce((s, a) => s + (a?.length ?? 0), 0) +
    allVessels.reduce((s, v) => s + (v?.length ?? 0), 0)

  let vesselsDark = 0
  try {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM ais_dark_events WHERE gap_ended_at IS NULL')
      .get() as { n: number } | undefined
    vesselsDark = row?.n ?? 0
  } catch { /* DB not ready */ }

  const incidents24h = ALL_CONFLICTS.reduce(
    (s, c) => s + getRecentIncidents(c.slug, 24, 1000).length,
    0,
  )

  return {
    activeTheaters: ALL_CONFLICTS.filter(c => c.status === 'active').length,
    incidents24h,
    liveTracks,
    vesselsDark,
    timestamp: Date.now(),
  }
})

// ── Aircraft routes (REST + WS) ─────────────────────────────────────────────

await registerAircraftRoutes(app)

// ── Vessel routes (REST + WS) ────────────────────────────────────────────────

await registerVesselRoutes(app)

// ── Incident routes (REST + SSE) ─────────────────────────────────────────────

await registerIncidentRoutes(app)
await registerNuclearRoutes(app)
await registerSitrepRoutes(app)
await registerAnalystChatRoutes(app)
await registerEconomicRoutes(app)
await registerMediaRoutes(app)
await registerMorningBriefRoutes(app)
await registerRhetoricRoutes(app)
await registerEntityGraphRoutes(app)
await registerFinancialRoutes(app)
await registerMarketsRoutes(app)

app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/counters', async (req, reply) => {
  const conflict = getConflict(req.params.slug)
  if (!conflict) return reply.status(404).send({ error: 'Not found' })

  const [aircraft, vessels] = await Promise.all([
    cacheGet<unknown[]>(`aircraft:${conflict.slug}`),
    cacheGet<unknown[]>(`vessels:${conflict.slug}`),
  ])

  const incidents30d = getRecentIncidents(conflict.slug, 720, 10_000).length
  const acList = (aircraft ?? []) as { side: string }[]
  const vsAll  = (vessels  ?? []) as { ais_dark?: boolean }[]

  let darkVessels = 0
  try {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM ais_dark_events WHERE gap_ended_at IS NULL AND conflict_slug = ?')
      .get(conflict.slug) as { n: number } | undefined
    darkVessels = row?.n ?? 0
  } catch { /* DB not ready */ }

  return {
    aircraft_tracked: acList.length,
    vessels_tracked:  vsAll.length,
    dark_vessels:     darkVessels,
    incidents_30d:    incidents30d,
    timestamp:        Date.now(),
  }
})

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
console.log(`SENTINEL API — Phase 8C — http://localhost:${port}`)
console.log(`Conflicts: ${ALL_CONFLICTS.map(c => c.slug).join(', ')}`)
