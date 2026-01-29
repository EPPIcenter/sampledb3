import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, loginAndGetCookie, createAuthenticatedClientWrapper, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
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

describe('Subjects with Specimens API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: any
  let testStudy: any
  let testSpecimenType: any
  let testLocation: any
  let testUnit: any
  let testStorageType: any
  let cookieHeader: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Create required test data
    testStudy = await createTestStudy(testDb, {
      title: 'Test Study',
      shortCode: 'TEST01',
    })

    testSpecimenType = await createTestSpecimenType(testDb, {
      name: 'Whole Blood',
    })

    // Create storage type for location (required for root locations)
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

    // Set up container type associations (required for validation)
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

    // Set up default units for container types (required for container creation)
    // This is typically done in setup, but for tests we need to ensure units exist
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

    // Set up container defaults (required for getDefaultUnit, etc.)
    // Insert directly into test database
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

    // Setup required settings for auth to work
    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    // Create a test user for authentication
    await createTestUser(testDb, {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'member',
    })

    // Create subjects routes with test database
    const subjectsRoutes = createSubjectsRoutes(testDb)
    const authRoutes = createAuthRoutes(testDb, testDb)
    app = new Hono()
    app.route('/api/subjects', subjectsRoutes)
    app.route('/api/auth', authRoutes)
    
    // Login to get session cookie
    cookieHeader = await loginAndGetCookie(app, 'test@example.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  // Helper to create authenticated client - available to all tests
  function createAuthClient() {
    const baseClient = createTestClient(app)
    return createAuthenticatedClientWrapper(baseClient, cookieHeader)
  }

  describe('Creating New Subjects with Specimens and Containers', () => {

    it('should create new subject with cryovial tube container', async () => {
      // Create cryovial box collection
      const now = new Date().toISOString()
      const [cryovialBoxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-001',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-001',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-15',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-001',
                position: 'A01',
              },
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
      const now = new Date().toISOString()
      const [micronixPlateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-001',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-002',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'micronix_tube',
                collectionName: 'PLATE-001',
                barcode: 'MTX-12345',
                position: 'B02',
              },
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
      const now = new Date().toISOString()
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

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-003',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'paper',
                collectionName: 'BOX-002',
                label: 'Sheet-1',
                position: 'A1',
              },
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
    })

    it('should create new subject with static well container', async () => {
      // Create micronix plate
      const now = new Date().toISOString()
      const [plateRecord] = await testDb
        .insert(micronixPlate)
        .values({
          name: 'PLATE-002',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-004',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'static_well',
                collectionName: 'PLATE-002',
                position: 'C03',
              },
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
      const now = new Date().toISOString()
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

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-005',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-15',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-003',
                position: 'A01',
              },
            },
            {
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-01-16',
              container: {
                containerType: 'micronix_tube',
                collectionName: 'PLATE-003',
                barcode: 'MTX-11111',
                position: 'B02',
              },
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
      const now = new Date().toISOString()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-004',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'EXISTING-SUBJ',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-004',
                position: 'A01',
              },
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

    it('should add multiple specimens to existing subject', async () => {
      // Create existing subject with 2 specimens
      const existingSubject = await createTestStudySubject(testDb, {
        studyId: testStudy.id,
        name: 'SUBJ-WITH-SPECS',
      })

      await testDb.insert(specimen).values({
        studySubjectId: existingSubject.id,
        specimenTypeId: testSpecimenType.id,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })

      await testDb.insert(specimen).values({
        studySubjectId: existingSubject.id,
        specimenTypeId: testSpecimenType.id,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })

      // Create collection
      const now = new Date().toISOString()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-005',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-WITH-SPECS',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-005',
                position: 'A01',
              },
            },
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-005',
                position: 'A02',
              },
            },
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-005',
                position: 'A03',
              },
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.summary.specimensCreated).toBe(3)
      expect(data.summary.containersCreated).toBe(3)

      // Verify all specimens exist
      const allSpecimens = await testDb
        .select()
        .from(specimen)
        .where(eq(specimen.studySubjectId, existingSubject.id))
      expect(allSpecimens.length).toBe(5) // 2 existing + 3 new
    })
  })

  describe('Transaction Rollback Tests', () => {
    it('should rollback on invalid specimen type', async () => {
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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

    it('should rollback on container creation failure', async () => {
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERROR-2',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'NON-EXISTENT-BOX',
                // No collectionLocationId - should fail
              },
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
      const now = new Date().toISOString()
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
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'micronix_tube',
                collectionName: 'PLATE-DUP',
                barcode: 'MTX-DUPLICATE', // Duplicate!
                position: 'A02',
              },
            },
          ],
        },
      })

      expect(res.status).toBe(500) // Transaction error
      
      // Verify new subject was not created
      const subjects = await testDb
        .select()
        .from(studySubject)
        .where(eq(studySubject.name, 'SUBJ-NEW'))
      expect(subjects.length).toBe(0)
    })
  })

  describe('Collection Handling Tests', () => {
    it('should use existing collection', async () => {
      // Create existing collection
      const now = new Date().toISOString()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'EXISTING-BOX',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-EXISTING-COLL',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'EXISTING-BOX',
                position: 'A01',
              },
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
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-NEW-COLL',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'NEW-BOX',
                collectionLocationId: testLocation.id,
                position: 'A01',
              },
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
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-MISSING-COLL',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'MISSING-BOX',
                // No collectionLocationId
              },
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
      const res1 = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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

      const res2 = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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
      const now = new Date().toISOString()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-RESPONSE',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-RESPONSE',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-RESPONSE',
                position: 'A01',
              },
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
      const now = new Date().toISOString()
      const [boxRecord] = await testDb
        .insert(cryovialBox)
        .values({
          name: 'BOX-SUMMARY',
          locationId: testLocation.id,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-SUMMARY',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-SUMMARY',
                position: 'A01',
              },
            },
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BOX-SUMMARY',
                position: 'A02',
              },
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json() as SubjectWithSpecimensResponse
      expect(data.summary.subjectsCreated).toBe(1)
      expect(data.summary.subjectsUpdated).toBe(0)
      expect(data.summary.specimensCreated).toBe(2)
      expect(data.summary.containersCreated).toBe(2)
    })
  })

  describe('Validation Error Tests', () => {
    it('should return 400 for invalid study short code', async () => {
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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
      const res1 = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERR-1',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'cryovial_tube',
                // Missing collectionName
              },
            },
          ],
        },
      })
      expect(res1.status).toBe(400)

      // Test micronix without barcode
      const res2 = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERR-2',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'micronix_tube',
                collectionName: 'PLATE',
                // Missing barcode
              },
            },
          ],
        },
      })
      expect(res2.status).toBe(400)

      // Test paper without label
      const res3 = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'TEST01',
          subjectName: 'SUBJ-ERR-3',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'paper',
                collectionName: 'BOX',
                // Missing label
              },
            },
          ],
        },
      })
      expect(res3.status).toBe(400)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty specimens array', async () => {
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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
      const res = await authenticatedRequest(app, '/api/subjects/with-specimens', {
        method: 'POST',
        cookie: cookieHeader,
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

