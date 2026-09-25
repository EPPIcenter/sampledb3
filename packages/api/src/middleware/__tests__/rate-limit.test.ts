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
    delete process.env.TRUST_PROXY
  })

  function limitedApp(max: number) {
    const app = new Hono()
    app.use('*', rateLimit(max, 60_000))
    app.get('/ok', (c) => c.json({ ok: true }))
    return app
  }

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

  it('with TRUST_PROXY, keys on the last forwarded hop so a spoofed first hop does not bypass', async () => {
    process.env.TRUST_PROXY = 'true'
    const app = limitedApp(2)
    const hit = (spoofed: string) =>
      app.request('/ok', { headers: { 'x-forwarded-for': `${spoofed}, 203.0.113.7` } })

    await hit('1.1.1.1')
    await hit('2.2.2.2')
    expect((await hit('3.3.3.3')).status).toBe(429)
    expect((await app.request('/ok', { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(200)
  })

  it('without TRUST_PROXY, ignores forwarded headers', async () => {
    const app = limitedApp(2)
    await app.request('/ok', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    await app.request('/ok', { headers: { 'x-forwarded-for': '2.2.2.2' } })
    expect((await app.request('/ok', { headers: { 'x-forwarded-for': '3.3.3.3' } })).status).toBe(429)
  })

  it('keeps a separate count per limiter', async () => {
    process.env.TRUST_PROXY = 'true'
    const busy = limitedApp(2)
    const login = limitedApp(2)
    const opts = { headers: { 'x-forwarded-for': '203.0.113.9' } }

    await busy.request('/ok', opts)
    await busy.request('/ok', opts)
    expect((await busy.request('/ok', opts)).status).toBe(429)
    expect((await login.request('/ok', opts)).status).toBe(200)
  })
})
