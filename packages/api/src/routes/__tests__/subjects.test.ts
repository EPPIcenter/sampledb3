import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createSubjectsRoutes } from '../subjects'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, setupPaginationSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import { createTestStudy, createTestStudySubject } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { studySubject } from '../../db/schema'

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

  describe('POST /api/subjects/bulk', () => {
    it('creates all subjects in one transaction and returns 201', async () => {
      await createTestStudy(testDb, { title: 'Bulk Study', shortCode: 'BULK' })
      const res = await authenticatedRequest(app, '/api/subjects/bulk', {
        method: 'POST',
        cookie,
        json: {
          subjects: [
            { studyShortCode: 'BULK', name: 'Subj1' },
            { studyShortCode: 'BULK', name: 'Subj2' },
          ],
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { subjects: Array<{ id: number; name: string }>; created: number }
      expect(data.created).toBe(2)
      expect(data.subjects).toHaveLength(2)
      expect(data.subjects.map((s) => s.name).sort()).toEqual(['Subj1', 'Subj2'])
    })

    it('returns 400 on duplicate subject names in batch and creates no subjects', async () => {
      await createTestStudy(testDb, { title: 'Bulk Study', shortCode: 'BULK2' })
      const res = await authenticatedRequest(app, '/api/subjects/bulk', {
        method: 'POST',
        cookie,
        json: {
          subjects: [
            { studyShortCode: 'BULK2', name: 'Dup' },
            { studyShortCode: 'BULK2', name: 'Dup' },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string; created?: number }
      expect(data.error).toMatch(/duplicate/i)
      expect(data.created).toBe(0)
      const { studySubject } = await import('../../db/schema')
      const count = await testDb.select().from(studySubject)
      const bulk2Subjects = count.filter((s) => s.name === 'Dup')
      expect(bulk2Subjects).toHaveLength(0)
    })

    it('returns 400 when a subject already exists and does not partially create other rows', async () => {
      const existingStudy = await createTestStudy(testDb, { title: 'Bulk Existing Study', shortCode: 'BULK3' })
      await createTestStudySubject(testDb, { studyId: existingStudy.id, name: 'AlreadyThere' })

      const before = await testDb.select().from(studySubject)
      const res = await authenticatedRequest(app, '/api/subjects/bulk', {
        method: 'POST',
        cookie,
        json: {
          subjects: [
            { studyShortCode: 'BULK3', name: 'AlreadyThere' },
            { studyShortCode: 'BULK3', name: 'ShouldNotBeCreated' },
          ],
        },
      })

      expect(res.status).toBe(400)
      const after = await testDb.select().from(studySubject)
      expect(after.length).toBe(before.length)
      const created = after.find((s) => s.name === 'ShouldNotBeCreated')
      expect(created).toBeUndefined()
    })
  })

  describe('POST /api/subjects/bulk/validate', () => {
    it('returns valid: true for valid subjects', async () => {
      await createTestStudy(testDb, { title: 'Val Study', shortCode: 'VS' })
      const res = await authenticatedRequest(app, '/api/subjects/bulk/validate', {
        method: 'POST',
        cookie,
        json: {
          subjects: [
            { studyShortCode: 'VS', name: 'Subj1' },
            { studyShortCode: 'VS', name: 'Subj2' },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ index: number; message: string }> }
      expect(data.valid).toBe(true)
      expect(data.errors).toHaveLength(0)
    })

    it('returns valid: false when study does not exist', async () => {
      const res = await authenticatedRequest(app, '/api/subjects/bulk/validate', {
        method: 'POST',
        cookie,
        json: {
          subjects: [{ studyShortCode: 'NOSTUDY', name: 'S1' }],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.length).toBeGreaterThan(0)
    })

    it('returns valid: false on duplicate subject names in batch', async () => {
      await createTestStudy(testDb, { title: 'Dup Val', shortCode: 'DUPV' })
      const res = await authenticatedRequest(app, '/api/subjects/bulk/validate', {
        method: 'POST',
        cookie,
        json: {
          subjects: [
            { studyShortCode: 'DUPV', name: 'Same' },
            { studyShortCode: 'DUPV', name: 'Same' },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.toLowerCase().includes('duplicate'))).toBe(true)
    })
  })
})
