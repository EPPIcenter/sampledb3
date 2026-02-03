import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createStatisticsRoutes } from '../statistics'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Statistics API', () => {
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
    app.route('/api/statistics', createStatisticsRoutes(testDb, sqlite as SQLiteDatabase))

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
    app.route('/api/statistics', createStatisticsRoutes(testDb, sqlite as SQLiteDatabase))
    return app
  }

  describe('GET /api/statistics', () => {
    it('returns 200 and expected shape with auth', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/statistics', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as Record<string, unknown>
      expect(data).toBeDefined()
      expect(typeof data).toBe('object')
    })

    it('returns 401 without auth', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/statistics', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
