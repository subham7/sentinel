import type { FastifyInstance } from 'fastify'
import { getConflict } from '@sentinel/shared'
import type { EntityGraph } from '@sentinel/shared'
import { cacheGet, cacheSet } from '../services/cache.js'
import { getDb } from '../db/index.js'

function buildEntityGraph(slug: string, days: number): EntityGraph {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  const rows = getDb().prepare(`
    SELECT actors, category FROM incidents
    WHERE conflict_slugs LIKE ? AND timestamp > ?
      AND actors IS NOT NULL AND actors != '[]'
    ORDER BY timestamp DESC LIMIT 500
  `).all(`%"${slug}"%`, cutoff) as { actors: string; category: string }[]

  const nodeFreq = new Map<string, number>()
  const edgeMap  = new Map<string, { weight: number; category: string }>()

  for (const row of rows) {
    let actors: string[]
    try { actors = JSON.parse(row.actors) as string[] } catch { continue }
    actors = actors.filter(a => typeof a === 'string' && a.length > 2 && a.length < 60)

    for (const actor of actors) {
      nodeFreq.set(actor, (nodeFreq.get(actor) ?? 0) + 1)
    }

    // Co-occurrence edges
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const pair = [actors[i]!, actors[j]!].sort()
        const key  = `${pair[0]}|||${pair[1]}`
        const edge = edgeMap.get(key) ?? { weight: 0, category: row.category }
        edgeMap.set(key, { weight: edge.weight + 1, category: row.category })
      }
    }
  }

  // Top 30 nodes by frequency
  const topNodes = [...nodeFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)

  const nodeSet = new Set(topNodes.map(([n]) => n))

  const nodes = topNodes.map(([id, frequency]) => ({ id, label: id, frequency }))

  const edges = [...edgeMap.entries()]
    .filter(([key]) => {
      const parts = key.split('|||')
      return nodeSet.has(parts[0] ?? '') && nodeSet.has(parts[1] ?? '')
    })
    .map(([key, { weight, category }]) => {
      const parts = key.split('|||')
      return { source: parts[0] ?? '', target: parts[1] ?? '', weight, category }
    })
    .filter(e => e.weight >= 2 && e.source && e.target)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 60)

  return { nodes, edges, generated_at: Date.now() }
}

export async function registerEntityGraphRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/api/conflicts/:slug/entity-graph', async (req, reply) => {
    const conflict = getConflict(req.params.slug)
    if (!conflict) return reply.status(404).send({ error: 'Not found' })

    const cacheKey = `entity-graph:${conflict.slug}`
    const cached   = await cacheGet<EntityGraph>(cacheKey)
    if (cached) return cached

    try {
      const graph = buildEntityGraph(conflict.slug, 30)
      if (graph.nodes.length === 0) {
        return reply.status(202).send({ pending: true, message: 'Insufficient data for entity graph' })
      }
      await cacheSet(cacheKey, graph, 3600)
      return graph
    } catch {
      return reply.status(202).send({ pending: true, message: 'Entity graph unavailable' })
    }
  })
}
