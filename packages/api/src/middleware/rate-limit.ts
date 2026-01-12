import { Context, Next } from 'hono'

interface RateLimitRecord {
  count: number
  resetAt: number
}

// In-memory store for rate limiting
// In production, consider using Redis for distributed systems
const rateLimitStore = new Map<string, RateLimitRecord>()

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
    // Get client identifier (IP address)
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
               c.req.header('x-real-ip') || 
               'unknown'
    
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
