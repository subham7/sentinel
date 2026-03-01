import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { Vessel } from '@sentinel/shared'
import { cacheGet } from '../services/cache.js'

type SlugParams = { Params: { slug: string } }

async function getVesselsForConflict(slug: string): Promise<Vessel[]> {
  const fresh = await cacheGet<Vessel[]>(`vessels:${slug}`)
  if (fresh !== null) return fresh
  const stale = await cacheGet<Vessel[]>(`vessels:${slug}:stale`)
  return stale ?? []
}

export async function registerVesselRoutes(app: FastifyInstance): Promise<void> {
  // ── REST endpoint ─────────────────────────────────────────────────────────

  app.get<SlugParams>('/api/conflicts/:slug/vessels', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const vessels = await getVesselsForConflict(req.params.slug)
    return {
      vessels,
      count:        vessels.length,
      dark_count:   vessels.filter(v => v.ais_dark).length,
      cache_status: 'LIVE',
    }
  })

  // ── WebSocket endpoint ────────────────────────────────────────────────────

  app.get<SlugParams>('/ws/conflicts/:slug/vessels', { websocket: true }, (socket, req) => {
    const { slug } = req.params as { slug: string }

    if (!getConflict(slug)) {
      socket.close(4004, 'Conflict not found')
      return
    }

    let closed = false

    async function push(): Promise<void> {
      if (closed || socket.readyState !== socket.OPEN) return
      try {
        const vessels = await getVesselsForConflict(slug)
        socket.send(JSON.stringify({
          vessels,
          count:      vessels.length,
          dark_count: vessels.filter(v => v.ais_dark).length,
          ts:         Date.now(),
        }))
      } catch (e) {
        console.warn('[ws/vessels] push error:', (e as Error).message)
      }
    }

    void push()
    const interval = setInterval(() => void push(), 10_000)

    socket.on('close', () => {
      closed = true
      clearInterval(interval)
    })

    socket.on('error', (err: Error) => {
      console.warn('[ws/vessels] socket error:', err.message)
    })
  })
}
