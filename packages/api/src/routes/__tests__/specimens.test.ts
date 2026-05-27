import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSpecimensRoutes } from '../specimens'
import { utcNow } from '../../lib/datetime'
import { setContainerDefaults, clearSettingsCache } from '../../lib/settings'
import { clearDefaultsCache } from '../../lib/defaults'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimen,
  createTestSpecimenType,
  createTestLocation,
  createTestUnit,
  createTestStorageType,
} from '../../__tests__/helpers/factories'
import {
  specimenTypeContainerType,
  containerTypeUnit,
  cryovialBox,
  micronixPlate,
  specimen,
  storageContainer,
  micronixTube,
} from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Specimens API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'member@test.com',
        name: 'Member',
        password: 'password123',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/specimens', createSpecimensRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/specimens', () => {
    it('returns 200 and specimens array', async () => {
      const res = await ctx.request('/api/specimens')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimens?: unknown[]; data?: unknown[] }
      const list = data.specimens ?? data.data
      expect(Array.isArray(list)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/specimens', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/specimens/bulk', () => {
    let testStudy: Awaited<ReturnType<typeof createTestStudy>>
    let testSubject: Awaited<ReturnType<typeof createTestStudySubject>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>

    beforeEach(async () => {
      testStudy = await createTestStudy(ctx.db, { title: 'Bulk Study', shortCode: 'BLK01' })
      testSubject = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'BULK-SUBJ' })
      testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const testStorageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(ctx.db, {
        name: 'Bulk Loc',
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      const testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'cryovial_tube',
      })
      await ctx.db.insert(containerTypeUnit).values({
        containerType: 'cryovial_tube',
        unitId: testUnit.id,
      })
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'micronix_tube',
      })
      await ctx.db.insert(containerTypeUnit).values({
        containerType: 'micronix_tube',
        unitId: testUnit.id,
      })
      clearSettingsCache(ctx.db, 'container_defaults')
      clearDefaultsCache(ctx.db)
      await setContainerDefaults(ctx.db, {
        cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
      })
      clearSettingsCache(ctx.db, 'container_defaults')
      const now = utcNow()
      await ctx.db.insert(cryovialBox).values({
        name: 'BULK-BOX',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
      await ctx.db.insert(micronixPlate).values({
        name: 'BULK-PLATE',
        locationId: testLocation.id,
        barcode: null,
        created: now,
        lastUpdated: now,
      })
    })

    it('reuses existing specimen (get-or-create): same subject + type + date twice returns created: 1', async () => {
      const studyCode = testStudy.shortCode
      const subjectName = testSubject.name
      const typeName = testSpecimenType.name
      const collectionDate = '2024-06-01'
      const payload = {
        specimens: [
          {
            sourceType: 'subject' as const,
            studyShortCode: studyCode,
            subjectName,
            specimenTypeName: typeName,
            collectionDate,
            container: {
              containerType: 'cryovial_tube' as const,
              collectionName: 'BULK-BOX',
              position: 'A01',
            },
          },
          {
            sourceType: 'subject' as const,
            studyShortCode: studyCode,
            subjectName,
            specimenTypeName: typeName,
            collectionDate,
            container: {
              containerType: 'cryovial_tube' as const,
              collectionName: 'BULK-BOX',
              position: 'A02',
            },
          },
        ],
      }
      const res = await ctx.request('/api/specimens/bulk', {
        method: 'POST',
        json: payload,
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as {
        specimens: Array<{ id: number }>
        created: number
        containersCreated: number
      }
      expect(data.created).toBe(1)
      expect(data.containersCreated).toBe(2)
      expect(data.specimens).toHaveLength(2)
      const specimenIds = data.specimens.map((s) => s.id)
      expect(specimenIds[0]).toBe(specimenIds[1])
      const count = await ctx.db
        .select({ id: specimen.id })
        .from(specimen)
        .where(eq(specimen.studySubjectId, testSubject.id))
      expect(count).toHaveLength(1)
    })

    it('returns 400 on validation error and creates no specimens (all-or-nothing)', async () => {
      const before = await ctx.db.select({ id: specimen.id }).from(specimen)
      const res = await ctx.request('/api/specimens/bulk', {
        method: 'POST',
        json: {
          specimens: [
            {
              sourceType: 'subject',
              studyShortCode: 'BLK01',
              subjectName: 'BULK-SUBJ',
              specimenTypeName: 'Nonexistent Type',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BULK-BOX',
                position: 'A01',
              },
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string; created?: number }
      expect(data.error).toMatch(/validation/i)
      expect(data.created).toBe(0)
      const after = await ctx.db.select({ id: specimen.id }).from(specimen)
      expect(after.length).toBe(before.length)
    })

    it('rolls back single specimen creation when container creation fails', async () => {
      const beforeSpecimens = await ctx.db.select({ id: specimen.id }).from(specimen)

      const res = await ctx.request('/api/specimens', {
        method: 'POST',
        json: {
          sourceType: 'subject',
          studyShortCode: 'BLK01',
          subjectName: 'BULK-SUBJ',
          specimenTypeName: 'Whole Blood',
          collectionDate: '2024-06-02',
          container: {
            containerType: 'micronix_tube',
            collectionName: 'MISSING-PLATE',
            barcode: 'MID-ROLLBACK-001',
            position: 'B01',
          },
        },
      })

      expect(res.status).toBe(400)
      const afterSpecimens = await ctx.db.select({ id: specimen.id }).from(specimen)
      expect(afterSpecimens.length).toBe(beforeSpecimens.length)
    })
  })

  describe('POST /api/specimens/bulk/validate', () => {
    let testStudy: Awaited<ReturnType<typeof createTestStudy>>
    let testSubject: Awaited<ReturnType<typeof createTestStudySubject>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>

    beforeEach(async () => {
      testStudy = await createTestStudy(ctx.db, { title: 'Val Study', shortCode: 'VBLK' })
      testSubject = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'V-SUBJ' })
      testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Serum' })
      const testStorageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(ctx.db, {
        name: 'Val Loc',
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      const testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'cryovial_tube',
      })
      await ctx.db.insert(containerTypeUnit).values({
        containerType: 'cryovial_tube',
        unitId: testUnit.id,
      })
      clearSettingsCache(ctx.db, 'container_defaults')
      await setContainerDefaults(ctx.db, {
        cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
      })
      await ctx.db.insert(cryovialBox).values({
        name: 'V-BOX',
        locationId: testLocation.id,
        created: utcNow(),
        lastUpdated: utcNow(),
      })
    })

    it('returns valid: true for valid specimens with container', async () => {
      const res = await ctx.request('/api/specimens/bulk/validate', {
        method: 'POST',
        json: {
          specimens: [
            {
              sourceType: 'subject',
              studyShortCode: 'VBLK',
              subjectName: 'V-SUBJ',
              specimenTypeName: 'Serum',
              collectionDate: '2024-07-01',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'V-BOX',
                position: 'A01',
              },
            },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(true)
      expect(data.errors).toHaveLength(0)
    })

    it('returns valid: false when specimen type is not found', async () => {
      const res = await ctx.request('/api/specimens/bulk/validate', {
        method: 'POST',
        json: {
          specimens: [
            {
              sourceType: 'subject',
              studyShortCode: 'VBLK',
              subjectName: 'V-SUBJ',
              specimenTypeName: 'Unknown Type',
              container: { containerType: 'cryovial_tube', collectionName: 'V-BOX', position: 'A01' },
            },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.length).toBeGreaterThan(0)
    })
  })

  describe('POST /api/specimens/:id/containers', () => {
    let testStudy: Awaited<ReturnType<typeof createTestStudy>>
    let testSubject: Awaited<ReturnType<typeof createTestStudySubject>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>
    let testSpecimen: Awaited<ReturnType<typeof createTestSpecimen>>
    const now = utcNow()

    beforeEach(async () => {
      testStudy = await createTestStudy(ctx.db, { title: 'Add Container Study', shortCode: 'ADD01' })
      testSubject = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'ADD-SUBJ' })
      testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Plasma' })
      const testStorageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(ctx.db, {
        name: 'Add Loc',
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      const testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'micronix_tube',
      })
      await ctx.db.insert(containerTypeUnit).values({
        containerType: 'micronix_tube',
        unitId: testUnit.id,
      })
      clearSettingsCache(ctx.db, 'container_defaults')
      await setContainerDefaults(ctx.db, {
        cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
      })
      await ctx.db.insert(micronixPlate).values({
        name: 'ADD-PLATE',
        locationId: testLocation.id,
        barcode: null,
        created: now,
        lastUpdated: now,
      })
      testSpecimen = await createTestSpecimen(ctx.db, testSpecimenType.id, {
        studySubjectId: testSubject.id,
      })
    })

    it('returns 201 and containerId and creates container for specimen', async () => {
      const res = await ctx.request(`/api/specimens/${testSpecimen.id}/containers`, {
        method: 'POST',
        json: {
          containerType: 'micronix_tube',
          collectionName: 'ADD-PLATE',
          barcode: 'ADD-TUBE-001',
          position: 'A01',
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { containerId?: number }
      expect(data.containerId).toBeDefined()
      expect(typeof data.containerId).toBe('number')

      const containers = await ctx.db
        .select()
        .from(storageContainer)
        .where(eq(storageContainer.specimenId, testSpecimen.id))
      expect(containers).toHaveLength(1)
      expect(containers[0].id).toBe(data.containerId)

      const tubes = await ctx.db.select().from(micronixTube).where(eq(micronixTube.id, data.containerId!))
      expect(tubes).toHaveLength(1)
      expect(tubes[0].barcode).toBe('ADD-TUBE-001')
      expect(tubes[0].position).toBe('A01')
    })

    it('returns 404 when specimen does not exist', async () => {
      const res = await ctx.request('/api/specimens/99999/containers', {
        method: 'POST',
        json: {
          containerType: 'micronix_tube',
          collectionName: 'ADD-PLATE',
          barcode: 'ADD-404',
          position: 'B01',
        },
      })
      expect(res.status).toBe(404)
    })

    it('returns 400 when container type is not allowed for specimen type', async () => {
      await ctx.db.delete(specimenTypeContainerType).where(eq(specimenTypeContainerType.specimenTypeId, testSpecimenType.id))
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'cryovial_tube',
      })

      const res = await ctx.request(`/api/specimens/${testSpecimen.id}/containers`, {
        method: 'POST',
        json: {
          containerType: 'micronix_tube',
          collectionName: 'ADD-PLATE',
          barcode: 'ADD-BAD-TYPE',
          position: 'C01',
        },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toMatch(/container type|not allowed|specimen type/i)
    })
  })
})
