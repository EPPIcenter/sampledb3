import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { serveStatic } from 'hono/bun'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { shouldServeSpaFallback } from '../lib/spa-fallback-path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * SPA fallback test: ensures non-API routes serve index.html so client-side
 * routing (React Router) can handle paths on reload.
 */
describe('shouldServeSpaFallback', () => {
  it('treats /assets/* as non-SPA even without extension', () => {
    expect(shouldServeSpaFallback('/assets/index-CtaMHCaJ.css')).toBe(false)
    expect(shouldServeSpaFallback('/assets/chunk-abc')).toBe(false)
  })

  it('treats client routes as SPA', () => {
    expect(shouldServeSpaFallback('/locations/123')).toBe(true)
    expect(shouldServeSpaFallback('/')).toBe(true)
  })
})

describe('SPA fallback', () => {
  const fixturePath = join(__dirname, 'fixtures/spa-fallback')

  async function spaFallbackHandler(c: Context) {
    const pathOnly = new URL(c.req.url).pathname
    if (!shouldServeSpaFallback(pathOnly)) {
      return c.text('Not Found', 404)
    }
    const html = await readFile(join(fixturePath, 'index.html'), 'utf-8')
    return c.html(html)
  }

  it('returns index.html for SPA subroutes so client can handle routing', async () => {
    const app = new Hono()
    app.use('*', serveStatic({
      root: fixturePath,
      rewriteRequestPath: (p) => (p.startsWith('/') ? p.slice(1) : p),
      onNotFound: () => {},
    }))
    app.get('*', spaFallbackHandler)

    const res = await app.request('/locations/123')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('id="root"')
  })

  it('serves any static asset from dist with correct content-type', async () => {
    const app = new Hono()
    app.use('*', serveStatic({
      root: fixturePath,
      rewriteRequestPath: (p) => (p.startsWith('/') ? p.slice(1) : p),
      onNotFound: () => {},
    }))
    app.get('*', spaFallbackHandler)

    const res = await app.request('/EPPIcenter_trnsprntbkg_notext.png')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBeGreaterThan(0)
  })

  it('returns 404 for missing /assets paths instead of HTML (avoids stylesheet MIME errors)', async () => {
    const app = new Hono()
    app.use('*', serveStatic({
      root: fixturePath,
      rewriteRequestPath: (p) => (p.startsWith('/') ? p.slice(1) : p),
      onNotFound: () => {},
    }))
    app.get('*', spaFallbackHandler)

    const res = await app.request('/assets/index-CtaMHCaJ.css')

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toBe('Not Found')
    expect(body).not.toContain('id="root"')
  })
})
