import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { MorningBrief } from '@sentinel/shared'
import { cacheGet, cacheSet, writeFreshness } from '../services/cache.js'
import { generateBrief } from '../workers/morning-brief.worker.js'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

// Prevent concurrent on-demand generations for the same slug
const generating = new Set<string>()

function triggerGeneration(slug: string): void {
  if (generating.has(slug)) return
  generating.add(slug)
  generateBrief(slug)
    .then(async brief => {
      if (brief) {
        const cacheKey = `morning-brief:${slug}:${todayUTC()}`
        await cacheSet(cacheKey, brief, 86400)
        await writeFreshness(`morning-brief:${slug}`, 'ok')
        console.log(`[brief] on-demand generation complete for ${slug}`)
      }
    })
    .catch(e => console.warn(`[brief] on-demand generation failed for ${slug}:`, (e as Error).message))
    .finally(() => generating.delete(slug))
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
    if (stale) {
      // Kick off a background refresh but serve stale immediately
      triggerGeneration(conflict.slug)
      return { ...stale, isStale: true }
    }

    // Nothing cached at all — trigger generation and tell client to retry
    triggerGeneration(conflict.slug)
    return reply.status(202).send({ pending: true, message: 'Generating morning brief — retry in 30s' })
  })
}
