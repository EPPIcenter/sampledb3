import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createSpecimensRoutes } from '../specimens'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import type { Database } from '../../db/client'

describe('Specimens API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let cookie: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    await createTestUser(testDb, {
      email: 'member@test.com',
      name: 'Member',
      password: 'password123',
      role: 'member',
    })

    app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/specimens', createSpecimensRoutes(testDb))
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  beforeEach(async () => {
    cookie = await loginAndGetCookie(app, 'member@test.com', 'password123')
  })

  describe('GET /api/specimens', () => {
    it('returns 200 and specimens array', async () => {
      const res = await authenticatedRequest(app, '/api/specimens', {
        method: 'GET',
        cookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimens?: unknown[]; data?: unknown[] }
      const list = data.specimens ?? data.data
      expect(Array.isArray(list)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/specimens', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
