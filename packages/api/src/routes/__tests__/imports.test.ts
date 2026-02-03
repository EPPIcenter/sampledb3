import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createImportsRoutes } from '../imports'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Imports API', () => {
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
    app.route('/api/imports', createImportsRoutes(testDb))

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
    app.route('/api/imports', createImportsRoutes(testDb))
    return app
  }

  describe('POST /api/imports/derivations-csv', () => {
    it('returns 400 with invalid body (empty csv)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv', {
        method: 'POST',
        cookie: cookieHeader,
        json: { csv: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv', {
        method: 'POST',
        json: { csv: 'parent_container_id,container_type\n1,micronix_tube' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/imports/derivations-csv/validate', () => {
    it('returns 400 with invalid body (empty csv)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: { csv: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv/validate', {
        method: 'POST',
        json: { csv: 'header' },
      })
      expect(res.status).toBe(401)
    })
  })
})
