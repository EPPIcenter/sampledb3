import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from '../rate-limit'

describe('rate-limit middleware', () => {
  beforeEach(() => {
    // Rate limit uses module-level Map; we need fresh middleware per test
    // so use a small window and different IPs or accept that limits are per-process
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
