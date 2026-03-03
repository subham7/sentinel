// Three-tier cache: Upstash Redis (fresh) → stale key → in-memory Map
// Falls back silently to the in-memory Map when Upstash env vars are absent.

interface MemEntry<T> {
  data:    T
  expires: number
}

const mem = new Map<string, MemEntry<unknown>>()

// Lazy-loaded Redis client
type RedisClient = {
  get: <T>(key: string) => Promise<T | null>
  set: (key: string, value: unknown, opts?: { ex: number }) => Promise<void>
}
let redisClient: RedisClient | null | undefined = undefined   // undefined = not yet resolved

async function getRedis(): Promise<RedisClient | null> {
  if (redisClient !== undefined) return redisClient

  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.log('[cache] No Upstash credentials — using in-memory cache')
    redisClient = null
    return null
  }

  try {
    const { Redis } = await import('@upstash/redis')
    redisClient = new Redis({ url, token }) as unknown as RedisClient
    console.log('[cache] Upstash Redis connected')
  } catch (e) {
    console.warn('[cache] Failed to init Upstash Redis, falling back to memory:', (e as Error).message)
    redisClient = null
  }
  return redisClient
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = await getRedis()
  if (r) {
    try {
      return await r.get<T>(key)
    } catch {
      // Redis error — fall through to memory
    }
  }
  const e = mem.get(key) as MemEntry<T> | undefined
  if (!e) return null
  if (Date.now() > e.expires) {
    mem.delete(key)
    return null
  }
  return e.data
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const r = await getRedis()
  if (r) {
    try {
      await r.set(key, value, { ex: ttlSeconds })
      return
    } catch {
      // Fall through to memory
    }
  }
  mem.set(key, { data: value, expires: Date.now() + ttlSeconds * 1000 })
}

// ── Data freshness ────────────────────────────────────────────────────────────
// Each worker calls writeFreshness('adsb', 'ok') or ('adsb', 'error', msg)
// after each poll cycle. The /api/health/freshness endpoint reads these.

export async function writeFreshness(
  sourceId: string,
  result:   'ok' | 'error',
  error?:   string,
): Promise<void> {
  const value = {
    updatedAt: new Date().toISOString(),
    result,
    ...(error ? { error } : {}),
  }
  await cacheSet(`freshness:${sourceId}`, value, 7 * 86400)
}

export async function readFreshness(
  sourceId: string,
): Promise<{ updatedAt: string; result: 'ok' | 'error'; error?: string } | null> {
  return cacheGet<{ updatedAt: string; result: 'ok' | 'error'; error?: string }>(`freshness:${sourceId}`)
}

// Stampede-safe fetch: prevents multiple concurrent fetches for the same key
const inflight = new Map<string, Promise<unknown>>()

export async function cachedFetch<T>(
  key:        string,
  fetcher:    () => Promise<T>,
  ttlSeconds: number,
  staleKey?:  string,
): Promise<{ data: T; cacheStatus: 'HIT' | 'MISS' | 'STALE' | 'DEDUP' }> {
  const cached = await cacheGet<T>(key)
  if (cached !== null) return { data: cached, cacheStatus: 'HIT' }

  if (inflight.has(key)) {
    const data = (await inflight.get(key)) as T
    return { data, cacheStatus: 'DEDUP' }
  }

  const promise = fetcher().catch(async (err) => {
    if (staleKey) {
      const stale = await cacheGet<T>(staleKey)
      if (stale !== null) return stale
    }
    throw err
  })

  inflight.set(key, promise as Promise<unknown>)
  try {
    const data = await promise
    await cacheSet(key, data, ttlSeconds)
    if (staleKey) await cacheSet(staleKey, data, 86400)
    return { data, cacheStatus: 'MISS' }
  } finally {
    inflight.delete(key)
  }
}
