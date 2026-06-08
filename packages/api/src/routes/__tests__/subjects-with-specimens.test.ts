import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient, createAuthenticatedClientWrapper, authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestLocation,
  createTestUnit,
  createTestStorageType,
} from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { eq } from 'drizzle-orm'
import {
  studySubject,
  specimen,
  storageContainer,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
  micronixPlate,
  cryovialBox,
  box,
  sheet,
  specimenTypeContainerType,
  settings,
} from '../../db/schema'
import { createSubjectsRoutes } from '../subjects'
import { utcNow } from '../../lib/datetime'

interface SubjectWithSpecimensResponse {
  subject: {
    id: number
    name: string
    [key: string]: unknown
  }
  subjectCreated: boolean
  specimens: Array<{
    id: number
    containerCreated: boolean
    containerId?: number
    [key: string]: unknown
  }>
  summary: {
    subjectsCreated: number
    subjectsUpdated: number
    specimensCreated: number
    containersCreated: number
  }
}

interface ErrorResponse {
  error: string
  specimenIndex?: number
  [key: string]: unknown
}


function cryovialContainer(
  name: string,
  position: string,
  opts?: { locationId?: number }
) {
  return {
    containerType: 'cryovial_tube' as const,
    collection: {
      type: 'cryovial_box' as const,
      name,
      position,
      ...(opts?.locationId != null ? { locationId: opts.locationId } : {}),
    },
  }
}

function micronixContainer(
  name: string,
  barcode: string,
  position: string,
  opts?: { locationId?: number }
) {
  return {
    containerType: 'micronix_tube' as const,
    barcode,
    collection: {
      type: 'micronix_plate' as const,
      name,
      position,
      ...(opts?.locationId != null ? { locationId: opts.locationId } : {}),
    },
  }
}

function paperContainer(
  boxName: string,
  sheetName: string,
  opts?: { sublabel?: string; locationId?: number }
) {
  return {
    containerType: 'paper' as const,
    ...(opts?.sublabel ? { sublabel: opts.sublabel } : {}),
    collection: {
      type: 'sheet' as const,
      name: sheetName,
      parent: {
        type: 'box' as const,
        name: boxName,
        ...(opts?.locationId != null ? { locationId: opts.locationId } : {}),
      },
    },
  }
}

function cryovialContainerWithBarcode(name: string, barcode: string, position: string) {
  return {
    containerType: 'cryovial_tube' as const,
    barcode,
    collection: { type: 'cryovial_box' as const, name, position },
  }
}

function staticWellContainer(name: string, position: string, opts?: { locationId?: number }) {
  return {
    containerType: 'static_well' as const,
    collection: {
      type: 'micronix_plate' as const,
      name,
      position,
      ...(opts?.locationId != null ? { locationId: opts.locationId } : {}),
    },
  }
}

describe('Subjects with Specimens API', () => {
  let ctx: AuthenticatedRouteTestContext
  let testDb: Database
  let testStudy: any
  let testSpecimenType: any
  let testLocation: any
  let testUnit: any
  let testStorageType: any

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        role: 'member',
      },
      seed: async ({ db }) => {
        testDb = db

        testStudy = await createTestStudy(db, {
          title: 'Test Study',
          shortCode: 'TEST01',
        })

        testSpecimenType = await createTestSpecimenType(testDb, {
          name: 'Whole Blood',
        })

        testStorageType = await createTestStorageType(testDb, {
          name: 'Freezer',
          description: 'Test storage type',
        })

        testLocation = await createTestLocation(testDb, {
          name: 'Test Location',
          parentId: null,
          storageTypeId: String(testStorageType.id),
          canContainCollections: true,
        })

        testUnit = await createTestUnit(testDb, {
          symbol: 'uL',
          name: 'microliter',
          category: 'volume',
        })

        await testDb.insert(specimenTypeContainerType).values({
          specimenTypeId: testSpecimenType.id,
          containerType: 'cryovial_tube',
        })
        await testDb.insert(specimenTypeContainerType).values({
          specimenTypeId: testSpecimenType.id,
          containerType: 'micronix_tube',
        })
        await testDb.insert(specimenTypeContainerType).values({
          specimenTypeId: testSpecimenType.id,
          containerType: 'paper',
        })
        await testDb.insert(specimenTypeContainerType).values({
          specimenTypeId: testSpecimenType.id,
          containerType: 'static_well',
        })

        const containerTypeUnit = await import('../../db/schema').then(m => m.containerTypeUnit)
        await testDb.insert(containerTypeUnit).values({
          containerType: 'cryovial_tube',
          unitId: testUnit.id,
        })
        await testDb.insert(containerTypeUnit).values({
          containerType: 'micronix_tube',
          unitId: testUnit.id,
        })
        await testDb.insert(containerTypeUnit).values({
          containerType: 'paper',
          unitId: testUnit.id,
        })
        await testDb.insert(containerTypeUnit).values({
          containerType: 'static_well',
          unitId: testUnit.id,
        })

        await testDb.insert(settings).values({
          key: 'container_defaults',
          value: {
            micronix_tube: {
              totalQuantity: 1.0,
              remainingQuantity: 1.0,
              defaultUnitSymbol: 'uL',
            },
            cryovial_tube: {
              totalQuantity: 1.0,
              remainingQuantity: 1.0,
              defaultUnitSymbol: 'uL',
            },
            paper: {
              totalQuantity: 1.0,
              remainingQuantity: 1.0,
              defaultUnitSymbol: 'uL',
            },
            static_well: {
              totalQuantity: 1.0,
              remainingQuantity: 1.0,
              defaultUnitSymbol: 'uL',
            },
          } as any,
        })
      },
      mount: (app, { db }) => {
        app.route('/api/subjects', createSubjectsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  // Helper to create authenticated client - available to all tests
  function createAuthClient() {
    const baseClient = createTestClient(ctx.createRequestApp())
    return createAuthenticatedClientWrapper(baseClient, ctx.cookie)
  }

  describe('Creating New Subjects with Specimens and Containers', () => {

    it('should create new subject with cryovial tube container', async () => {
      // Create cryovial box collection
      const now = utcNow()
      const [cryovialBoxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-001',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-001',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-15',
              container: cryovialContainer('BOX-001', 'A01'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.subjectCreated).toBe(true)
      expect(data.subject.name).toBe('SUBJ-001')
      expect(data.specimens).toHaveLength(1)
      expect(data.specimens[0].containerCreated).toBe(true)
      expect(data.specimens[0].containerId).toBeDefined()
      expect(data.summary.subjectsCreated).toBe(1)
      expect(data.summary.containersCreated).toBe(1)

      // Verify container was created
      const container = await testDb
        .select()
        .from(cryovialTube)
        .where(eq(cryovialTube.id, data.specimens[0].containerId!))
        .get()
      expect(container).toBeDefined()
      expect(container?.collectionId).toBe(cryovialBoxRecord.id)
      expect(container?.position).toBe('A01')
    })

    it('should create new subject with micronix tube container', async () => {
      // Create micronix plate collection
      const now = utcNow()
      const [micronixPlateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-001',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-002',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-001', 'MTX-12345', 'B02'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.specimens[0].containerCreated).toBe(true)
      
      // Verify container
      const container = await testDb
        .select()
        .from(micronixTube)
        .where(eq(micronixTube.id, data.specimens[0].containerId!))
        .get()
      expect(container?.barcode).toBe('MTX-12345')
      expect(container?.position).toBe('B02')
      expect(container?.collectionId).toBe(micronixPlateRecord.id)
    })

    it('should create new subject with paper container', async () => {
      // Create box and sheet
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(box)
        .values({
          name: 'BOX-002',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [sheetRecord] = await testDb
        .insert(sheet)
        .values({
          name: 'Sheet-1',
          boxId: boxRecord.id,
          bagId: null,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-003',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: paperContainer('BOX-002', 'Sheet-1', { sublabel: 'Spot-A' }),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.specimens[0].containerCreated).toBe(true)
      
      // Verify container
      const container = await testDb
        .select()
        .from(paper)
        .where(eq(paper.id, data.specimens[0].containerId!))
        .get()
      expect(container?.sheetId).toBe(sheetRecord.id)
      expect(container?.sublabel).toBe('Spot-A')
    })

    it('should create new subject with static well container', async () => {
      // Create micronix plate
      const now = utcNow()
      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-002',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-004',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: staticWellContainer('PLATE-002', 'C03'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.specimens[0].containerCreated).toBe(true)
      
      // Verify container
      const container = await testDb
        .select()
        .from(staticWell)
        .where(eq(staticWell.id, data.specimens[0].containerId!))
        .get()
      expect(container?.collectionId).toBe(plateRecord.id)
      expect(container?.position).toBe('C03')
    })

    it('should create new subject with multiple specimens and containers', async () => {
      // Create collections
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-003',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-003',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-005',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-15',
              container: cryovialContainer('BOX-003', 'A01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-16',
              container: micronixContainer('PLATE-003', 'MTX-11111', 'B02'),
            },
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-17',
              // No container
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.specimens).toHaveLength(3)
      expect(data.specimens[0].containerCreated).toBe(true)
      expect(data.specimens[1].containerCreated).toBe(true)
      expect(data.specimens[2].containerCreated).toBe(false)
      expect(data.summary.containersCreated).toBe(2)
    })
  })

  describe('Adding to Existing Subjects', () => {
    it('should add specimens with containers to existing subject', async () => {
      // Create existing subject
      const existingSubject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'EXISTING-SUBJ',
      })

      // Create collection
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-004',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'EXISTING-SUBJ',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-004', 'A01'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.subjectCreated).toBe(false)
      expect(data.subject.id).toBe(existingSubject.id)
      expect(data.specimens[0].containerCreated).toBe(true)
    })

    it('should add multiple specimens to existing subject (get-or-create: one specimen, three containers)', async () => {
      // Create existing subject with one specimen (Whole Blood, no collection date)
      const existingSubject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-WITH-SPECS',
      })

      await testDb.insert(specimen).values({
        studySubjectId: existingSubject.id,
        specimenTypeId: testSpecimenType.id,
        created: utcNow(),
        lastUpdated: utcNow(),
      })

      // Create collection
      const now = utcNow()
      await testDb.insert(cryovialBox).values({
        name: 'BOX-005',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })

      // Same subject + type + no date: all three rows reuse the existing specimen, only containers are created
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-WITH-SPECS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-005', 'A01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-005', 'A02'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-005', 'A03'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.summary.specimensCreated).toBe(0)
      expect(data.summary.containersCreated).toBe(3)

      // One specimen total (existing one reused for all three container rows)
      const allSpecimens = await testDb
        .select()
        .from(specimen)
        .where(eq(specimen.studySubjectId, existingSubject.id))
      expect(allSpecimens.length).toBe(1)
    })
  })

  describe('Transaction Rollback Tests', () => {
    it('should rollback on invalid specimen type', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERROR',
          specimens: [
            {
              specimenTypeName: 'Non-existent Type',
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      
      // Verify no subject was created
      const subjects = await testDb
        .select()
        .from(studySubject)
        .where(eq(studySubject.name, 'SUBJ-ERROR'))
      expect(subjects.length).toBe(0)
    })

    it('rejects micronix tube without position', async () => {
      const now = utcNow()
      await testDb.insert(micronixPlate).values({
        name: 'PLATE-001',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NO-POS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: { containerType: 'micronix_tube' as const, barcode: 'MTX-NOPOS', collection: { type: 'micronix_plate' as const, name: 'PLATE-001' } },
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const body = await res.json() as ErrorResponse
      expect(body.error).toContain('Position')
      const subjects = await testDb.select().from(studySubject).where(eq(studySubject.name, 'SUBJ-NO-POS'))
      expect(subjects.length).toBe(0)
    })

    it('should rollback on container creation failure', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERROR-2',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('NON-EXISTENT-BOX', 'A01'),
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      
      // Verify nothing was created
      const subjects = await testDb
        .select()
        .from(studySubject)
        .where(eq(studySubject.name, 'SUBJ-ERROR-2'))
      expect(subjects.length).toBe(0)
    })

    it('should rollback on duplicate container barcode', async () => {
      // Create existing micronix tube with barcode
      const now = utcNow()
      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-DUP',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      // Create existing specimen and container
      const subject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-DUP',
      })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: testSpecimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: testUnit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plateRecord.id,
        barcode: 'MTX-DUPLICATE',
        position: 'A01',
      })

      // Try to create another with same barcode
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-DUP', 'MTX-DUPLICATE', 'A02'),
            },
          ],
        },
      })

      expect(res.status).toBe(400) // Barcode conflict returns validation error
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain("Barcode 'MTX-DUPLICATE' already exists")
      expect(data.specimenIndex).toBe(0)
      
      // Verify new subject was not created
      const subjects = await testDb
        .select()
        .from(studySubject)
        .where(eq(studySubject.name, 'SUBJ-NEW'))
      expect(subjects.length).toBe(0)
    })

    it('should return 400 for in-payload duplicate barcode', async () => {
      const now = utcNow()
      await testDb.insert(micronixPlate).values({
        name: 'PLATE-DUP-BARCODE',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-DUP-BARCODE',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-DUP-BARCODE', 'MTX-SAME', 'A01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-DUP-BARCODE', 'MTX-SAME', 'A02'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('used more than once')
      expect(data.error).toContain('MTX-SAME')
      expect(data.specimenIndex).toBe(1)
    })

    it('should return 400 for position already used in plate', async () => {
      const now = utcNow()
      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-POS',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const subject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-POS',
      })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: testSpecimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: testUnit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plateRecord.id,
        barcode: 'MTX-POS-EXISTING',
        position: 'B01',
      })

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-POS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-POS', 'MTX-POS-NEW', 'B01'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Position B01')
      expect(data.error).toContain('already used')
      expect(data.specimenIndex).toBe(0)
    })

    it('should return 400 for in-payload duplicate position', async () => {
      const now = utcNow()
      await testDb.insert(micronixPlate).values({
        name: 'PLATE-DUP-POS',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-DUP-POS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-DUP-POS', 'MTX-UNIQ-1', 'C01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: micronixContainer('PLATE-DUP-POS', 'MTX-UNIQ-2', 'C01'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('used more than once')
      expect(data.error).toContain('C01')
      expect(data.specimenIndex).toBe(1)
    })

    it('should return 400 for in-payload duplicate cryovial tube barcode', async () => {
      const now = utcNow()
      await testDb.insert(cryovialBox).values({
        name: 'BOX-CRYO-DUP-BARCODE',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-CRYO-DUP-BARCODE',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainerWithBarcode('BOX-CRYO-DUP-BARCODE', 'CRYO-SAME', 'A01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainerWithBarcode('BOX-CRYO-DUP-BARCODE', 'CRYO-SAME', 'A02'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('used more than once')
      expect(data.error).toContain('CRYO-SAME')
      expect(data.specimenIndex).toBe(1)
    })

    it('should return 400 for cryovial tube barcode already in DB', async () => {
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-CRYO-BARCODE',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const subject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-CRYO-BARCODE',
      })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: testSpecimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: testUnit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(cryovialTube).values({
        id: container.id,
        collectionId: boxRecord.id,
        barcode: 'CRYO-DUPLICATE',
        position: 'A01',
      })

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-CRYO',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainerWithBarcode('BOX-CRYO-BARCODE', 'CRYO-DUPLICATE', 'A02'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain("Barcode 'CRYO-DUPLICATE' already exists")
      expect(data.specimenIndex).toBe(0)
    })

    it('should return 400 for in-payload duplicate cryovial tube position', async () => {
      const now = utcNow()
      await testDb.insert(cryovialBox).values({
        name: 'BOX-CRYO-DUP-POS',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-CRYO-DUP-POS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-CRYO-DUP-POS', 'G07'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-CRYO-DUP-POS', 'G07'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('used more than once')
      expect(data.error).toContain('G07')
      expect(data.specimenIndex).toBe(1)
    })

    it('should return 400 for cryovial tube position already used in box', async () => {
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-CRYO-POS',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const subject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-CRYO-POS',
      })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: testSpecimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: testUnit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(cryovialTube).values({
        id: container.id,
        collectionId: boxRecord.id,
        barcode: null,
        position: 'D05',
      })

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-CRYO-POS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-CRYO-POS', 'D05'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Position D05')
      expect(data.error).toContain('already used')
      expect(data.error).toContain('box')
      expect(data.specimenIndex).toBe(0)
    })

    it('should return 400 for in-payload duplicate static well position', async () => {
      const now = utcNow()
      await testDb.insert(micronixPlate).values({
        name: 'PLATE-STATIC-DUP',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-STATIC-DUP-POS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: staticWellContainer('PLATE-STATIC-DUP', 'H12'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: staticWellContainer('PLATE-STATIC-DUP', 'H12'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('used more than once')
      expect(data.error).toContain('H12')
      expect(data.specimenIndex).toBe(1)
    })

    it('should return 400 for static well position already used in plate', async () => {
      const now = utcNow()
      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-STATIC',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const subject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-STATIC',
      })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: testSpecimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: testUnit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(staticWell).values({
        id: container.id,
        collectionId: plateRecord.id,
        position: 'E03',
      })

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-STATIC',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: staticWellContainer('PLATE-STATIC', 'E03'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Position E03')
      expect(data.error).toContain('already used')
      expect(data.error).toContain('plate')
      expect(data.specimenIndex).toBe(0)
    })

    it('should return 400 for static well conflicting with existing micronix tube position', async () => {
      const now = utcNow()
      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-MIXED',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const subject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-MIXED',
      })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: testSpecimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: testUnit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plateRecord.id,
        barcode: 'MTX-F01',
        position: 'F01',
      })

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-MIXED',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: staticWellContainer('PLATE-MIXED', 'F01'),
            },
          ],
        },
      })
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Position F01')
      expect(data.error).toContain('already used')
      expect(data.specimenIndex).toBe(0)
    })
  })

  describe('Collection Handling Tests', () => {
    it('should use existing collection', async () => {
      // Create existing collection
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'EXISTING-BOX',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-EXISTING-COLL',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('EXISTING-BOX', 'A01'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      
      // Verify container uses existing collection
      const container = await testDb
        .select()
        .from(cryovialTube)
        .where(eq(cryovialTube.id, data.specimens[0].containerId!))
        .get()
      expect(container?.collectionId).toBe(boxRecord.id)
    })

    it('should create collection if location provided', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-COLL',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('NEW-BOX', 'A01', { locationId: testLocation.id }),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      
      // Verify collection was created
      const collections = await testDb
        .select()
        .from(cryovialBox)
        .where(eq(cryovialBox.name, 'NEW-BOX'))
      expect(collections.length).toBe(1)
      expect(collections[0].locationId).toBe(testLocation.id)
    })

    it('should fail gracefully on missing collection without location', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-MISSING-COLL',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('MISSING-BOX', 'A01'),
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('not found')
    })
  })

  describe('Response Format Tests', () => {
    it('should include subjectCreated flag', async () => {
      // Test new subject
      const res1 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'NEW-SUBJ-FLAG',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
            },
          ],
        },
      })

      expect(res1.status).toBe(201)
      const data1 = await res1.json() as SubjectWithSpecimensResponse
      expect(data1.subjectCreated).toBe(true)

      // Test existing subject
      await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'EXISTING-SUBJ-FLAG',
      })

      const res2 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'EXISTING-SUBJ-FLAG',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
            },
          ],
        },
      })

      expect(res2.status).toBe(201)
      const data2 = await res2.json() as SubjectWithSpecimensResponse
      expect(data2.subjectCreated).toBe(false)
    })

    it('should include container information in response', async () => {
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-RESPONSE',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-RESPONSE',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-RESPONSE', 'A01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              // No container
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.specimens[0].containerCreated).toBe(true)
      expect(data.specimens[0].containerId).toBeDefined()
      expect(data.specimens[1].containerCreated).toBe(false)
      expect(data.specimens[1].containerId).toBeUndefined()
    })

    it('should include summary counts', async () => {
      const now = utcNow()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-SUMMARY',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-SUMMARY',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-SUMMARY', 'A01'),
            },
            {
              specimenTypeName: 'Whole Blood',
              container: cryovialContainer('BOX-SUMMARY', 'A02'),
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.summary.subjectsCreated).toBe(1)
      expect(data.summary.subjectsUpdated).toBe(0)
      // Same subject + type + no collection date: one specimen, two containers (get-or-create)
      expect(data.summary.specimensCreated).toBe(1)
      expect(data.summary.containersCreated).toBe(2)
    })

    it('should reuse existing specimen (get-or-create) and only create container on second call', async () => {
      const now = utcNow()
      await testDb.insert(cryovialBox).values({
        name: 'BOX-DEDUP',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })

      // First call: create subject + specimen with container
      const res1 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'DEDUP-SUBJ',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-15',
              container: cryovialContainer('BOX-DEDUP', 'A01'),
            },
          ],
        },
      })
      expect(res1.status).toBe(201)
      const data1 = (await res1.json()) as SubjectWithSpecimensResponse
      expect(data1.summary.specimensCreated).toBe(1)
      expect(data1.summary.containersCreated).toBe(1)
      const subjectId = data1.subject.id

      // Second call: same study, subject, type, collection date — reuse specimen, add container only
      const res2 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'DEDUP-SUBJ',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-15',
              container: cryovialContainer('BOX-DEDUP', 'A02'),
            },
          ],
        },
      })
      expect(res2.status).toBe(201)
      const data2 = (await res2.json()) as SubjectWithSpecimensResponse
      expect(data2.summary.specimensCreated).toBe(0)
      expect(data2.summary.containersCreated).toBe(1)

      // Subject should have exactly one specimen (not duplicated)
      const specimensForSubject = await testDb
        .select({ id: specimen.id })
        .from(specimen)
        .where(eq(specimen.studySubjectId, subjectId))
      expect(specimensForSubject).toHaveLength(1)
    })
  })

  describe('Validation Error Tests', () => {
    it('should return 400 for invalid study short code', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'INVALID',
          subjectName: 'SUBJ',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
            },
          ],
        },
      })

      expect(res.status).toBe(400)
    })

    it('should return 400 for invalid specimen type name', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ',
          specimens: [
            {
              specimenTypeName: 'Invalid Type',
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('not found')
      expect(data.specimenIndex).toBe(0)
    })

    it('should return 400 for missing required container fields', async () => {
      // Test cryovial without collection
      const res1 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERR-1',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: { containerType: 'cryovial_tube' as const },
            },
          ],
        },
      })
      expect(res1.status).toBe(400)

      // Test micronix without barcode
      const res2 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERR-2',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: { containerType: 'micronix_tube' as const, barcode: '', collection: { type: 'micronix_plate' as const, name: 'PLATE' } },
            },
          ],
        },
      })
      expect(res2.status).toBe(400)

      // Test paper without sheetName
      const res3 = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERR-3',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: { containerType: 'paper' as const, collection: { type: 'sheet' as const, parent: { type: 'box' as const, name: 'BOX' } } },
            },
          ],
        },
      })
      expect(res3.status).toBe(400)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty specimens array', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-EMPTY',
          specimens: [],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.subjectCreated).toBe(true)
      expect(data.specimens).toHaveLength(0)
      expect(data.summary.specimensCreated).toBe(0)
    })

    it('should handle specimens without containers', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NO-CONTAINERS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
            },
            {
              specimenTypeName: 'Whole Blood',
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.specimens).toHaveLength(2)
      expect(data.specimens[0].containerCreated).toBe(false)
      expect(data.specimens[1].containerCreated).toBe(false)
      expect(data.summary.containersCreated).toBe(0)
    })

    it('should handle subject name with whitespace', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          studyShortCode: 'TEST01',
          subjectName: '  SUBJ-WHITESPACE  ',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.subject.name).toBe('SUBJ-WHITESPACE') // Trimmed
    })
  })
})

