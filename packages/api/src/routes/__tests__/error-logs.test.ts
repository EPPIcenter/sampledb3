import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createErrorLogsRoutes } from '../error-logs'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Error Logs API', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let adminCookieHeader: string
  let memberCookieHeader: string
  let viewerCookieHeader: string

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
    await createTestUser(testDb, {
      email: 'member@test.com',
      name: 'Member',
      password: 'password123',
      role: 'member',
    })
    await createTestUser(testDb, {
      email: 'viewer@test.com',
      name: 'Viewer',
      password: 'password123',
      role: 'viewer',
    })

    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/error-logs', createErrorLogsRoutes(testDb))

    adminCookieHeader = await loginAndGetCookie(app, 'admin@test.com', 'password123')
    memberCookieHeader = await loginAndGetCookie(app, 'member@test.com', 'password123')
    viewerCookieHeader = await loginAndGetCookie(app, 'viewer@test.com', 'password123')
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
    app.route('/api/error-logs', createErrorLogsRoutes(testDb))
    return app
  }

  describe('GET /api/error-logs', () => {
    it('returns 200 with admin', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/error-logs', {
        method: 'GET',
        cookie: adminCookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { logs: unknown[]; pagination?: unknown }
      expect(data).toHaveProperty('logs')
      expect(Array.isArray(data.logs)).toBe(true)
    })

    it('returns 403 as member', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/error-logs', {
        method: 'GET',
        cookie: memberCookieHeader,
      })
      expect(res.status).toBe(403)
    })

    it('returns 403 as viewer', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/error-logs', {
        method: 'GET',
        cookie: viewerCookieHeader,
      })
      expect(res.status).toBe(403)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/error-logs', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/error-logs', () => {
    it('accepts frontend error and inserts into database', async () => {
      const app = createApp()
      const res = await app.request('/api/error-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test frontend error',
          level: 'error',
          context: { page: 'TestPage' },
        }),
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { success?: boolean }
      expect(data.success).toBe(true)

      const listRes = await authenticatedRequest(app, '/api/error-logs', {
        method: 'GET',
        cookie: adminCookieHeader,
      })
      const listData = (await listRes.json()) as { logs: Array<{ message: string; source: string }> }
      expect(listData.logs.length).toBeGreaterThanOrEqual(1)
      const frontendLog = listData.logs.find((l) => l.source === 'frontend' && l.message.includes('Test frontend error'))
      expect(frontendLog).toBeDefined()
    })

    it('accepts error without authentication (optional auth)', async () => {
      const app = createApp()
      const res = await app.request('/api/error-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Unauthenticated user error',
          level: 'error',
        }),
      })
      expect(res.status).toBe(201)
    })
  })
})
