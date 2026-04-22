import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { rateLimit, clearRateLimitStoreForTesting } from '../rate-limit'

describe('rate-limit middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    // Run with rate limiting enabled (bypass test-env skip)
    process.env.NODE_ENV = 'development'
    // Clear store so prior test runs (e.g. watch mode) don't affect this run
    clearRateLimitStoreForTesting()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('allows requests under the limit', async () => {
    const app = new Hono()
    const limiter = rateLimit(10, 60_000)
    app.use('*', limiter)
    app.get('/ok', (c) => c.json({ ok: true }))

    const res = await app.request('/ok', {
      method: 'GET',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })
    expect(res.status).toBe(200)
  })

  it('returns 429 when over limit', async () => {
    const app = new Hono()
    const limiter = rateLimit(2, 60_000)
    app.use('*', limiter)
    app.get('/ok', (c) => c.json({ ok: true }))

    const opts = { method: 'GET' as const, headers: { 'x-forwarded-for': '10.0.0.99' } }
    await app.request('/ok', opts)
    await app.request('/ok', opts)
    const third = await app.request('/ok', opts)
    expect(third.status).toBe(429)
    const body = await third.json() as { error?: string; errorCode?: string; retryAfter?: number }
    expect(body.error).toBe('Too many requests')
    expect(body.errorCode).toBe('RATE_LIMIT_EXCEEDED')
    expect(typeof body.retryAfter).toBe('number')
  })
})
