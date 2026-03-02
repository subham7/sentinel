import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { MorningBrief } from '@sentinel/shared'
import { cacheGet } from '../services/cache.js'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function registerMorningBriefRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/morning-brief', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const date     = todayUTC()
    const cacheKey = `morning-brief:${conflict.slug}:${date}`

    const fresh = await cacheGet<MorningBrief>(cacheKey)
    if (fresh) return fresh

    const stale = await cacheGet<MorningBrief>(`${cacheKey}:stale`)
    if (stale) return { ...stale, isStale: true }

    return reply.status(202).send({ pending: true, message: 'Morning brief not yet generated' })
  })
}
