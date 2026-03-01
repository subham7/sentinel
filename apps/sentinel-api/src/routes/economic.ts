// Economic data routes — oil prices + Rial exchange rate
// GET /api/economic/oil  → OilPriceData  (fresh 1h, stale 24h)
// GET /api/economic/rial → RialRateData  (fresh 30m, stale 24h)

import type { FastifyInstance } from 'fastify'
import type { OilPriceData, RialRateData } from '@sentinel/shared'
import { cacheGet } from '../services/cache.js'

export async function registerEconomicRoutes(app: FastifyInstance): Promise<void> {

  app.get('/api/economic/oil', async (_req, reply) => {
    const fresh = await cacheGet<OilPriceData>('economic:oil')
    if (fresh) return fresh

    const stale = await cacheGet<OilPriceData>('economic:oil:stale')
    if (stale) return stale

    return reply.status(202).send({ pending: true, message: 'Oil data not yet fetched — EIA_API_KEY may be absent' })
  })

  app.get('/api/economic/rial', async (_req, reply) => {
    const fresh = await cacheGet<RialRateData>('economic:rial')
    if (fresh) return fresh

    const stale = await cacheGet<RialRateData>('economic:rial:stale')
    if (stale) return stale

    return reply.status(202).send({ pending: true, message: 'Rial data not yet fetched' })
  })
}
