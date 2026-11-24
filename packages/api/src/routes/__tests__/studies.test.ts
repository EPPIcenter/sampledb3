import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createStudiesRoutes } from '../studies'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestUnit,
  seedLargeTestStudy,
} from '../../__tests__/helpers/factories'
import { specimen } from '../../db/schema'

describe('Studies API (list, get, create, update)', () => {
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
      mount: (app, { db, sqlite }) => {
        app.route('/api/studies', createStudiesRoutes(db, sqlite))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/studies', () => {
    it('returns 200 and list shape with studies and pagination', async () => {
      const res = await ctx.request('/api/studies')
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
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/studies', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/studies/:id', () => {
    it('returns 200 and study when found', async () => {
      const studyRecord = await createTestStudy(ctx.db, {
        title: 'Test Study',
        shortCode: 'TS01',
      })
      const res = await ctx.request(`/api/studies/${studyRecord.id}`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as { study: { id: number; title: string } }
      expect(data.study).toBeDefined()
      expect(data.study.id).toBe(studyRecord.id)
      expect(data.study.title).toBe('Test Study')
    })

    it('returns 404 when study does not exist', async () => {
      const res = await ctx.request('/api/studies/99999')
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/studies/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/studies', () => {
    it('returns 201 and created study', async () => {
      const res = await ctx.request('/api/studies', {
        method: 'POST',
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

    it('returns 409, not 500, for a duplicate title', async () => {
      const body = { title: 'Dup Study', shortCode: 'DUP01', isLongitudinal: false, leadPerson: 'Lead' }
      await ctx.request('/api/studies', { method: 'POST', json: body })
      const res = await ctx.request('/api/studies', { method: 'POST', json: { ...body, shortCode: 'DUP02' } })
      expect(res.status).toBe(409)
      const data = (await res.json()) as { error: string }
      expect(data.error).toBe('A record with this title already exists.')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/studies', {
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
      const studyRecord = await createTestStudy(ctx.db, {
        title: 'Original',
        shortCode: 'ORIG01',
      })
      const res = await ctx.request(`/api/studies/${studyRecord.id}`, {
        method: 'PUT',
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
      const res = await ctx.request('/api/studies/99999', {
        method: 'PUT',
        json: { title: 'Updated' },
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const studyRecord = await createTestStudy(ctx.db, { title: 'S', shortCode: 'S01' })
      const res = await authenticatedRequest(ctx.createRequestApp(), `/api/studies/${studyRecord.id}`, {
        method: 'PUT',
        json: { title: 'Updated' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/studies/:id/summary', () => {
    it('counts study duration in calendar days, as the study page does', async () => {
      const studyRecord = await createTestStudy(ctx.db, { title: 'Dated Study', shortCode: 'DAT01' })
      const type = await createTestSpecimenType(ctx.db, { name: 'DBS' })
      const subject = await createTestStudySubject(ctx.db, { studyId: studyRecord.id, name: 'S1' })
      // A time of day must not round the duration up to a second day.
      await ctx.db.insert(specimen).values([
        { studySubjectId: subject.id, specimenTypeId: type.id, collectionDate: '2024-11-03' },
        { studySubjectId: subject.id, specimenTypeId: type.id, collectionDate: '2024-11-04 18:00:00' },
      ])

      const res = await ctx.request(`/api/studies/${studyRecord.id}/summary`)

      expect(res.status).toBe(200)
      const data = (await res.json()) as { summary: { studyDurationDays: number | null } }
      expect(data.summary.studyDurationDays).toBe(1)
    })

    it('handles studies with more specimens than SQLite allows as bound parameters', async () => {
      const studyRecord = await createTestStudy(ctx.db, { title: 'Big Study', shortCode: 'BIG01' })
      const type = await createTestSpecimenType(ctx.db, { name: 'DBS' })
      const unit = await createTestUnit(ctx.db, { symbol: 'spots', name: 'spots', category: 'count' })
      const count = 70_000
      ctx.sqlite.exec('BEGIN')
      const addSubject = ctx.sqlite.prepare(
        "INSERT INTO study_subject (study_id, name, created, last_updated) VALUES (?, ?, '2024-01-01', '2024-01-01')",
      )
      const addSpecimen = ctx.sqlite.prepare(
        "INSERT INTO specimen (study_subject_id, specimen_type_id, collection_date, created, last_updated) VALUES (?, ?, '2024-01-01', '2024-01-01', '2024-01-01')",
      )
      const addContainer = ctx.sqlite.prepare(
        "INSERT INTO storage_container (specimen_id, unit_id, total_quantity, remaining_quantity, created, last_updated) VALUES (?, ?, 1, 1, '2024-01-01', '2024-01-01')",
      )
      for (let i = 0; i < count; i++) {
        const subject = addSubject.run(studyRecord.id, `S${i}`)
        const spec = addSpecimen.run(subject.lastInsertRowid, type.id)
        addContainer.run(spec.lastInsertRowid, unit.id)
      }
      ctx.sqlite.exec('COMMIT')

      const res = await ctx.request(`/api/studies/${studyRecord.id}/summary`)

      expect(res.status).toBe(200)
      const data = (await res.json()) as { summary: { totalSpecimens: number; totalContainers: number } }
      expect(data.summary.totalSpecimens).toBe(count)
      expect(data.summary.totalContainers).toBe(count)
    }, 60_000)
  })

  describe('GET /api/studies/:id/timeline', () => {
    it('handles studies with more subjects than SQLite allows as bound parameters', async () => {
      const studyRecord = await createTestStudy(ctx.db, { title: 'Big Study', shortCode: 'BIG01' })
      const type = await createTestSpecimenType(ctx.db, { name: 'DBS' })
      const unit = await createTestUnit(ctx.db, { symbol: 'spots', name: 'spots', category: 'count' })
      const count = 70_000
      seedLargeTestStudy(ctx.sqlite, { studyId: studyRecord.id, specimenTypeId: type.id, unitId: unit.id }, count)

      const res = await ctx.request(`/api/studies/${studyRecord.id}/timeline`)

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        subjects: Array<{ specimens: Array<{ specimenTypeName: string }> }>
        dateRange: { earliest: string; latest: string } | null
      }
      expect(data.subjects).toHaveLength(count)
      expect(data.subjects.every((subject) => subject.specimens.length === 1)).toBe(true)
      expect(data.subjects[0].specimens[0].specimenTypeName).toBe('DBS')
      expect(data.dateRange).toEqual({ earliest: '2024-01-01', latest: '2024-01-01' })
    }, 60_000)

    it('returns only the specimens of the requested study', async () => {
      const type = await createTestSpecimenType(ctx.db, { name: 'DBS' })
      const mine = await createTestStudy(ctx.db, { title: 'Mine', shortCode: 'MINE' })
      const other = await createTestStudy(ctx.db, { title: 'Other', shortCode: 'OTHER' })
      const mySubject = await createTestStudySubject(ctx.db, { studyId: mine.id, name: 'S1' })
      const otherSubject = await createTestStudySubject(ctx.db, { studyId: other.id, name: 'S1' })
      await ctx.db.insert(specimen).values([
        { studySubjectId: mySubject.id, specimenTypeId: type.id, collectionDate: '2024-02-01' },
        { studySubjectId: otherSubject.id, specimenTypeId: type.id, collectionDate: '2024-03-01' },
      ])

      const res = await ctx.request(`/api/studies/${mine.id}/timeline`)

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        subjects: Array<{ id: number; specimens: Array<{ collectionDate: string }> }>
        dateRange: { earliest: string; latest: string } | null
      }
      expect(data.subjects).toHaveLength(1)
      expect(data.subjects[0]).toMatchObject({ id: mySubject.id, specimens: [{ collectionDate: '2024-02-01' }] })
      expect(data.dateRange).toEqual({ earliest: '2024-02-01', latest: '2024-02-01' })
    })
  })
})
