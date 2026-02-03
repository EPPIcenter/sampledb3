import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createSettingsRoutes } from '../settings'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Settings API', () => {
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
    app.route('/api/settings', createSettingsRoutes(testDb))

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
    app.route('/api/settings', createSettingsRoutes(testDb))
    return app
  }

  describe('GET /api/settings', () => {
    it('returns 200 and object with container_defaults, pagination_settings, etc.', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/settings', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as Record<string, unknown>
      expect(data).toHaveProperty('container_defaults')
      expect(data).toHaveProperty('pagination_settings')
      expect(data).toHaveProperty('password_requirements')
      expect(data).toHaveProperty('session_settings')
      expect(data).toHaveProperty('export_configurations')
      expect(data).toHaveProperty('scanner_configurations')
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/settings', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/settings/units', () => {
    it('returns 200 and units array', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/settings/units', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as unknown[]
      expect(Array.isArray(data)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/settings/units', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
