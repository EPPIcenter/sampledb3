import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSubjectsRoutes } from '../subjects'
import { createTestStudy, createTestStudySubject } from '../../__tests__/helpers/factories'
import { studySubject } from '../../db/schema'

describe('Subjects API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      settings: { pagination: true },
      user: {
        email: 'member@test.com',
        name: 'Member',
        password: 'password123',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/subjects', createSubjectsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/subjects', () => {
    it('returns 200 and subjects array with pagination', async () => {
      const res = await ctx.request('/api/subjects')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { subjects: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('subjects')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.subjects)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/subjects', () => {
    it('returns 201 and created subject when study exists', async () => {
      const studyRecord = await createTestStudy(ctx.db, {
        title: 'Test Study',
        shortCode: 'TS01',
      })
      const res = await ctx.request('/api/subjects', {
        method: 'POST',
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
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects', {
        method: 'POST',
        json: { studyId: 1, name: 'Subject 1' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/subjects/bulk', () => {
    it('creates all subjects in one transaction and returns 201', async () => {
      await createTestStudy(ctx.db, { title: 'Bulk Study', shortCode: 'BULK' })
      const res = await ctx.request('/api/subjects/bulk', {
        method: 'POST',
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
      await createTestStudy(ctx.db, { title: 'Bulk Study', shortCode: 'BULK2' })
      const res = await ctx.request('/api/subjects/bulk', {
        method: 'POST',
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
      const { studySubject: studySubjectTable } = await import('../../db/schema')
      const count = await ctx.db.select().from(studySubjectTable)
      const bulk2Subjects = count.filter((s) => s.name === 'Dup')
      expect(bulk2Subjects).toHaveLength(0)
    })

    it('returns 400 when a subject already exists and does not partially create other rows', async () => {
      const existingStudy = await createTestStudy(ctx.db, { title: 'Bulk Existing Study', shortCode: 'BULK3' })
      await createTestStudySubject(ctx.db, { studyId: existingStudy.id, name: 'AlreadyThere' })

      const before = await ctx.db.select().from(studySubject)
      const res = await ctx.request('/api/subjects/bulk', {
        method: 'POST',
        json: {
          subjects: [
            { studyShortCode: 'BULK3', name: 'AlreadyThere' },
            { studyShortCode: 'BULK3', name: 'ShouldNotBeCreated' },
          ],
        },
      })

      expect(res.status).toBe(400)
      const after = await ctx.db.select().from(studySubject)
      expect(after.length).toBe(before.length)
      const created = after.find((s) => s.name === 'ShouldNotBeCreated')
      expect(created).toBeUndefined()
    })
  })

  describe('POST /api/subjects/bulk/validate', () => {
    it('returns valid: true for valid subjects', async () => {
      await createTestStudy(ctx.db, { title: 'Val Study', shortCode: 'VS' })
      const res = await ctx.request('/api/subjects/bulk/validate', {
        method: 'POST',
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
      const res = await ctx.request('/api/subjects/bulk/validate', {
        method: 'POST',
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
      await createTestStudy(ctx.db, { title: 'Dup Val', shortCode: 'DUPV' })
      const res = await ctx.request('/api/subjects/bulk/validate', {
        method: 'POST',
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
