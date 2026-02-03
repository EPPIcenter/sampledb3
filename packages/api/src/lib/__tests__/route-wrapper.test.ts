import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createRouteHandler, createJsonRouteHandler } from '../route-wrapper'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'

describe('route-wrapper', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('createRouteHandler', () => {
    it('returns result when handler succeeds', async () => {
      const handler = createRouteHandler(async (c) => {
        return c.json({ ok: true }, 200)
      })
      const app = new Hono()
      app.get('/test', handler)
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ ok: true })
    })

    it('catches error and returns error response', async () => {
      const handler = createRouteHandler(async () => {
        throw new Error('Handler failed')
      })
      const app = new Hono()
      app.use('*', (c, next) => {
        c.set('db', testDb)
        return next()
      })
      app.get('/test', handler)
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data).toHaveProperty('error')
    })
  })

  describe('createJsonRouteHandler', () => {
    it('returns JSON with data when handler returns value', async () => {
      const handler = createJsonRouteHandler(async () => ({ id: 1 }))
      const app = new Hono()
      app.use('*', (c, next) => {
        c.set('db', testDb)
        return next()
      })
      app.get('/test', handler)
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ id: 1 })
    })

    it('catches error when handler throws', async () => {
      const handler = createJsonRouteHandler(async () => {
        throw new Error('Boom')
      })
      const app = new Hono()
      app.use('*', (c, next) => {
        c.set('db', testDb)
        return next()
      })
      app.get('/test', handler)
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(500)
    })
  })
})
