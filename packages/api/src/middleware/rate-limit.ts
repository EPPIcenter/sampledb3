import { Context, Next } from 'hono'
import { getConnInfo } from 'hono/bun'

interface RateLimitRecord {
  count: number
  resetAt: number
}

// In-memory stores for rate limiting, one per limiter so a burst on one route
// (search, export) never counts against another (login).
// In production, consider using Redis for distributed systems
const rateLimitStores = new Set<Map<string, RateLimitRecord>>()

/**
 * Clear the rate limit stores. Exported for test isolation (watch mode, repeated runs).
 */
export function clearRateLimitStoreForTesting(): void {
  for (const store of rateLimitStores) store.clear()
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const store of rateLimitStores) {
    for (const [key, record] of store.entries()) {
      if (record.resetAt < now) {
        store.delete(key)
      }
    }
  }
}, 5 * 60 * 1000)

/**
 * Client address used as the rate limit key.
 *
 * With TRUST_PROXY on (SampleDB behind one reverse proxy such as Caddy or nginx), use the
 * last X-Forwarded-For hop: the address the proxy itself saw. Earlier hops are client
 * supplied and can be spoofed. Otherwise use the socket address and ignore forwarded headers.
 */
export function rateLimitClientKey(c: Context): string {
  if (isTrustProxyEnabled()) {
    const hops = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
    const lastHop = hops[hops.length - 1]
    if (lastHop) return lastHop
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function isTrustProxyEnabled(): boolean {
  const value = process.env.TRUST_PROXY?.trim().toLowerCase()
  return value === 'true' || value === '1'
}

/**
 * Rate limiting middleware
 * @param maxRequests Maximum number of requests allowed in the time window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  const rateLimitStore = new Map<string, RateLimitRecord>()
  rateLimitStores.add(rateLimitStore)

  return async (c: Context, next: Next) => {
    // Skip rate limiting in test environment to avoid flaky tests
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      return next()
    }

    const ip = rateLimitClientKey(c)
    
    const now = Date.now()
    const record = rateLimitStore.get(ip)
    
    if (record && record.resetAt > now) {
      // Within the time window
      if (record.count >= maxRequests) {
        return c.json({ 
          error: 'Too many requests',
          errorCode: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((record.resetAt - now) / 1000)
        }, 429)
      }
      record.count++
    } else {
      // New window or expired window
      rateLimitStore.set(ip, { 
        count: 1, 
        resetAt: now + windowMs 
      })
    }
    
    await next()
  }
}
