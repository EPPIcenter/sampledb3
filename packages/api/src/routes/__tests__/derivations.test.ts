import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createDerivationsRoutes } from '../derivations'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import {
  setupPasswordRequirements,
  setupSessionSettings,
  createTestUser,
} from '../../__tests__/helpers/auth-helpers'

const BASE = '/api/derivations'

describe('Derivations API', () => {
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
    app.route('/api/derivations', createDerivationsRoutes(testDb))

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
    app.route('/api/derivations', createDerivationsRoutes(testDb))
    return app
  }

  describe('GET /api/containers/:id/derivations', () => {
    it('returns 200 and empty list for non-existent container', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/99999/derivations`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { derivations: unknown[]; count: number }
      expect(data).toHaveProperty('derivations')
      expect(data).toHaveProperty('count')
      expect(Array.isArray(data.derivations)).toBe(true)
      expect(data.count).toBe(0)
    })

    it('returns 400 for invalid container ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/notanid/derivations`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/1/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/containers/:id/derive', () => {
    it('returns 400 for invalid container ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/notanid/derive`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          derivationType: 'Test',
          specimenTypeName: 'Blood',
          containerType: 'micronix_tube',
        },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid payload (missing required fields)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/1/derive`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          derivationType: 'Test',
          // missing specimenTypeName, containerType
        },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string; details?: unknown }
      expect(data.error).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/1/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          specimenTypeName: 'Blood',
          containerType: 'micronix_tube',
        },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/containers/:id/source', () => {
    it('returns 400 for invalid container ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/notanid/source`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/containers/1/source`, {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })
})
