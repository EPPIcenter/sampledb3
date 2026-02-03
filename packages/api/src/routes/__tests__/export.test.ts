import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createExportRoutes } from '../export'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Export API', () => {
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
    app.route('/api/export', createExportRoutes(testDb))

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
    app.route('/api/export', createExportRoutes(testDb))
    return app
  }

  describe('GET /api/export/specimens.csv', () => {
    it('returns 200 with auth and CSV content type', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/specimens.csv', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const contentType = res.headers.get('Content-Type') ?? ''
      expect(contentType.toLowerCase()).toMatch(/text\/csv|text\/plain/)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/specimens.csv', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
