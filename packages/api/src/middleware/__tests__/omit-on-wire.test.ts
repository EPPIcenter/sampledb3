import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { keepNullsOnWire, omitOnWireMiddleware } from '../omit-on-wire'

function createApp(): Hono {
  const app = new Hono()
  app.use('*', omitOnWireMiddleware)
  app.get('/omits', (c) => c.json({ rows: [{ id: 1, position: null }] }))
  app.get('/keeps', (c) => {
    keepNullsOnWire(c)
    return c.json({ rows: [{ id: 1, position: null }] })
  })
  return app
}

describe('omitOnWireMiddleware', () => {
  it('omits null values from a JSON response', async () => {
    const res = await createApp().request('/omits')
    expect(await res.json()).toEqual({ rows: [{ id: 1 }] })
  })

  it('sends null values when the handler calls keepNullsOnWire', async () => {
    const res = await createApp().request('/keeps')
    expect(await res.json()).toEqual({ rows: [{ id: 1, position: null }] })
  })
})
