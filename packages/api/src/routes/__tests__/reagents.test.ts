import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createReagentsRoutes } from '../reagents'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Reagents API', () => {
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
    app.route('/api/reagents', createReagentsRoutes(testDb))

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
    app.route('/api/reagents', createReagentsRoutes(testDb))
    return app
  }

  describe('GET /api/reagents', () => {
    it('returns 200 and reagents array', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/reagents', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { reagents: unknown[] }
      expect(data).toHaveProperty('reagents')
      expect(Array.isArray(data.reagents)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/reagents', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/reagents/:id', () => {
    it('returns 200 and reagent when found', async () => {
      const app = createApp()
      const createRes = await authenticatedRequest(app, '/api/reagents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Test Reagent', reagentType: 'antibody' },
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { reagent: { id: number } }
      const id = created.reagent.id

      const res = await authenticatedRequest(app, `/api/reagents/${id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { reagent: { id: number; name: string } }
      expect(data.reagent.id).toBe(id)
      expect(data.reagent.name).toBe('Test Reagent')
    })

    it('returns 404 for non-existent ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/reagents/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/reagents', () => {
    it('returns 201 and created reagent', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/reagents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'New Reagent', reagentType: 'primer' },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { reagent: { name: string; reagentType: string } }
      expect(data.reagent.name).toBe('New Reagent')
    })
  })

  describe('PATCH /api/reagents/:id', () => {
    it('returns 200 and updated reagent', async () => {
      const app = createApp()
      const createRes = await authenticatedRequest(app, '/api/reagents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'To Update', reagentType: 'buffer' },
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { reagent: { id: number } }
      const id = created.reagent.id

      const res = await authenticatedRequest(app, `/api/reagents/${id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { name: 'Updated Name' },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { reagent: { name: string } }
      expect(data.reagent.name).toBe('Updated Name')
    })
  })
})
