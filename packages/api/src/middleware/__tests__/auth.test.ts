import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthMiddleware } from '../auth'
import { createAuthRoutes } from '../../routes/auth'
import { handleRouteError } from '../../lib/error-handler'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupPasswordRequirements,
  setupSessionSettings,
  createTestUser,
} from '../../__tests__/helpers/auth-helpers'
import type { Database } from '../../db/client'

describe('auth middleware', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)
    await createTestUser(testDb, {
      email: 'auth@test.com',
      name: 'Auth User',
      password: 'password123',
      role: 'member',
    })
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('returns 401 when no session cookie', async () => {
    const app = new Hono()
    app.onError((err, c) => handleRouteError(err, c))
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    const auth = createAuthMiddleware(testDb)
    app.get('/protected', auth, (c) => c.json({ user: c.get('user') }))
    app.route('/api/auth', createAuthRoutes(testDb, testDb))

    const res = await app.request('/protected', { method: 'GET' })
    expect(res.status).toBe(401)
  })

  it('sets user and calls next when valid session', async () => {
    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    const auth = createAuthMiddleware(testDb)
    app.get('/protected', auth, (c) => c.json({ user: c.get('user') }))
    app.route('/api/auth', createAuthRoutes(testDb, testDb))

    const cookie = await loginAndGetCookie(app, 'auth@test.com', 'password123')
    const res = await authenticatedRequest(app, '/protected', {
      method: 'GET',
      cookie,
    })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { user: { email: string } }
    expect(data.user).toBeDefined()
    expect(data.user.email).toBe('auth@test.com')
  })
})
