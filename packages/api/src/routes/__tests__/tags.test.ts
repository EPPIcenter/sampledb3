import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { getResponseData, loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createTagsRoutes } from '../tags'
import { handleRouteError } from '../../lib/error-handler'
import { createTestTag } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'

describe('Tags API', () => {
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
    app.route('/api/tags', createTagsRoutes(testDb))

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
    app.route('/api/tags', createTagsRoutes(testDb))
    return app
  }

  describe('GET /api/tags', () => {
    it('returns 200 and list (data array)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as unknown[]
      expect(Array.isArray(data)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/tags', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/tags/:id', () => {
    it('returns 200 and tag when found', async () => {
      const tagRecord = await createTestTag(testDb, { name: 'Test Tag' })
      const app = createApp()
      const res = await authenticatedRequest(app, `/api/tags/${tagRecord.id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as { id: number; name: string }
      expect(data.id).toBe(tagRecord.id)
      expect(data.name).toBe('Test Tag')
    })

    it('returns 404 for non-existent ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/tags/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/tags', () => {
    it('returns 201 and created tag', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'New Tag' },
      })
      expect(res.status).toBe(201)
      const data = (await getResponseData(res)) as { name: string }
      expect(data.name).toBe('New Tag')
    })
  })

  describe('PUT /api/tags/:id', () => {
    it('returns 200 and updated tag', async () => {
      const tagRecord = await createTestTag(testDb, { name: 'Original' })
      const app = createApp()
      const res = await authenticatedRequest(app, `/api/tags/${tagRecord.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
        json: { name: 'Updated' },
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as { name: string }
      expect(data.name).toBe('Updated')
    })
  })

  describe('DELETE /api/tags/:id', () => {
    it('returns 200 when tag not in use', async () => {
      const tagRecord = await createTestTag(testDb, { name: 'To Delete' })
      const app = createApp()
      const res = await authenticatedRequest(app, `/api/tags/${tagRecord.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
    })
  })
})
