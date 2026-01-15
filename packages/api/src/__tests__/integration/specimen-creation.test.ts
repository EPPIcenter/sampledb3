import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient } from '../helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/db-setup'
import { 
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestLocation,
  createTestStorageType,
} from '../helpers/factories'
import { micronixPlate, specimenTypeContainerType } from '../../db/schema'
import type { Database } from '../../db/client'
import { createSpecimensRoutes } from '../../routes/specimens'

describe('Specimen Creation Integration Tests', () => {
  let testDb: Database
  let sqlite: any
  let client: ReturnType<typeof createTestClient>

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    const app = new (await import('hono')).Hono()
    // Use factory pattern with test database
    const specimensRoutes = createSpecimensRoutes(testDb)
    app.route('/api/specimens', specimensRoutes)
    client = createTestClient(app)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('should create a specimen with subject source', async () => {
    // Setup: Create study, subject, and specimen type
    const study = await createTestStudy(testDb, {
      title: 'Test Study',
      shortCode: 'TEST001',
    })
    const subject = await createTestStudySubject(testDb, {
      studyId: study.id,
      name: 'Subject 1',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })

    // Create specimen using RPC client
    const response = await (client as any).api.specimens.$post({
      json: {
        sourceType: 'subject',
        sourceId: subject.id,
        specimenTypeId: specimenType.id,
        collectionDate: '2024-01-01',
      },
    })

    expect(response.status).toBe(201)
    const data = await response.json() as any
    expect(data).toHaveProperty('specimen')
    expect(data.specimen.studySubjectId).toBe(subject.id)
    expect(data.specimen.specimenTypeId).toBe(specimenType.id)
  })

  it('should create a specimen with container', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Test Study',
      shortCode: 'TEST002',
    })
    const subject = await createTestStudySubject(testDb, {
      studyId: study.id,
      name: 'Subject 2',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    
    // Configure allowed container type for specimen type
    await testDb.insert(specimenTypeContainerType).values({
      specimenTypeId: specimenType.id,
      containerType: 'micronix_tube',
    })
    
    // Create location and micronix plate (collection) required for container creation
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, { 
      name: 'Test Location',
      storageTypeId: storageType.id.toString(),
    })
    const [plate] = await testDb.insert(micronixPlate).values({
      locationId: location.id,
      name: 'Test Plate',
      barcode: 'PLATE001',
    }).returning()

    const response = await (client as any).api.specimens.$post({
      json: {
        sourceType: 'subject',
        sourceId: subject.id,
        specimenTypeId: specimenType.id,
        collectionDate: '2024-01-01',
        container: {
          containerType: 'micronix_tube',
          collectionName: plate.name,
          barcode: 'TEST001',
        },
      },
    })

    if (response.status !== 201) {
      const errorData = await response.json() as any
      console.error('Specimen creation with container failed:', JSON.stringify(errorData, null, 2))
    }
    expect(response.status).toBe(201)
    const data = await response.json() as any
    expect(data).toHaveProperty('specimen')
    expect(data).toHaveProperty('container')
    expect(data.container).toHaveProperty('containerId')
  })
})
