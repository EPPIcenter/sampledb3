import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * SPA fallback test: ensures non-API routes serve index.html so client-side
 * routing (React Router) can handle paths on reload.
 */
describe('SPA fallback', () => {
  const fixturePath = join(__dirname, 'fixtures/spa-fallback')

  it('returns index.html for SPA subroutes so client can handle routing', async () => {
    const app = new Hono()
    app.use('*', serveStatic({
      root: fixturePath,
      rewriteRequestPath: (p) => (p.startsWith('/') ? p.slice(1) : p),
      onNotFound: () => {},
    }))
    app.get('*', async (c) => {
      const html = await readFile(join(fixturePath, 'index.html'), 'utf-8')
      return c.html(html)
    })

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
    app.get('*', async (c) => {
      const html = await readFile(join(fixturePath, 'index.html'), 'utf-8')
      return c.html(html)
    })

    const res = await app.request('/EPPIcenter_trnsprntbkg_notext.png')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBeGreaterThan(0)
  })
})
