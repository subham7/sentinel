import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
})

await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

app.get('/health', async () => ({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}))

app.get('/api/conflicts', async () => {
  // Phase 0: return empty array — conflicts route will be wired in Phase 0 tasks
  return { conflicts: [] }
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })
console.log(`SENTINEL API running on http://localhost:${port}`)
