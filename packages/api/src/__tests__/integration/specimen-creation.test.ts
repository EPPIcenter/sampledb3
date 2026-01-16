import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient, loginAndGetCookie, createAuthenticatedClientWrapper, authenticatedRequest } from '../helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/db-setup'
import { 
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestLocation,
  createTestStorageType,
} from '../helpers/factories'
import { micronixPlate, specimenTypeContainerType, unit, containerTypeUnit } from '../../db/schema'
import type { Database } from '../../db/client'
import { createSpecimensRoutes } from '../../routes/specimens'
import { createAuthRoutes } from '../../routes/auth'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../helpers/auth-helpers'
import { setContainerDefaults } from '../../lib/settings'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

describe('Specimen Creation Integration Tests', () => {
  let testDb: Database
  let sqlite: any
  let client: ReturnType<typeof createTestClient>
  let cookieHeader: string
  let app: Hono

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Setup required units for container defaults
    let itemsUnit = await testDb.select().from(unit).where(eq(unit.symbol, 'items')).get()
    if (!itemsUnit) {
      const [inserted] = await testDb.insert(unit).values({
        symbol: 'items',
        name: 'Items',
        category: 'count',
      }).returning()
      itemsUnit = inserted
    }
    let spotsUnit = await testDb.select().from(unit).where(eq(unit.symbol, 'spots')).get()
    if (!spotsUnit) {
      const [inserted] = await testDb.insert(unit).values({
        symbol: 'spots',
        name: 'Spots',
        category: 'count',
      }).returning()
      spotsUnit = inserted
    }

    // Setup container type / unit relationships
    await testDb.insert(containerTypeUnit).values({
      containerType: 'micronix_tube',
      unitId: itemsUnit.id as number,
    }).onConflictDoNothing()
    await testDb.insert(containerTypeUnit).values({
      containerType: 'cryovial_tube',
      unitId: itemsUnit.id as number,
    }).onConflictDoNothing()
    await testDb.insert(containerTypeUnit).values({
      containerType: 'paper',
      unitId: spotsUnit.id as number,
    }).onConflictDoNothing()
    await testDb.insert(containerTypeUnit).values({
      containerType: 'static_well',
      unitId: spotsUnit.id as number,
    }).onConflictDoNothing()

    // Setup required settings for container creation
    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)
    await setContainerDefaults(testDb, {
      micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
      cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
      paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
      static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
    })

    // Create a test user for authentication
    await createTestUser(testDb, {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'member',
    })

    app = new Hono()
    // Use factory pattern with test database
    const specimensRoutes = createSpecimensRoutes(testDb)
    const authRoutes = createAuthRoutes(testDb, testDb)
    app.route('/api/specimens', specimensRoutes)
    app.route('/api/auth', authRoutes)
    
    // Login to get session cookie
    cookieHeader = await loginAndGetCookie(app, 'test@example.com', 'password123')
    
    // Create authenticated client
    const baseClient = createTestClient(app)
    client = createAuthenticatedClientWrapper(baseClient, cookieHeader)
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

    // Create specimen using authenticated request
    const response = await authenticatedRequest(app, '/api/specimens', {
      method: 'POST',
      cookie: cookieHeader,
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

    const response = await authenticatedRequest(app, '/api/specimens', {
      method: 'POST',
      cookie: cookieHeader,
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
