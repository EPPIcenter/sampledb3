import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
  type RouteTestContext,
} from '../helpers/authenticated-route-test'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestLocation,
  createTestStorageType,
} from '../helpers/factories'
import { micronixPlate, specimenTypeContainerType, unit, containerTypeUnit } from '../../db/schema'
import { createSpecimensRoutes } from '../../routes/specimens'
import { setContainerDefaults } from '../../lib/settings'
import { eq } from 'drizzle-orm'

async function seedSpecimenCreationFixtures({ db }: RouteTestContext) {

  let itemsUnit = await db.select().from(unit).where(eq(unit.symbol, 'items')).get()
  if (!itemsUnit) {
    const [inserted] = await db.insert(unit).values({
      symbol: 'items',
      name: 'Items',
      category: 'count',
    }).returning()
    itemsUnit = inserted
  }
  let spotsUnit = await db.select().from(unit).where(eq(unit.symbol, 'spots')).get()
  if (!spotsUnit) {
    const [inserted] = await db.insert(unit).values({
      symbol: 'spots',
      name: 'Spots',
      category: 'count',
    }).returning()
    spotsUnit = inserted
  }

  await db.insert(containerTypeUnit).values({
    containerType: 'micronix_tube',
    unitId: itemsUnit.id as number,
  }).onConflictDoNothing()
  await db.insert(containerTypeUnit).values({
    containerType: 'cryovial_tube',
    unitId: itemsUnit.id as number,
  }).onConflictDoNothing()
  await db.insert(containerTypeUnit).values({
    containerType: 'paper',
    unitId: spotsUnit.id as number,
  }).onConflictDoNothing()
  await db.insert(containerTypeUnit).values({
    containerType: 'static_well',
    unitId: spotsUnit.id as number,
  }).onConflictDoNothing()

  await setContainerDefaults(db, {
    micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
    cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
    paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
    static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
  })
}

describe('Specimen Creation Integration Tests', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
      },
      seed: seedSpecimenCreationFixtures,
      mount: (app, { db }) => {
        app.route('/api/specimens', createSpecimensRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('should create a specimen with subject source', async () => {
    const study = await createTestStudy(ctx.db, {
      title: 'Test Study',
      shortCode: 'TEST001',
    })
    const subject = await createTestStudySubject(ctx.db, {
      studyId: study.id,
      name: 'Subject 1',
    })
    const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })

    const response = await ctx.request('/api/specimens', {
      method: 'POST',
      json: {
        sourceType: 'subject',
        sourceId: subject.id,
        specimenTypeId: specimenType.id,
        collectionDate: '2024-01-01',
      },
    })

    expect(response.status).toBe(201)
    const data = await response.json() as { specimen: { studySubjectId: number; specimenTypeId: number } }
    expect(data).toHaveProperty('specimen')
    expect(data.specimen.studySubjectId).toBe(subject.id)
    expect(data.specimen.specimenTypeId).toBe(specimenType.id)
  })

  it('should create a specimen with container', async () => {
    const study = await createTestStudy(ctx.db, {
      title: 'Test Study',
      shortCode: 'TEST002',
    })
    const subject = await createTestStudySubject(ctx.db, {
      studyId: study.id,
      name: 'Subject 2',
    })
    const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })

    await ctx.db.insert(specimenTypeContainerType).values({
      specimenTypeId: specimenType.id,
      containerType: 'micronix_tube',
    })

    const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
    const location = await createTestLocation(ctx.db, {
      name: 'Test Location',
      storageTypeId: storageType.id.toString(),
    })
    const [plate] = await ctx.db.insert(micronixPlate).values({
      locationId: location.id,
      name: 'Test Plate',
      barcode: 'PLATE001',
    }).returning()

    const response = await ctx.request('/api/specimens', {
      method: 'POST',
      json: {
        sourceType: 'subject',
        sourceId: subject.id,
        specimenTypeId: specimenType.id,
        collectionDate: '2024-01-01',
        container: {
          containerType: 'micronix_tube',
          collectionName: plate.name,
          barcode: 'TEST001',
          position: 'A01',
        },
      },
    })

    if (response.status !== 201) {
      const errorData = await response.json()
      console.error('Specimen creation with container failed:', JSON.stringify(errorData, null, 2))
    }
    expect(response.status).toBe(201)
    const data = await response.json() as { specimen: unknown; container: { containerId: number } }
    expect(data).toHaveProperty('specimen')
    expect(data).toHaveProperty('container')
    expect(data.container).toHaveProperty('containerId')
  })
})
