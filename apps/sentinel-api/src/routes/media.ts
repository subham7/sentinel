import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import { getRecentMedia, getMediaCount } from '../db/queries.js'

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/conflicts/:slug/media?page=1&limit=24&type=all|photo|video
  app.get<{
    Params: { slug: string }
    Querystring: { page?: string; limit?: string; type?: string }
  }>('/api/conflicts/:slug/media', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10))
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit ?? '24', 10)))
    const offset = (page - 1) * limit

    try {
      const items = getRecentMedia(conflict.slug, limit, offset)
      const total = getMediaCount(conflict.slug)
      return {
        items,
        total,
        page,
        limit,
        hasMore: offset + items.length < total,
      }
    } catch {
      // Table may not exist yet (first boot before schema run)
      return { items: [], total: 0, page, limit, hasMore: false }
    }
  })
}
