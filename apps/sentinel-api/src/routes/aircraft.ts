import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { Aircraft } from '@sentinel/shared'
import { cacheGet } from '../services/cache.js'

type SlugParams = { Params: { slug: string } }

async function getAircraftForConflict(slug: string): Promise<Aircraft[]> {
  const fresh = await cacheGet<Aircraft[]>(`aircraft:${slug}`)
  if (fresh !== null) return fresh
  // Fall back to stale cache rather than returning empty
  const stale = await cacheGet<Aircraft[]>(`aircraft:${slug}:stale`)
  return stale ?? []
}

export async function registerAircraftRoutes(app: FastifyInstance): Promise<void> {
  // ── REST endpoint ────────────────────────────────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/aircraft', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const aircraft = await getAircraftForConflict(req.params.slug)
    return {
      aircraft,
      count:        aircraft.length,
      cache_status: 'LIVE',
    }
  })

  // ── WebSocket endpoint ────────────────────────────────────────────────────────

  app.get<SlugParams>('/ws/conflicts/:slug/aircraft', { websocket: true }, (socket, req) => {
    const { slug } = req.params as { slug: string }

    if (!getConflict(slug)) {
      socket.close(4004, 'Conflict not found')
      return
    }

    let closed = false

    async function push(): Promise<void> {
      if (closed || socket.readyState !== socket.OPEN) return
      try {
        const aircraft = await getAircraftForConflict(slug)
        socket.send(JSON.stringify({ aircraft, count: aircraft.length, ts: Date.now() }))
      } catch (e) {
        console.warn('[ws/aircraft] push error:', (e as Error).message)
      }
    }

    // Push immediately on connect, then every 5s
    void push()
    const interval = setInterval(() => void push(), 5000)

    socket.on('close', () => {
      closed = true
      clearInterval(interval)
    })

    socket.on('error', (err: Error) => {
      console.warn('[ws/aircraft] socket error:', err.message)
    })
  })
}
