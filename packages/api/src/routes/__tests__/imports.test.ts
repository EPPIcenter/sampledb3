import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createImportsRoutes } from '../imports'
import {
  createTestStudy,
  createTestSpecimenType,
  createTestLocation,
  createTestStorageType,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { studySubject, specimen, specimenTypeContainerType, containerTypeUnit, micronixPlate, cryovialBox, settings, storageContainer } from '../../db/schema'
import { setContainerDefaults } from '../../lib/settings'
import { eq } from 'drizzle-orm'

describe('Imports API', () => {
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
        app.route('/api/imports', createImportsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('POST /api/imports/derivations-csv', () => {
    it('returns 400 with invalid body (empty csv)', async () => {
      const res = await ctx.request('/api/imports/derivations-csv', {
        method: 'POST',
        json: { csv: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/imports/derivations-csv', {
        method: 'POST',
        json: { csv: 'parent_container_id,container_type\n1,micronix_tube' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/imports/derivations-csv/validate', () => {
    it('returns 400 with invalid body (empty csv)', async () => {
      const res = await ctx.request('/api/imports/derivations-csv/validate', {
        method: 'POST',
        json: { csv: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/imports/derivations-csv/validate', {
        method: 'POST',
        json: { csv: 'header' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/imports/bulk-combined', () => {
    it('full_file mode rolls back all data when any subject is invalid', async () => {
      await createTestStudy(ctx.db, { title: 'Import Study', shortCode: 'IMPBULK' })
      await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const beforeSubjects = await ctx.db.select().from(studySubject)
      const beforeSpecimens = await ctx.db.select().from(specimen)

      const res = await ctx.request('/api/imports/bulk-combined', {
        method: 'POST',
        json: {
          studyShortCode: 'IMPBULK',
          atomicMode: 'full_file',
          subjects: [
            {
              subjectName: 'SUBJ-OK',
              specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-01' }],
            },
            {
              subjectName: 'SUBJ-BAD',
              specimens: [{ specimenTypeName: 'Missing Type', collectionDate: '2025-01-02' }],
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const afterSubjects = await ctx.db.select().from(studySubject)
      const afterSpecimens = await ctx.db.select().from(specimen)
      expect(afterSubjects.length).toBe(beforeSubjects.length)
      expect(afterSpecimens.length).toBe(beforeSpecimens.length)
    })

    it('per_subject mode allows partial success and returns indexed errors', async () => {
      await createTestStudy(ctx.db, { title: 'Import Study2', shortCode: 'IMPBULK2' })
      await createTestSpecimenType(ctx.db, { name: 'Plasma' })

      const res = await ctx.request('/api/imports/bulk-combined', {
        method: 'POST',
        json: {
          studyShortCode: 'IMPBULK2',
          atomicMode: 'per_subject',
          subjects: [
            {
              subjectName: 'PARTIAL-OK',
              specimens: [{ specimenTypeName: 'Plasma', collectionDate: '2025-03-01' }],
            },
            {
              subjectName: 'PARTIAL-BAD',
              specimens: [{ specimenTypeName: 'Unknown Specimen', collectionDate: '2025-03-02' }],
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = (await res.json()) as { results: Array<{ subject: { name: string } }>; errors?: Array<{ index: number; error: string }> }
      expect(data.results).toHaveLength(1)
      expect(data.results[0].subject.name).toBe('PARTIAL-OK')
      expect(data.errors).toBeDefined()
      expect(data.errors?.[0]?.index).toBe(1)

      const persisted = await ctx.db
        .select()
        .from(studySubject)
      expect(persisted.find((s) => s.name === 'PARTIAL-OK')).toBeDefined()
      expect(persisted.find((s) => s.name === 'PARTIAL-BAD')).toBeUndefined()
    })

    it('returns 400 when createCollections specifies a location that cannot contain collections', async () => {
      await createTestStudy(ctx.db, { title: 'Location Check Study', shortCode: 'LOCCHECK' })
      await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      const noCollLoc = await createTestLocation(ctx.db, {
        name: 'No Collections Here',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })

      const res = await ctx.request('/api/imports/bulk-combined', {
        method: 'POST',
        json: {
          studyShortCode: 'LOCCHECK',
          atomicMode: 'full_file',
          createCollections: [
            { type: 'micronix_plate', name: 'Plate1', locationId: noCollLoc.id },
          ],
          subjects: [
            {
              subjectName: 'SUBJ1',
              specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-01' }],
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toContain('cannot contain collections')

      const plates = await ctx.db.select().from(micronixPlate).where(eq(micronixPlate.name, 'Plate1'))
      expect(plates.length).toBe(0)
    })

    it('returns 400 when specimen container collectionLocationId points to a location that cannot contain collections', async () => {
      await createTestStudy(ctx.db, { title: 'Inline Loc Check Study', shortCode: 'INLINELOC' })
      const testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      const noCollLoc = await createTestLocation(ctx.db, {
        name: 'No Collections',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })
      const testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'cryovial_tube',
      })
      await ctx.db.insert(containerTypeUnit).values({ containerType: 'cryovial_tube', unitId: testUnit.id })
      await ctx.db.insert(settings).values({
        key: 'container_defaults',
        userId: null,
        value: {
          cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        },
      })

      const res = await ctx.request('/api/imports/bulk-combined', {
        method: 'POST',
        json: {
          studyShortCode: 'INLINELOC',
          atomicMode: 'full_file',
          subjects: [
            {
              subjectName: 'SUBJ1',
              specimens: [
                {
                  specimenTypeName: 'Whole Blood',
                  collectionDate: '2025-01-01',
                  container: {
                    containerType: 'cryovial_tube',
                    collectionName: 'NewBox',
                    collectionLocationId: noCollLoc.id,
                    barcode: 'BC1',
                    position: 'A01',
                  },
                },
              ],
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toContain('cannot contain collections')

      const boxes = await ctx.db.select().from(cryovialBox).where(eq(cryovialBox.name, 'NewBox'))
      expect(boxes.length).toBe(0)
    })

    it('uses default unit for container when unitId is omitted in payload', async () => {
      await createTestStudy(ctx.db, { title: 'Unit Default Study', shortCode: 'UNITDEF' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(ctx.db, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await ctx.db.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
      })
      await ctx.db.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: testUnit.id })
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      const loc = await createTestLocation(ctx.db, {
        name: 'LocUnit',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })

      const res = await ctx.request('/api/imports/bulk-combined', {
        method: 'POST',
        json: {
          studyShortCode: 'UNITDEF',
          atomicMode: 'full_file',
          createCollections: [{ type: 'micronix_plate', name: 'PlateUnit', locationId: loc.id }],
          subjects: [
            {
              subjectName: 'SUBJ1',
              specimens: [
                {
                  specimenTypeName: 'Whole Blood',
                  collectionDate: '2025-01-01',
                  container: {
                    containerType: 'micronix_tube',
                    collectionName: 'PlateUnit',
                    collectionLocationId: loc.id,
                    barcode: 'BC1',
                    position: 'A01',
                    // unitId deliberately omitted - backend should use default
                  },
                },
              ],
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = (await res.json()) as { results: Array<{ specimens: Array<{ containerId?: number }> }> }
      const containerId = data.results[0].specimens[0].containerId
      expect(containerId).toBeDefined()
      const created = await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, containerId!)).get()
      expect(created).toBeDefined()
      expect(created!.unitId).toBe(testUnit.id)
    })
  })

  describe('POST /api/imports/bulk-combined/validate', () => {
    it('returns valid: true for a valid payload (no containers)', async () => {
      await createTestStudy(ctx.db, { title: 'Validate Study', shortCode: 'VAL' })
      await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const res = await ctx.request('/api/imports/bulk-combined/validate', {
        method: 'POST',
        json: {
          studyShortCode: 'VAL',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-01' }] },
            { subjectName: 'S2', specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-02' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(true)
      expect(data.errors).toHaveLength(0)
    })

    it('returns valid: false and errors when study does not exist', async () => {
      const res = await ctx.request('/api/imports/bulk-combined/validate', {
        method: 'POST',
        json: {
          studyShortCode: 'NOSTUDY',
          atomicMode: 'full_file',
          subjects: [{ subjectName: 'S1', specimens: [{ specimenTypeName: 'Any', collectionDate: '2025-01-01' }] }],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.length).toBeGreaterThan(0)
      expect(data.errors.some((e) => e.message.toLowerCase().includes('study') || e.message.includes('not found'))).toBe(true)
    })

    it('returns valid: false when specimen type is not found', async () => {
      await createTestStudy(ctx.db, { title: 'Val Study', shortCode: 'VAL2' })
      const res = await ctx.request('/api/imports/bulk-combined/validate', {
        method: 'POST',
        json: {
          studyShortCode: 'VAL2',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Nonexistent Type', collectionDate: '2025-01-01' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.includes('Nonexistent Type') || e.message.includes('not found'))).toBe(true)
    })

    it('returns valid: false when createCollections location cannot contain collections', async () => {
      await createTestStudy(ctx.db, { title: 'Val Loc', shortCode: 'VALLOC' })
      await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      const noCollLoc = await createTestLocation(ctx.db, {
        name: 'No Coll',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })
      const res = await ctx.request('/api/imports/bulk-combined/validate', {
        method: 'POST',
        json: {
          studyShortCode: 'VALLOC',
          atomicMode: 'full_file',
          createCollections: [{ type: 'micronix_plate', name: 'P1', locationId: noCollLoc.id }],
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Blood', collectionDate: '2025-01-01' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.includes('cannot contain collections'))).toBe(true)
    })

    it('returns valid: false when collection date is invalid (future)', async () => {
      await createTestStudy(ctx.db, { title: 'Date Study', shortCode: 'DATED' })
      await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const res = await ctx.request('/api/imports/bulk-combined/validate', {
        method: 'POST',
        json: {
          studyShortCode: 'DATED',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Blood', collectionDate: '2030-01-01' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.toLowerCase().includes('date') || e.message.toLowerCase().includes('future'))).toBe(true)
    })
  })
})
