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
  createTestCryovialBox,
  createTestCryovialTube,
  createTestMicronixTube,
  createTestBox,
  createTestBag,
  createTestSheet,
  createTestPaper,
  createTestSpecimenTypeContainerType,
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
        containersWithNoGridPosition: unknown[]
        specimensWithNonIsoCollectionDate: unknown[]
        containersWithInvalidGridPosition: unknown[]
        duplicateSpecimenIdentities: unknown[]
        caseVariantSubjectNames: unknown[]
        caseVariantCollectionNames: unknown[]
        containersInDisallowedContainerType: unknown[]
        exhaustedContainersWithRemainingQuantity: unknown[]
        specimensWithPlaceholderCollectionDate: unknown[]
        specimensWithFutureCollectionDate: unknown[]
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
      expect(Array.isArray(data.containersWithNoGridPosition)).toBe(true)
      expect(Array.isArray(data.specimensWithNonIsoCollectionDate)).toBe(true)
      expect(data.containersWithInvalidGridPosition).toEqual([])
      expect(data.duplicateSpecimenIdentities).toEqual([])
      expect(data.caseVariantSubjectNames).toEqual([])
      expect(data.caseVariantCollectionNames).toEqual([])
      expect(data.containersInDisallowedContainerType).toEqual([])
      expect(data.exhaustedContainersWithRemainingQuantity).toEqual([])
      expect(data.specimensWithPlaceholderCollectionDate).toEqual([])
      expect(data.specimensWithFutureCollectionDate).toEqual([])
    })

    it('flags specimens whose collection date is not YYYY-MM-DD', async () => {
      const specType = await createTestSpecimenType(ctx.db, { name: 'STDate' })
      const iso = await createTestSpecimen(ctx.db, specType.id, { collectionDate: '2024-05-07' })
      const legacy = await createTestSpecimen(ctx.db, specType.id, { collectionDate: '5/7/24' })
      const impossible = await createTestSpecimen(ctx.db, specType.id, { collectionDate: '2024-02-30' })
      await createTestSpecimen(ctx.db, specType.id)

      const res = await ctx.request('/api/admin/data-audit/integrity-report', { method: 'GET' })

      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimensWithNonIsoCollectionDate: Array<{ id: number; collectionDate: string }> }
      expect(data.specimensWithNonIsoCollectionDate).toEqual([
        { id: legacy.id, collectionDate: '5/7/24' },
        { id: impossible.id, collectionDate: '2024-02-30' },
      ])
      expect(data.specimensWithNonIsoCollectionDate.map((s) => s.id)).not.toContain(iso.id)
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

    it('reports tube barcodes duplicated across types, including case and whitespace variants', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocDup', storageTypeId: String(storageType.id), canContainCollections: true })
      const now = utcNow()
      const [cvBox] = await ctx.db.insert(cryovialBox).values({ name: 'CryoDup', locationId: loc.id, created: now, lastUpdated: now }).returning()
      const [plate] = await ctx.db.insert(micronixPlate).values({ name: 'PlateDup', locationId: loc.id, created: now, lastUpdated: now }).returning()
      const specType = await createTestSpecimenType(ctx.db, { name: 'STDup' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL-dup', name: 'microliter', category: 'volume' })
      const container = () => createTestStorageContainer(ctx.db, { specimenId: spec.id, unitId: unit.id })
      const [na1, na2, mx, cv, lone] = [await container(), await container(), await container(), await container(), await container()]
      await ctx.db.insert(cryovialTube).values({ id: na1.id, collectionId: cvBox!.id, barcode: 'NA', position: null })
      await ctx.db.insert(cryovialTube).values({ id: na2.id, collectionId: cvBox!.id, barcode: 'NA', position: null })
      await ctx.db.insert(micronixTube).values({ id: mx.id, collectionId: plate!.id, barcode: 'CK3-3FR4', position: null })
      await ctx.db.insert(cryovialTube).values({ id: cv.id, collectionId: cvBox!.id, barcode: 'ck3-3fr4 ', position: null })
      await ctx.db.insert(cryovialTube).values({ id: lone.id, collectionId: cvBox!.id, barcode: 'LONE', position: null })

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { duplicateBarcodes: unknown[] }
      expect(data.duplicateBarcodes).toEqual([
        { barcode: 'CK3-3FR4', variants: ['CK3-3FR4', 'ck3-3fr4 '], containerTypes: ['cryovial_tube', 'micronix_tube'], ids: [mx.id, cv.id] },
        { barcode: 'NA', variants: ['NA'], containerTypes: ['cryovial_tube'], ids: [na1.id, na2.id] },
      ])
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

    it('includes containers with no grid position and does not treat them as missing elsewhere', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'ShelfPos', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocPos', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlateNoPos', locationId: loc.id })
      const specType = await createTestSpecimenType(ctx.db, { name: 'STNoPos' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const container = await createTestStorageContainer(ctx.db, { specimenId: spec.id })
      await ctx.db.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'BC-nopos',
        position: null,
      })

      const res = await ctx.request('/api/admin/data-audit/integrity-report', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        containersWithNoGridPosition: Array<{ id: number; containerType: string; collectionId: number }>
      }
      const match = data.containersWithNoGridPosition.find((row) => row.id === container.id)
      expect(match).toBeDefined()
      expect(match!.containerType).toBe('micronix_tube')
      expect(match!.collectionId).toBe(plate.id)
    })

    async function report<K extends string>(key: K): Promise<unknown> {
      const res = await ctx.request('/api/admin/data-audit/integrity-report', { method: 'GET' })
      expect(res.status).toBe(200)
      return ((await res.json()) as Record<K, unknown>)[key]
    }

    it('lists Specimens that share a Subject, Specimen type and collection date, dated or not', async () => {
      // Production has no Specimen identity index (CONTEXT.md, Specimen identity); fresh installs do.
      ctx.sqlite.exec('DROP INDEX idx_specimen_study_subject_type_date')
      const studyRecord = await createTestStudy(ctx.db, { title: 'Identity Study', shortCode: 'IDS' })
      const subject = await createTestStudySubject(ctx.db, { studyId: studyRecord.id, name: 'ID-1' })
      const blood = await createTestSpecimenType(ctx.db, { name: 'STIdBlood' })
      const plasma = await createTestSpecimenType(ctx.db, { name: 'STIdPlasma' })
      const dated = [
        await createTestSpecimen(ctx.db, blood.id, { studySubjectId: subject.id, collectionDate: '2022-03-17' }),
        await createTestSpecimen(ctx.db, blood.id, { studySubjectId: subject.id, collectionDate: '2022-03-17' }),
      ]
      const undated = [
        await createTestSpecimen(ctx.db, plasma.id, { studySubjectId: subject.id }),
        await createTestSpecimen(ctx.db, plasma.id, { studySubjectId: subject.id }),
        await createTestSpecimen(ctx.db, plasma.id, { studySubjectId: subject.id }),
      ]
      await createTestSpecimen(ctx.db, blood.id, { studySubjectId: subject.id, collectionDate: '2022-03-18' })
      await createTestSpecimen(ctx.db, blood.id, { studySubjectId: subject.id })

      expect(await report('duplicateSpecimenIdentities')).toEqual([
        {
          studyId: studyRecord.id,
          studyShortCode: 'IDS',
          subjectId: subject.id,
          subjectName: 'ID-1',
          specimenTypeId: blood.id,
          specimenTypeName: 'STIdBlood',
          collectionDate: '2022-03-17',
          specimenIds: dated.map((s) => s.id),
        },
        {
          studyId: studyRecord.id,
          studyShortCode: 'IDS',
          subjectId: subject.id,
          subjectName: 'ID-1',
          specimenTypeId: plasma.id,
          specimenTypeName: 'STIdPlasma',
          specimenIds: undated.map((s) => s.id),
        },
      ])
    })

    it('lists Subjects in one Study whose names differ only by case', async () => {
      ctx.sqlite.exec('DROP INDEX study_subject_study_name_nocase_idx')
      const ctrl = await createTestStudy(ctx.db, { title: 'Controls', shortCode: 'CTRL' })
      const other = await createTestStudy(ctx.db, { title: 'Other', shortCode: 'OTH' })
      const upper = await createTestStudySubject(ctx.db, { studyId: ctrl.id, name: '3D7_10K' })
      const lower = await createTestStudySubject(ctx.db, { studyId: ctrl.id, name: '3d7_10k' })
      await createTestStudySubject(ctx.db, { studyId: other.id, name: '3d7_10K' })
      await createTestStudySubject(ctx.db, { studyId: ctrl.id, name: '3D7_0.05' })

      expect(await report('caseVariantSubjectNames')).toEqual([
        {
          studyId: ctrl.id,
          studyShortCode: 'CTRL',
          subjects: [
            { id: upper.id, name: '3D7_10K' },
            { id: lower.id, name: '3d7_10k' },
          ],
        },
      ])
    })

    it('lists Collections of one type whose names differ only by case or surrounding spaces', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'ShelfCase', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocCase', storageTypeId: String(storageType.id), canContainCollections: true })
      const plateA = await createTestMicronixPlate(ctx.db, { name: 'EXVIVO-27', locationId: loc.id })
      const plateB = await createTestMicronixPlate(ctx.db, { name: 'EXVIVO-27 ', locationId: loc.id })
      await createTestCryovialBox(ctx.db, { name: 'exvivo-27', locationId: loc.id })
      const boxA = await createTestBox(ctx.db, { name: 'Box-1', locationId: loc.id })
      const boxB = await createTestBox(ctx.db, { name: 'BOX-1', locationId: loc.id })
      const bag = await createTestBag(ctx.db, { name: 'Bag-1', locationId: loc.id })
      // Two sheets with the same spelling in one bag are allowed (migration 006), so they are not listed.
      await createTestSheet(ctx.db, { name: 'S1', bagId: bag.id })
      await createTestSheet(ctx.db, { name: 'S1', bagId: bag.id })
      const sheetA = await createTestSheet(ctx.db, { name: 'Sheet-2', boxId: boxA.id })
      const sheetB = await createTestSheet(ctx.db, { name: 'sheet-2', boxId: boxA.id })
      await createTestSheet(ctx.db, { name: 'SHEET-2', boxId: boxB.id })

      expect(await report('caseVariantCollectionNames')).toEqual([
        { type: 'micronix_plate', collections: [{ id: plateA.id, name: 'EXVIVO-27' }, { id: plateB.id, name: 'EXVIVO-27 ' }] },
        { type: 'box', collections: [{ id: boxA.id, name: 'Box-1' }, { id: boxB.id, name: 'BOX-1' }] },
        { type: 'sheet', parent: { type: 'box', id: boxA.id }, collections: [{ id: sheetA.id, name: 'Sheet-2' }, { id: sheetB.id, name: 'sheet-2' }] },
      ])
    })

    it('lists Containers whose Container type their Specimen type does not allow', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'ShelfAllow', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocAllow', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlateAllow', locationId: loc.id })
      const cvBox = await createTestCryovialBox(ctx.db, { name: 'BoxAllow', locationId: loc.id })
      const box1 = await createTestBox(ctx.db, { name: 'PaperBoxAllow', locationId: loc.id })
      const sheet1 = await createTestSheet(ctx.db, { name: 'SheetAllow', boxId: box1.id })
      const antibody = await createTestSpecimenType(ctx.db, { name: 'Polyclonal Ab' })
      const dbs = await createTestSpecimenType(ctx.db, { name: 'DBS Allow' })
      await createTestSpecimenTypeContainerType(ctx.db, { specimenTypeId: dbs.id, containerType: 'paper' })
      await createTestSpecimenTypeContainerType(ctx.db, { specimenTypeId: dbs.id, containerType: 'cryovial_tube' })
      const unit = await createTestUnit(ctx.db, { symbol: 'uL-allow', name: 'microliter', category: 'volume' })
      const abSpecimen = await createTestSpecimen(ctx.db, antibody.id)
      const dbsSpecimen = await createTestSpecimen(ctx.db, dbs.id)
      const abTube = await createTestStorageContainer(ctx.db, { specimenId: abSpecimen.id, unitId: unit.id })
      await createTestMicronixTube(ctx.db, { containerId: abTube.id, collectionId: plate.id, barcode: 'AB-1', position: null })
      const dbsTube = await createTestStorageContainer(ctx.db, { specimenId: dbsSpecimen.id, unitId: unit.id })
      await createTestMicronixTube(ctx.db, { containerId: dbsTube.id, collectionId: plate.id, barcode: 'DBS-1', position: null })
      const dbsCryo = await createTestStorageContainer(ctx.db, { specimenId: dbsSpecimen.id, unitId: unit.id })
      await createTestCryovialTube(ctx.db, { containerId: dbsCryo.id, collectionId: cvBox.id, barcode: 'DBS-2', position: null })
      const dbsPaper = await createTestStorageContainer(ctx.db, { specimenId: dbsSpecimen.id, unitId: unit.id })
      await createTestPaper(ctx.db, { containerId: dbsPaper.id, sheetId: sheet1.id })

      expect(await report('containersInDisallowedContainerType')).toEqual([
        { id: abTube.id, containerType: 'micronix_tube', specimenId: abSpecimen.id, specimenTypeId: antibody.id, specimenTypeName: 'Polyclonal Ab' },
        { id: dbsTube.id, containerType: 'micronix_tube', specimenId: dbsSpecimen.id, specimenTypeId: dbs.id, specimenTypeName: 'DBS Allow' },
      ])
    })

    it('lists Containers commented exhausted that still have remaining quantity', async () => {
      const specType = await createTestSpecimenType(ctx.db, { name: 'STExhausted' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL-ex', name: 'microliter', category: 'volume' })
      const container = async (comment: string | null, remaining: number) => {
        const row = await createTestStorageContainer(ctx.db, { specimenId: spec.id, unitId: unit.id })
        await ctx.db.update(storageContainer).set({ comment, remainingQuantity: remaining }).where(eq(storageContainer.id, row.id))
        return row.id
      }
      const plain = await container('exhausted', 1)
      const tagged = await container('Z20329; Exhausted', 0.25)
      await container('exhausted', 0)
      await container('in use', 1)
      await container(null, 1)

      expect(await report('exhaustedContainersWithRemainingQuantity')).toEqual([
        { id: plain, comment: 'exhausted', remainingQuantity: 1 },
        { id: tagged, comment: 'Z20329; Exhausted', remainingQuantity: 0.25 },
      ])
    })

    it('lists Specimens on a known placeholder collection date', async () => {
      const specType = await createTestSpecimenType(ctx.db, { name: 'STPlaceholder' })
      const ids: number[] = []
      for (const date of ['1970-01-01', '1999-09-09', '1899-12-30', '1111-01-01']) {
        ids.push((await createTestSpecimen(ctx.db, specType.id, { collectionDate: date })).id)
      }
      await createTestSpecimen(ctx.db, specType.id, { collectionDate: '1970-01-02' })
      await createTestSpecimen(ctx.db, specType.id)

      expect(await report('specimensWithPlaceholderCollectionDate')).toEqual([
        { id: ids[0], collectionDate: '1970-01-01' },
        { id: ids[1], collectionDate: '1999-09-09' },
        { id: ids[2], collectionDate: '1899-12-30' },
        { id: ids[3], collectionDate: '1111-01-01' },
      ])
    })

    it('lists Specimens whose collection date is after today', async () => {
      const specType = await createTestSpecimenType(ctx.db, { name: 'STFuture' })
      const future = await createTestSpecimen(ctx.db, specType.id, { collectionDate: '2073-02-08' })
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
      const next = await createTestSpecimen(ctx.db, specType.id, { collectionDate: tomorrowIso })
      const today = new Date()
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      await createTestSpecimen(ctx.db, specType.id, { collectionDate: todayIso })
      await createTestSpecimen(ctx.db, specType.id, { collectionDate: '2020-01-01' })

      expect(await report('specimensWithFutureCollectionDate')).toEqual([
        { id: future.id, collectionDate: '2073-02-08' },
        { id: next.id, collectionDate: tomorrowIso },
      ])
    })

    it('lists Containers whose stored position fails the Grid position rule, and no valid or missing ones', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'ShelfBadPos', description: '' })
      const loc = await createTestLocation(ctx.db, { name: 'LocBadPos', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlateBadPos', locationId: loc.id })
      const cvBox = await createTestCryovialBox(ctx.db, { name: 'BoxBadPos', locationId: loc.id })
      const specType = await createTestSpecimenType(ctx.db, { name: 'STBadPos' })
      const spec = await createTestSpecimen(ctx.db, specType.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL-badpos', name: 'microliter', category: 'volume' })
      const newContainer = async () => (await createTestStorageContainer(ctx.db, { specimenId: spec.id, unitId: unit.id })).id

      const ids: Record<string, number> = {}
      for (const [barcode, position] of [
        ['MX-OK', 'H12'],
        ['MX-NULL', null],
        ['MX-BARCODE', 'A1145854300'],
        ['MX-UNPADDED', 'A1'],
        ['MX-OUTSIDE', 'J10'],
      ] as const) {
        ids[barcode] = await newContainer()
        await createTestMicronixTube(ctx.db, { containerId: ids[barcode]!, collectionId: plate.id, barcode, position })
      }
      for (const [barcode, position] of [
        ['CV-OK', 'J10'],
        ['CV-DASH', '--A01'],
        ['CV-NA', 'NA01'],
      ] as const) {
        ids[barcode] = await newContainer()
        await createTestCryovialTube(ctx.db, { containerId: ids[barcode]!, collectionId: cvBox.id, barcode, position })
      }

      const res = await ctx.request('/api/admin/data-audit/integrity-report', { method: 'GET' })

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        containersWithInvalidGridPosition: Array<{ id: number; containerType: string; collectionId: number; position: string }>
      }
      const byId = (a: { id: number }, b: { id: number }) => a.id - b.id
      expect([...data.containersWithInvalidGridPosition].sort(byId)).toEqual(
        [
          { id: ids['MX-BARCODE']!, containerType: 'micronix_tube', collectionId: plate.id, position: 'A1145854300' },
          { id: ids['MX-UNPADDED']!, containerType: 'micronix_tube', collectionId: plate.id, position: 'A1' },
          { id: ids['MX-OUTSIDE']!, containerType: 'micronix_tube', collectionId: plate.id, position: 'J10' },
          { id: ids['CV-DASH']!, containerType: 'cryovial_tube', collectionId: cvBox.id, position: '--A01' },
          { id: ids['CV-NA']!, containerType: 'cryovial_tube', collectionId: cvBox.id, position: 'NA01' },
        ].sort(byId),
      )
    })
  })
})
