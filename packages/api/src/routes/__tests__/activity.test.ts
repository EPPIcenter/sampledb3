import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import {
  createTestControlDefinition,
  createTestControlBatch,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStudy,
  createTestStudySubject,
  createTestStorageContainer,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
} from '../../__tests__/helpers/factories'
import { micronixTube } from '../../db/schema'
import { createActivityRoutes } from '../activity'

describe('Activity API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'user@test.com',
        name: 'User',
        password: 'password123',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/activity', createActivityRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/activity/recent', () => {
    it('returns 200 and array', async () => {
      const res = await ctx.request('/api/activity/recent', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity?: unknown[] }
      expect(Array.isArray(data.activity)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/activity/recent', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })

    it('returns control specimen labels without database ID, with definition and batch names', async () => {
      const definition = await createTestControlDefinition(ctx.db, {
        name: 'HPV18 DBS Control',
        controlType: 'blood',
      })
      const batch = await createTestControlBatch(ctx.db, definition.id, {
        name: 'HPV18-2024-001',
        productionDate: '2024-01-15',
      })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'DBS' })
      const controlSpecimen = await createTestSpecimen(ctx.db, specimenType.id, {
        controlBatchId: batch.id,
      })

      const res = await ctx.request('/api/activity/recent', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity?: Array<{ id: number; type: string; label: string }> }
      expect(Array.isArray(data.activity)).toBe(true)

      const specimenActivity = data.activity!.find(
        (a) => a.type === 'specimen' && a.id === controlSpecimen.id
      )
      expect(specimenActivity).toBeDefined()
      expect(specimenActivity!.label).not.toMatch(/#\d+/)
      expect(specimenActivity!.label).toContain('HPV18 DBS Control')
      expect(specimenActivity!.label).toContain('HPV18-2024-001')
    })

    it('labels subject specimens and their containers with subject and study', async () => {
      const studyRecord = await createTestStudy(ctx.db, { title: 'Malaria Cohort', shortCode: 'MAL' })
      const subject = await createTestStudySubject(ctx.db, { studyId: studyRecord.id, name: 'P-001' })
      const type = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const spec = await createTestSpecimen(ctx.db, type.id, { studySubjectId: subject.id })
      const container = await createTestStorageContainer(ctx.db, { specimenId: spec.id })
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'P1', locationId: loc.id })
      await ctx.db.insert(micronixTube).values({ id: container.id, collectionId: plate.id, barcode: 'MT-9', position: 'A01' })

      const res = await ctx.request('/api/activity/recent', { method: 'GET' })
      const data = (await res.json()) as { activity: Array<{ id: number; type: string; label: string; context?: string }> }

      expect(data.activity.find((a) => a.type === 'specimen' && a.id === spec.id)).toMatchObject({
        label: 'Whole Blood • P-001 (MAL)',
        context: 'Malaria Cohort',
      })
      expect(data.activity.find((a) => a.type === 'container' && a.id === container.id)).toMatchObject({
        label: 'Micronix Tube (MT-9)',
        context: 'Whole Blood • P-001 (MAL)',
      })
    })
  })
})
