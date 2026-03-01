import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { SitrepReport } from '@sentinel/shared'
import { cacheGet } from '../services/cache.js'

export async function registerSitrepRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/sitrep', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const fresh = await cacheGet<SitrepReport>(`sitrep:${conflict.slug}`)
    if (fresh) return fresh

    const stale = await cacheGet<SitrepReport>(`sitrep:${conflict.slug}:stale`)
    if (stale) return stale

    // No sitrep yet — 202 Accepted (worker hasn't generated one)
    return reply.status(202).send({ pending: true, message: 'Sitrep not yet generated' })
  })
}
