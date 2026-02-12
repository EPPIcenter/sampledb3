import { Context, Next } from 'hono'

function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h = h & h
  }
  return Math.abs(h).toString(36)
}

interface RateLimitRecord {
  count: number
  resetAt: number
}

// In-memory store for rate limiting
// In production, consider using Redis for distributed systems
const rateLimitStore = new Map<string, RateLimitRecord>()

/**
 * Clear the rate limit store. Exported for test isolation (watch mode, repeated runs).
 */
export function clearRateLimitStoreForTesting(): void {
  rateLimitStore.clear()
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Rate limiting middleware
 * @param maxRequests Maximum number of requests allowed in the time window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    // Skip rate limiting in test environment to avoid flaky tests
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      return next()
    }

    // Get client identifier (IP address)
    // When behind Docker/proxy without forwarded headers, avoid collapsing all clients to "unknown"
    // by using a request fingerprint. Use only client-identifying headers (user-agent, etc.) - NOT
    // the URL path, or clients could bypass limits by distributing requests across endpoints.
    const rawIp =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      c.req.header('x-client-ip') ||
      ''
    const clientFingerprint = [
      c.req.header('user-agent') ?? '',
      c.req.header('accept-language') ?? '',
    ].join('|')
    const ip = rawIp || `fp:${simpleHash(clientFingerprint)}`
    
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
