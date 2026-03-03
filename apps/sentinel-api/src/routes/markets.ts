// Prediction markets routes
// GET /api/conflicts/:slug/markets  — relevant Polymarket + Kalshi contracts
//
// Data is written by markets.worker.ts every 15 minutes.
// Falls back to stale cache if worker hasn't run yet.

import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { MarketsData } from '@sentinel/shared'
import { cacheGet } from '../services/cache.js'

export async function registerMarketsRoutes(app: FastifyInstance): Promise<void> {

  app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/markets', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Conflict not found' })

    const fresh = await cacheGet<MarketsData>(`markets:${conflict.slug}`)
    if (fresh) return { ...fresh, cache: 'HIT' }

    const stale = await cacheGet<MarketsData>(`markets:${conflict.slug}:stale`)
    if (stale) return { ...stale, cache: 'STALE' }

    // Worker hasn't run yet — return empty list rather than an error
    return reply.status(202).send({
      pending:    true,
      markets:    [],
      updated_at: Date.now(),
      message:    'Markets data not yet fetched',
    })
  })
}
