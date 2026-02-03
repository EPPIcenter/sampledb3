import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createContainersRoutes } from '../containers'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Containers API', () => {
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
    app.route('/api/containers', createContainersRoutes(testDb))

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
    app.route('/api/containers', createContainersRoutes(testDb))
    return app
  }

  describe('GET /api/containers', () => {
    it('returns 200 and containers with pagination when authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { containers: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('containers')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.containers)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/containers/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
