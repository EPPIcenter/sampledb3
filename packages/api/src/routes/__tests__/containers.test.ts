import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createContainersRoutes } from '../containers'
import { utcNow } from '../../lib/datetime'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimen,
  createTestSpecimenType,
  createTestLocation,
  createTestUnit,
  createTestStorageType,
} from '../../__tests__/helpers/factories'
import { cryovialBox, cryovialTube, specimen, storageContainer, micronixPlate, micronixTube, box, sheet, paper, staticWell } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Containers API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      settings: { pagination: true },
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/containers', createContainersRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/containers', () => {
    it('returns 200 and containers with pagination when authenticated', async () => {
      const res = await ctx.request('/api/containers')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { containers: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('containers')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.containers)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/containers', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/containers/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/containers/99999')
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/containers/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /api/containers/:id', () => {
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>
    let testUnit: Awaited<ReturnType<typeof createTestUnit>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>

    beforeEach(async () => {
      const testStorageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(ctx.db, {
        name: `Patch Loc ${Date.now()}`,
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
    })

    it('updates cryovial_tube barcode', async () => {
      const now = utcNow()
      const [boxRecord] = await ctx.db
        .insert(cryovialBox)
        .values({ name: `BOX-PATCH-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const testStudy = await createTestStudy(ctx.db, { title: 'P Study', shortCode: 'PST' + Date.now() })
      const subj = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'S1' })
      const [spec] = await ctx.db
        .insert(specimen)
        .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
        .returning()
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: spec.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(cryovialTube).values({ id: container.id, collectionId: boxRecord.id, barcode: 'OLD-CRYO', position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: 'NEW-CRYO-1' },
      })
      expect(res.status).toBe(200)
      const row = await ctx.db.select().from(cryovialTube).where(eq(cryovialTube.id, container.id)).get()
      expect(row?.barcode).toBe('NEW-CRYO-1')
    })

    it('returns 400 when cryovial_tube barcode is already in use', async () => {
      const now = utcNow()
      const [boxRecord] = await ctx.db
        .insert(cryovialBox)
        .values({ name: `BOX-PATCH2-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const testStudy = await createTestStudy(ctx.db, { title: 'P2', shortCode: 'PS2' + Date.now() })
      const subj = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'S2' })

      const makeCryo = async (barcode: string, position: string) => {
        const [specimenRow] = await ctx.db
          .insert(specimen)
          .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
          .returning()
        const [c] = await ctx.db
          .insert(storageContainer)
          .values({ specimenId: specimenRow.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
          .returning()
        await ctx.db.insert(cryovialTube).values({ id: c.id, collectionId: boxRecord.id, barcode, position })
        return c.id
      }

      await makeCryo('TAKEN-BC', 'A01')
      const id2 = await makeCryo('OTHER-BC', 'A02')

      const res = await ctx.request(`/api/containers/${id2}`, {
        method: 'PATCH',
        json: { barcode: 'TAKEN-BC' },
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toContain('already in use')
    })

    it('returns 400 when setting micronix_tube barcode to null', async () => {
      const now = utcNow()
      const [plate] = await ctx.db
        .insert(micronixPlate)
        .values({ name: `PL-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now, barcode: null })
        .returning()
      const sp = await createTestSpecimen(ctx.db, testSpecimenType.id)
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(micronixTube).values({ id: container.id, collectionId: plate.id, barcode: 'MX-1', position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: null },
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/cleared|Micronix/i)
    })

    it('returns 400 when static_well has barcode in body', async () => {
      const now = utcNow()
      const [plate] = await ctx.db
        .insert(micronixPlate)
        .values({ name: `PL2-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now, barcode: null })
        .returning()
      const sp = await createTestSpecimen(ctx.db, testSpecimenType.id)
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(staticWell).values({ id: container.id, collectionId: plate.id, position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: 'Nope' },
      })
      expect(res.status).toBe(400)
    })

    it('updates paper barcode', async () => {
      const now = utcNow()
      const [b] = await ctx.db
        .insert(box)
        .values({ name: `BX-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const [sh] = await ctx.db
        .insert(sheet)
        .values({ name: 'S1', boxId: b.id, bagId: null, created: now, lastUpdated: now })
        .returning()
      const sp = await createTestSpecimen(ctx.db, testSpecimenType.id)
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(paper).values({ id: container.id, sheetId: sh.id, barcode: 'P-OLD', position: null })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: 'P-NEW' },
      })
      expect(res.status).toBe(200)
      const row = await ctx.db.select().from(paper).where(eq(paper.id, container.id)).get()
      expect(row?.barcode).toBe('P-NEW')
    })
  })
})
