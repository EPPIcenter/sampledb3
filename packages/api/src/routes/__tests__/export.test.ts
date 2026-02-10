import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createExportRoutes } from '../export'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'

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

  describe('GET /api/export/inventory.csv', () => {
    it('returns 200 with auth and CSV content', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/inventory.csv', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toMatch(/text\/csv|text\/plain/)
      const text = await res.text()
      expect(text).toMatch(/subject|control|inventory/i)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/inventory.csv', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/export/containers', () => {
    it('returns 400 when study parameter is missing', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/study.*required/i)
    })

    it('returns 404 when study does not exist', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=NONEXISTENT', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=ST1', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 200 with CSV when study has containers', async () => {
      const study = await createTestStudy(testDb, { title: 'Export Study', shortCode: 'EXPORT' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(testDb, { specimenId: spec.id })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=EXPORT&format=csv', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const contentType = res.headers.get('Content-Type')?.toLowerCase() ?? ''
      expect(contentType).toMatch(/text\/csv|text\/plain/)
      const text = await res.text()
      expect(text.length).toBeGreaterThan(0)
    })

    it('returns 200 with count_only when study has containers', async () => {
      const study = await createTestStudy(testDb, { title: 'Count Study', shortCode: 'COUNT' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Serum' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(testDb, { specimenId: spec.id })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=COUNT&count_only=true', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { count: number }
      expect(data).toHaveProperty('count')
      expect(data.count).toBe(1)
    })

    it('returns 200 with format=json when study has containers', async () => {
      const study = await createTestStudy(testDb, { title: 'JSON Study', shortCode: 'JSON' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(testDb, { specimenId: spec.id })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=JSON&format=json', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toContain('application/json')
      const data = await res.json()
      expect(data).toBeDefined()
      expect(typeof data).toBe('object')
    })

    it('returns 200 with format=xlsx when study has containers', async () => {
      const study = await createTestStudy(testDb, { title: 'Excel Study', shortCode: 'XLSX' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Serum' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(testDb, { specimenId: spec.id })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=XLSX&format=xlsx', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toMatch(/spreadsheet|excel|xlsx/)
      const buf = await res.arrayBuffer()
      expect(buf.byteLength).toBeGreaterThan(0)
    })

    it('returns 404 when study has no containers', async () => {
      const study = await createTestStudy(testDb, { title: 'Empty Study', shortCode: 'EMPTY' })
      await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      // No specimen/container

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=EMPTY', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/no containers found/i)
    })

    it('returns 400 for invalid format', async () => {
      const study = await createTestStudy(testDb, { title: 'Fmt Study', shortCode: 'FMT' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(testDb, { specimenId: spec.id })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/export/containers?study=FMT&format=invalid', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/invalid format|csv, xlsx, or json/i)
    })
  })
})
