import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createSubjectsRoutes } from '../subjects'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, setupPaginationSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import { createTestStudy } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'

describe('Subjects API', () => {
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
    await setupPaginationSettings(testDb)

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
    app.route('/api/subjects', createSubjectsRoutes(testDb))

    cookie = await loginAndGetCookie(app, 'member@test.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /api/subjects', () => {
    it('returns 200 and subjects array with pagination', async () => {
      const res = await authenticatedRequest(app, '/api/subjects', {
        method: 'GET',
        cookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { subjects: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('subjects')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.subjects)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/subjects', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/subjects', () => {
    it('returns 201 and created subject when study exists', async () => {
      const studyRecord = await createTestStudy(testDb, {
        title: 'Test Study',
        shortCode: 'TS01',
      })
      const res = await authenticatedRequest(app, '/api/subjects', {
        method: 'POST',
        cookie,
        json: {
          studyId: studyRecord.id,
          name: 'Subject 1',
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { subject: { name: string; studyId: number } }
      expect(data.subject).toBeDefined()
      expect(data.subject.name).toBe('Subject 1')
      expect(data.subject.studyId).toBe(studyRecord.id)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/subjects', {
        method: 'POST',
        json: { studyId: 1, name: 'Subject 1' },
      })
      expect(res.status).toBe(401)
    })
  })
})
