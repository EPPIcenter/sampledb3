import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createExportRoutes } from '../export'
import { errorLogs } from '../../db/schema'
import * as specimensCsv from '../../lib/export/specimens-csv'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'

describe('Export API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/export', createExportRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/export/specimens.csv', () => {
    it('returns 200 with auth and CSV content type', async () => {
      const res = await ctx.request('/api/export/specimens.csv', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const contentType = res.headers.get('Content-Type') ?? ''
      expect(contentType.toLowerCase()).toMatch(/text\/csv|text\/plain/)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/export/specimens.csv', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/export/inventory.csv', () => {
    it('returns 200 with auth and CSV content', async () => {
      const res = await ctx.request('/api/export/inventory.csv', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toMatch(/text\/csv|text\/plain/)
      const text = await res.text()
      expect(text).toMatch(/subject|control|inventory/i)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/export/inventory.csv', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/export/containers', () => {
    it('returns 400 when study parameter is missing', async () => {
      const res = await ctx.request('/api/export/containers', {
        method: 'GET',
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/study.*required/i)
    })

    it('returns 404 when study does not exist', async () => {
      const rowsBefore = await ctx.db.select().from(errorLogs)
      const res = await ctx.request('/api/export/containers?study=NONEXISTENT', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rowsAfter = await ctx.db.select().from(errorLogs)
      expect(rowsAfter.length).toBe(rowsBefore.length)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/export/containers?study=ST1', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 200 with CSV when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Export Study', shortCode: 'EXPORT' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=EXPORT&format=csv', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const contentType = res.headers.get('Content-Type')?.toLowerCase() ?? ''
      expect(contentType).toMatch(/text\/csv|text\/plain/)
      const text = await res.text()
      expect(text.length).toBeGreaterThan(0)
    })

    it('returns 200 with count_only when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Count Study', shortCode: 'COUNT' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Serum' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=COUNT&count_only=true', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { count: number }
      expect(data).toHaveProperty('count')
      expect(data.count).toBe(1)
    })

    it('returns 200 with format=json when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'JSON Study', shortCode: 'JSON' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Plasma' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=JSON&format=json', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toContain('application/json')
      const data = await res.json()
      expect(data).toBeDefined()
      expect(typeof data).toBe('object')
    })

    it('returns 200 with format=xlsx when study has containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Excel Study', shortCode: 'XLSX' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Serum' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=XLSX&format=xlsx', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')?.toLowerCase()).toMatch(/spreadsheet|excel|xlsx/)
      const buf = await res.arrayBuffer()
      expect(buf.byteLength).toBeGreaterThan(0)
    })

    it('returns 200 with count_only when study has no subjects', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Brand New Study', shortCode: 'EMPTY' })
      // No subjects, specimens, or containers

      const res = await ctx.request('/api/export/containers?study=EMPTY&count_only=true', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { count: number }
      expect(data).toHaveProperty('count')
      expect(data.count).toBe(0)
    })

    it('returns 404 when study has no containers', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Empty Study', shortCode: 'EMPTY' })
      await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      // No specimen/container

      const rowsBefore = await ctx.db.select().from(errorLogs)
      const res = await ctx.request('/api/export/containers?study=EMPTY', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/no containers found/i)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rowsAfter = await ctx.db.select().from(errorLogs)
      expect(rowsAfter.length).toBe(rowsBefore.length)
    })

    it('returns 400 for invalid format', async () => {
      const study = await createTestStudy(ctx.db, { title: 'Fmt Study', shortCode: 'FMT' })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const spec = await createTestSpecimen(ctx.db, specimenType.id, { studySubjectId: subject.id })
      await createTestStorageContainer(ctx.db, { specimenId: spec.id })

      const res = await ctx.request('/api/export/containers?study=FMT&format=invalid', {
        method: 'GET',
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string }
      expect(data.error).toMatch(/invalid format|csv, xlsx, or json/i)
    })
  })

  describe('error persistence', () => {
    it('persists export 500 failures to error_logs with stable client body', async () => {
      const spy = vi
        .spyOn(specimensCsv, 'exportSpecimensCsv')
        .mockRejectedValueOnce(new Error('Simulated export failure'))

      const res = await ctx.request('/api/export/specimens.csv', { method: 'GET' })
      expect(res.status).toBe(500)
      const data = (await res.json()) as { error?: string; details?: string }
      expect(data.error).toBe('Failed to export specimens')
      expect(data.details).toBe('Simulated export failure')

      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await ctx.db
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.message, 'Failed to export specimens'))
      expect(rows.length).toBeGreaterThanOrEqual(1)

      spy.mockRestore()
    })
  })
})
