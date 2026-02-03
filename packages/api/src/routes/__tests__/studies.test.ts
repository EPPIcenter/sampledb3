import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createStudiesRoutes } from '../studies'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, setupPaginationSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import { createTestStudy } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'

describe('Studies API (list, get, create, update)', () => {
  let app: Hono
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let memberCookie: string

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
    app.route('/api/studies', createStudiesRoutes(testDb, sqlite))

    memberCookie = await loginAndGetCookie(app, 'member@test.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /api/studies', () => {
    it('returns 200 and list shape with studies and pagination', async () => {
      const res = await authenticatedRequest(app, '/api/studies', {
        method: 'GET',
        cookie: memberCookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { studies: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('studies')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.studies)).toBe(true)
      expect(data.pagination).toHaveProperty('page')
      expect(data.pagination).toHaveProperty('total')
      expect(data.pagination).toHaveProperty('totalPages')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/studies', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/studies/:id', () => {
    it('returns 200 and study when found', async () => {
      const studyRecord = await createTestStudy(testDb, {
        title: 'Test Study',
        shortCode: 'TS01',
      })
      const res = await authenticatedRequest(app, `/api/studies/${studyRecord.id}`, {
        method: 'GET',
        cookie: memberCookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { study: { id: number; title: string } }
      expect(data.study).toBeDefined()
      expect(data.study.id).toBe(studyRecord.id)
      expect(data.study.title).toBe('Test Study')
    })

    it('returns 404 when study does not exist', async () => {
      const res = await authenticatedRequest(app, '/api/studies/99999', {
        method: 'GET',
        cookie: memberCookie,
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/studies/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/studies', () => {
    it('returns 201 and created study', async () => {
      const res = await authenticatedRequest(app, '/api/studies', {
        method: 'POST',
        cookie: memberCookie,
        json: {
          title: 'New Study',
          shortCode: 'NEW01',
          isLongitudinal: false,
          leadPerson: 'Lead Person',
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { study: { title: string; shortCode: string } }
      expect(data.study.title).toBe('New Study')
      expect(data.study.shortCode).toBe('NEW01')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/studies', {
        method: 'POST',
        json: {
          title: 'New Study',
          shortCode: 'NEW01',
          isLongitudinal: false,
          leadPerson: 'Lead Person',
        },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/studies/:id', () => {
    it('returns 200 and updated study', async () => {
      const studyRecord = await createTestStudy(testDb, {
        title: 'Original',
        shortCode: 'ORIG01',
      })
      const res = await authenticatedRequest(app, `/api/studies/${studyRecord.id}`, {
        method: 'PUT',
        cookie: memberCookie,
        json: {
          title: 'Updated Title',
          leadPerson: 'New Lead',
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { study: { title: string } }
      expect(data.study.title).toBe('Updated Title')
    })

    it('returns 404 when study does not exist', async () => {
      const res = await authenticatedRequest(app, '/api/studies/99999', {
        method: 'PUT',
        cookie: memberCookie,
        json: { title: 'Updated' },
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const studyRecord = await createTestStudy(testDb, { title: 'S', shortCode: 'S01' })
      const res = await authenticatedRequest(app, `/api/studies/${studyRecord.id}`, {
        method: 'PUT',
        json: { title: 'Updated' },
      })
      expect(res.status).toBe(401)
    })
  })
})
