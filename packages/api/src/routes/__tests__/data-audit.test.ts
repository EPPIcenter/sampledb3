import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createDataAuditRoutes } from '../data-audit'
import { utcNow } from '../../lib/datetime'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
  createTestStudy,
  createTestStudySubject,
  createTestControlDefinition,
  createTestUnit,
  createTestTag,
} from '../../__tests__/helpers/factories'
import {
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  storageContainer,
  specimen,
  studySubject,
  study,
  box,
  sheet,
  containerDerivation,
  storageContainerTag,
  location,
} from '../../db/schema'
import { eq } from 'drizzle-orm'
import { withForeignKeysDisabled } from '../../db/apply-initial-schema'

describe('Data audit API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      additionalUsers: [
        {
          key: 'member',
          email: 'member@test.com',
          name: 'Member',
          password: 'password123',
          role: 'member',
        },
      ],
      mount: (app, { db }) => {
        app.route('/api/admin/data-audit', createDataAuditRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/admin/data-audit/empty-collections', () => {
    it('returns 401 without auth', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/admin/data-audit/empty-collections', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 403 when user is member not admin', async () => {
      const res = await ctx.request('/api/admin/data-audit/empty-collections', {
        method: 'GET',
        cookie: ctx.cookies.member,
      })
      expect(res.status).toBe(403)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('Admin')
    })

    it('returns only empty collections', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: 'Test' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Loc1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const emptyPlate = await createTestMicronixPlate(ctx.db, { name: 'EmptyPlate', locationId: loc.id })
      const plateWithItem = await createTestMicronixPlate(ctx.db, { name: 'PlateWithTube', locationId: loc.id })
      const specType = await createTestSpecimenType(ctx.db, { name: 'ST1' })
      const specimen = await createTestSpecimen(ctx.db, specType.id)
      const container = await createTestStorageContainer(ctx.db, { specimenId: specimen.id })
      await ctx.db.insert(micronixTube).values({
        id: container.id,
        collectionId: plateWithItem.id,
        barcode: 'BC1',
        position: null,
      })

      const res = await ctx.request('/api/admin/data-audit/empty-collections', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { collections: Array<{ type: string; id: number; name: string }> }
      expect(data.collections).toBeDefined()
      const ids = data.collections.map((c) => c.id)
      expect(ids).toContain(emptyPlate.id)
      expect(ids).not.toContain(plateWithItem.id)
    })

    it('returns 200 and empty array when no empty collections exist', async () => {
      const res = await ctx.request('/api/admin/data-audit/empty-collections', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { collections: unknown[] }
      expect(Array.isArray(data.collections)).toBe(true)
    })
  })

  describe('POST /api/admin/data-audit/empty-collections/delete', () => {
    it('returns 401 without auth', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/admin/data-audit/empty-collections/delete', {
        method: 'POST',
        json: { ids: { micronix_plate: [1] } },
      })
      expect(res.status).toBe(401)
    })

    it('returns 403 when user is member not admin', async () => {
      const res = await ctx.request('/api/admin/data-audit/empty-collections/delete', {
        method: 'POST',
        cookie: ctx.cookies.member,
        json: { ids: { micronix_plate: [1] } },
      })
      expect(res.status).toBe(403)
    })

    it('deletes only empty collections and returns deleted count', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: 'Test' })
      const loc = await createTestLocation(ctx.db, {
        name: 'LocDel',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const empty1 = await createTestMicronixPlate(ctx.db, { name: 'EmptyDel1', locationId: loc.id })
      const empty2 = await createTestMicronixPlate(ctx.db, { name: 'EmptyDel2', locationId: loc.id })

      const res = await ctx.request('/api/admin/data-audit/empty-collections/delete', {
        method: 'POST',
        json: { ids: { micronix_plate: [empty1.id, empty2.id] } },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { deleted: number; errors?: string[] }
      expect(data.deleted).toBe(2)
      expect(data.errors).toBeUndefined()

      const getRes = await ctx.request('/api/admin/data-audit/empty-collections', {
        method: 'GET',
      })
      const listData = (await getRes.json()) as { collections: Array<{ id: number }> }
      const remainingIds = listData.collections.map((c) => c.id)
      expect(remainingIds).not.toContain(empty1.id)
      expect(remainingIds).not.toContain(empty2.id)
    })

    it('deletes valid empty collections and returns errors for non-empty or invalid', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf2', description: 'Test' })
      const loc = await createTestLocation(ctx.db, {
        name: 'LocMixed',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const emptyPlate = await createTestMicronixPlate(ctx.db, { name: 'EmptyOnly', locationId: loc.id })
      const plateWithItem = await createTestMicronixPlate(ctx.db, { name: 'HasTube', locationId: loc.id })
      const specType = await createTestSpecimenType(ctx.db, { name: 'ST2' })
      const specimen = await createTestSpecimen(ctx.db, specType.id)
      const container = await createTestStorageContainer(ctx.db, { specimenId: specimen.id })
      await ctx.db.insert(micronixTube).values({
        id: container.id,
        collectionId: plateWithItem.id,
        barcode: 'BC2',
        position: null,
      })

      const res = await ctx.request('/api/admin/data-audit/empty-collections/delete', {
        method: 'POST',
        json: {
          ids: {
            micronix_plate: [emptyPlate.id, plateWithItem.id, 99999],
          },
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { deleted: number; errors?: string[] }
      expect(data.deleted).toBe(1)
      expect(Array.isArray(data.errors)).toBe(true)
      expect((data.errors as string[]).length).toBeGreaterThanOrEqual(2)

      const getRes = await ctx.request('/api/admin/data-audit/empty-collections', {
        method: 'GET',
      })
      const listData = (await getRes.json()) as { collections: Array<{ id: number }> }
      const remainingIds = listData.collections.map((c) => c.id)
      expect(remainingIds).not.toContain(emptyPlate.id)
      const stillExists = await ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, plateWithItem.id)).get()
      expect(stillExists).toBeDefined()
    })
  })

  describe('GET /api/admin/data-audit/integrity-report', () => {
    it('returns 401 without auth', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/admin/data-audit/integrity-report', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 403 when user is member not admin', async () => {
      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
        cookie: ctx.cookies.member,
      })
      expect(res.status).toBe(403)
    })

    it('returns report with emptyCollections and all integrity check arrays', async () => {
      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        emptyCollections: unknown[]
        collectionsWithMissingLocation: unknown[]
        containersWithMissingSpecimen: unknown[]
        subtypeOrphans: unknown[]
        sheetsWithMissingBoxOrBag: unknown[]
        specimensWithMissingSubjectOrBatch: unknown[]
        studySubjectsWithMissingStudy: unknown[]
        derivationBrokenRefs: unknown[]
        storageContainerTagOrphans: unknown[]
        duplicateBarcodes: unknown[]
        locationPathInconsistencies: unknown[]
      }
      expect(Array.isArray(data.emptyCollections)).toBe(true)
      expect(Array.isArray(data.collectionsWithMissingLocation)).toBe(true)
      expect(Array.isArray(data.containersWithMissingSpecimen)).toBe(true)
      expect(Array.isArray(data.subtypeOrphans)).toBe(true)
      expect(Array.isArray(data.sheetsWithMissingBoxOrBag)).toBe(true)
      expect(Array.isArray(data.specimensWithMissingSubjectOrBatch)).toBe(true)
      expect(Array.isArray(data.studySubjectsWithMissingStudy)).toBe(true)
      expect(Array.isArray(data.derivationBrokenRefs)).toBe(true)
      expect(Array.isArray(data.storageContainerTagOrphans)).toBe(true)
      expect(Array.isArray(data.duplicateBarcodes)).toBe(true)
      expect(Array.isArray(data.locationPathInconsistencies)).toBe(true)
    })

    it('includes containers with missing specimen in report', async () => {
      const specType = await createTestSpecimenType(ctx.db, { name: 'STOrphan' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const container = await createTestStorageContainer(ctx.db, { specimenId: spec.id })
      await ctx.db.insert(micronixTube).values({
        id: container.id,
        collectionId: (await createTestMicronixPlate(ctx.db, { name: 'P1', locationId: (await createTestLocation(ctx.db, { name: 'L1', storageTypeId: String((await createTestStorageType(ctx.db, { name: 'Shelf', description: '' })).id), canContainCollections: true })).id })).id,
        barcode: 'BC-orphan',
        position: null,
      })
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(specimen).where(eq(specimen.id, spec.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { containersWithMissingSpecimen: Array<{ id: number; specimenId: number }> }
      const match = data.containersWithMissingSpecimen.find((c) => c.id === container.id)
      expect(match).toBeDefined()
      expect(match!.specimenId).toBe(spec.id)
    })

    it('includes collections with missing location in report', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocForPlate', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlateOrphanLoc', locationId: loc.id })
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(location).where(eq(location.id, loc.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { collectionsWithMissingLocation: Array<{ type: string; id: number; name: string; locationId: number }> }
      const match = data.collectionsWithMissingLocation.find((c) => c.type === 'micronix_plate' && c.id === plate.id)
      expect(match).toBeDefined()
      expect(match!.locationId).toBe(loc.id)
    })

    it('includes subtype orphans (storage_container with no subtype row) in report', async () => {
      const specType = await createTestSpecimenType(ctx.db, { name: 'STSub' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const container = await createTestStorageContainer(ctx.db, { specimenId: spec.id })
      // Do not insert into micronix_tube, cryovial_tube, paper, or static_well

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { subtypeOrphans: Array<{ id: number }> }
      const match = data.subtypeOrphans.find((c) => c.id === container.id)
      expect(match).toBeDefined()
    })

    it('includes sheets with missing box or bag in report', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocBox', storageTypeId: String(storageType.id), canContainCollections: true })
      const now = utcNow()
      const [b] = await ctx.db.insert(box).values({ name: 'BoxOrphan', locationId: loc.id, created: now, lastUpdated: now }).returning()
      const [s] = await ctx.db.insert(sheet).values({ name: 'SheetOrphan', boxId: b!.id, created: now, lastUpdated: now }).returning()
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(box).where(eq(box.id, b!.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { sheetsWithMissingBoxOrBag: Array<{ id: number; name: string; boxId: number | null; bagId: number | null }> }
      const match = data.sheetsWithMissingBoxOrBag.find((row) => row.id === s!.id)
      expect(match).toBeDefined()
      expect(match!.boxId).toBe(b!.id)
    })

    it('includes specimens with missing study subject or control batch in report', async () => {
      const studyRec = await createTestStudy(ctx.db, { title: 'StudyOrphan', shortCode: 'SO' })
      const subject = await createTestStudySubject(ctx.db, { studyId: studyRec.id, name: 'SubjOrphan' })
      const specType = await createTestSpecimenType(ctx.db, { name: 'STSpec' })
      const [spec] = await ctx.db.insert(specimen).values({ specimenTypeId: specType.id, studySubjectId: subject.id, created: utcNow(), lastUpdated: utcNow() }).returning()
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(studySubject).where(eq(studySubject.id, subject.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimensWithMissingSubjectOrBatch: Array<{ id: number; studySubjectId: number | null; controlBatchId: number | null }> }
      const match = data.specimensWithMissingSubjectOrBatch.find((row) => row.id === spec!.id)
      expect(match).toBeDefined()
      expect(match!.studySubjectId).toBe(subject.id)
    })

    it('includes study subjects with missing study in report', async () => {
      const studyRec = await createTestStudy(ctx.db, { title: 'StudyToDelete', shortCode: 'SD' })
      const subject = await createTestStudySubject(ctx.db, { studyId: studyRec.id, name: 'SubjStudyGone' })
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(study).where(eq(study.id, studyRec.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { studySubjectsWithMissingStudy: Array<{ id: number; studyId: number; name: string }> }
      const match = data.studySubjectsWithMissingStudy.find((row) => row.id === subject.id)
      expect(match).toBeDefined()
      expect(match!.studyId).toBe(studyRec.id)
    })

    it('includes derivation broken refs in report', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'ShelfDer', description: '' })
      const locP = await createTestLocation(ctx.db, { name: 'Lp', storageTypeId: String(storageType.id), canContainCollections: true })
      const locC = await createTestLocation(ctx.db, { name: 'Lc', storageTypeId: String(storageType.id), canContainCollections: true })
      const plateP = await createTestMicronixPlate(ctx.db, { name: 'PpDer', locationId: locP.id })
      const plateC = await createTestMicronixPlate(ctx.db, { name: 'PcDer', locationId: locC.id })
      const specType = await createTestSpecimenType(ctx.db, { name: 'STDer' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL-der', name: 'microliter der', category: 'volume' })
      const [parent] = await ctx.db.insert(storageContainer).values({ specimenId: spec.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: utcNow(), lastUpdated: utcNow() }).returning()
      const [child] = await ctx.db.insert(storageContainer).values({ specimenId: spec.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: utcNow(), lastUpdated: utcNow() }).returning()
      await ctx.db.insert(micronixTube).values({ id: parent!.id, collectionId: plateP.id, barcode: 'BpDer', position: null })
      await ctx.db.insert(micronixTube).values({ id: child!.id, collectionId: plateC.id, barcode: 'BcDer', position: null })
      const [der] = await ctx.db.insert(containerDerivation).values({ parentContainerId: parent!.id, childContainerId: child!.id, derivationType: 'aliquot', created: utcNow() }).returning()
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(storageContainer).where(eq(storageContainer.id, parent!.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { derivationBrokenRefs: Array<{ id: number; parentContainerId: number; childContainerId: number }> }
      const match = data.derivationBrokenRefs.find((row) => row.id === der!.id)
      expect(match).toBeDefined()
      expect(match!.parentContainerId).toBe(parent!.id)
    })

    it('includes storage_container_tag orphans in report', async () => {
      const t = await createTestTag(ctx.db, { name: `TagOrphan-${Date.now()}` })
      const specType = await createTestSpecimenType(ctx.db, { name: 'STTag' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const container = await createTestStorageContainer(ctx.db, { specimenId: spec.id })
      await ctx.db.insert(storageContainerTag).values({ storageContainerId: container.id, tagId: t.id })
      await withForeignKeysDisabled(ctx.sqlite, () =>
        ctx.db.delete(storageContainer).where(eq(storageContainer.id, container.id)),
      )

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { storageContainerTagOrphans: Array<{ storageContainerId: number; tagId: number }> }
      const match = data.storageContainerTagOrphans.find((row) => row.storageContainerId === container.id && row.tagId === t.id)
      expect(match).toBeDefined()
    })

    it('does not report duplicate cryovial barcodes as integrity issues', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocDup', storageTypeId: String(storageType.id), canContainCollections: true })
      const now = utcNow()
      const [cvBox1] = await ctx.db.insert(cryovialBox).values({ name: `CryoDup1-${Date.now()}`, locationId: loc.id, created: now, lastUpdated: now }).returning()
      const [cvBox2] = await ctx.db.insert(cryovialBox).values({ name: `CryoDup2-${Date.now()}`, locationId: loc.id, created: now, lastUpdated: now }).returning()
      const specType = await createTestSpecimenType(ctx.db, { name: 'STDup' })
      const spec1 = await createTestSpecimen(ctx.db, specType.id)
      const unit = await createTestUnit(ctx.db, { symbol: `uL-dup-${Date.now()}`, name: 'microliter', category: 'volume' })
      const c1 = await createTestStorageContainer(ctx.db, { specimenId: spec1.id, unitId: unit.id })
      const spec2 = await createTestSpecimen(ctx.db, specType.id)
      const c2 = await createTestStorageContainer(ctx.db, { specimenId: spec2.id, unitId: unit.id })
      const sharedBarcode = `DUP-${Date.now()}`
      await ctx.db.insert(cryovialTube).values({ id: c1.id, collectionId: cvBox1!.id, barcode: sharedBarcode, position: null })
      await ctx.db.insert(cryovialTube).values({ id: c2.id, collectionId: cvBox2!.id, barcode: sharedBarcode, position: null })

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { duplicateBarcodes: Array<{ barcode: string; containerType: string }> }
      const cryovialMatch = data.duplicateBarcodes.find((d) => d.barcode === sharedBarcode && d.containerType === 'cryovial_tube')
      expect(cryovialMatch).toBeUndefined()
    })

    it('includes location path inconsistencies in report', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: '' })
      const root = await createTestLocation(ctx.db, { name: 'RootPath', storageTypeId: String(storageType.id), canContainCollections: false })
      const child = await createTestLocation(ctx.db, { name: 'ChildPath', parentId: root.id, canContainCollections: false })
      await ctx.db.update(location).set({ path: 'WrongPath' }).where(eq(location.id, child.id))

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        locationPathInconsistencies: Array<{ id: number; name: string; storedPath: string | null; expectedPath: string }>
      }
      const match = data.locationPathInconsistencies.find((row) => row.id === child.id)
      expect(match).toBeDefined()
      expect(match!.storedPath).toBe('WrongPath')
      expect(match!.expectedPath).toContain('RootPath')
      expect(match!.expectedPath).toContain('ChildPath')
    })
  })
})
