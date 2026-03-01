// GET /api/conflicts/:slug/nuclear
// Returns nuclear site statuses: static config data merged with IAEA worker overrides.
// Falls back to static config if the DB has no rows (architecture principle 3: stale > blank).

import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import { getNuclearSiteStatuses } from '../db/queries.js'

export async function registerNuclearRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/nuclear', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Unknown conflict slug' })

    const sites = conflict.overlays.nuclearSites ?? []
    if (!sites.length) return { sites: [] }

    // Get any live IAEA overrides from the DB
    const overrides = getNuclearSiteStatuses(conflict.slug)
    const overrideMap = new Map(overrides.map(o => [o.siteId, o]))

    return {
      sites: sites.map(site => {
        const ov = overrideMap.get(site.id)
        return {
          siteId:    site.id,
          name:      site.name,
          status:    ov?.status ?? site.status,
          notes:     ov?.notes ?? site.notes ?? null,
          updatedAt: ov?.updatedAt ?? null,
          source:    ov ? 'iaea' : 'config',
        }
      }),
    }
  })
}
