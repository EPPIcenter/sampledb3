import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { getResponseData, loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createUnitsRoutes } from '../units'
import { handleRouteError } from '../../lib/error-handler'
import { createTestUnit } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Units API', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let cookieHeader: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    await createTestUser(testDb, {
      email: 'admin@test.com',
      name: 'Admin',
      password: 'password123',
      role: 'admin',
    })

    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/units', createUnitsRoutes(testDb))

    cookieHeader = await loginAndGetCookie(app, 'admin@test.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  function createApp(): Hono {
    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/units', createUnitsRoutes(testDb))
    return app
  }

  describe('GET /api/units', () => {
    it('returns 200 and list (data array)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/units', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as unknown[]
      expect(Array.isArray(data)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/units', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/units/:id', () => {
    it('returns 200 and unit when found', async () => {
      const unitRecord = await createTestUnit(testDb, {
        symbol: 'uL',
        name: 'microliter',
        category: 'volume',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `/api/units/${unitRecord.id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as { id: number; symbol: string }
      expect(data.id).toBe(unitRecord.id)
      expect(data.symbol).toBe('uL')
    })

    it('returns 404 for non-existent ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/units/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/units', () => {
    it('returns 201 and created unit', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/units', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          symbol: 'mL',
          name: 'milliliter',
          category: 'volume',
        },
      })
      expect(res.status).toBe(201)
      const data = await getResponseData(res) as { symbol: string; name: string }
      expect(data.symbol).toBe('mL')
      expect(data.name).toBe('milliliter')
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/units', {
        method: 'POST',
        json: { symbol: 'mL', name: 'milliliter', category: 'volume' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/units/:id', () => {
    it('returns 200 and updated unit', async () => {
      const unitRecord = await createTestUnit(testDb, {
        symbol: 'g',
        name: 'gram',
        category: 'mass',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `/api/units/${unitRecord.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
        json: { name: 'grams' },
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as { name: string }
      expect(data.name).toBe('grams')
    })
  })

  describe('DELETE /api/units/:id', () => {
    it('returns 200 when unit not in use', async () => {
      const unitRecord = await createTestUnit(testDb, {
        symbol: 'del',
        name: 'to delete',
        category: 'other',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `/api/units/${unitRecord.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
    })
  })
})
