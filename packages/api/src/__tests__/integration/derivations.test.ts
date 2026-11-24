import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../helpers/authenticated-route-test'
import {
  createTestSpecimenType,
  createTestSpecimen,
  createTestUnit,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
} from '../helpers/factories'
import { createDerivationsRoutes } from '../../routes/derivations'
import { setContainerDefaults } from '../../lib/settings'
import { specimen as specimenTable, specimenTypeContainerType, containerTypeUnit, storageContainer, micronixTube, users } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../../lib/datetime'
import { failInsertsWithUniqueViolation } from '../helpers/constraint-race'
import { enrichedContainerWireSchema, specimenSummaryWireSchema } from '@sampledb/contract/wire'
import { eq } from 'drizzle-orm'

const BASE = '/api/derivations'

async function createParentContainerFixture(db: Database) {
  const unit = await createTestUnit(db, { symbol: 'uL', name: 'microliter', category: 'volume' })
  await setContainerDefaults(db, {
    micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
    cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
    paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
    static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
  })

  const specimenType = await createTestSpecimenType(db, { name: 'DNA' })
  const now = utcNow()
  await db.insert(specimenTypeContainerType).values({
    specimenTypeId: specimenType.id,
    containerType: 'micronix_tube',
    created: now,
  })
  await db.insert(containerTypeUnit).values({
    containerType: 'micronix_tube',
    unitId: unit.id,
  })

  const specimen = await createTestSpecimen(db, specimenType.id)
  const storageType = await createTestStorageType(db, { name: 'Freezer' })
  const location = await createTestLocation(db, {
    name: 'Loc',
    storageTypeId: String(storageType.id),
  })
  const sourcePlate = await createTestMicronixPlate(db, {
    name: 'SourcePlate',
    locationId: location.id,
  })
  const targetPlate = await createTestMicronixPlate(db, {
    name: 'TargetPlate',
    locationId: location.id,
  })

  const [parentContainer] = await db
    .insert(storageContainer)
    .values({
      specimenId: specimen.id,
      unitId: unit.id,
      totalQuantity: 1.0,
      remainingQuantity: 1.0,
      created: now,
      lastUpdated: now,
    })
    .returning()

  await db.insert(micronixTube).values({
    id: parentContainer!.id,
    collectionId: sourcePlate.id,
    barcode: 'MT-PARENT',
    position: 'A01',
  })

  return {
    parentContainerId: parentContainer!.id,
    targetPlateId: targetPlate.id,
  }
}

describe('Derivation Workflow Integration Tests', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/derivations', createDerivationsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('creates a derivation from parent container through the HTTP seam', async () => {
    const { parentContainerId, targetPlateId } = await createParentContainerFixture(ctx.db)

    const res = await ctx.request(`${BASE}/containers/${parentContainerId}/derive`, {
      method: 'POST',
      json: {
        derivationType: 'aliquot',
        specimenTypeName: 'DNA',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MT-CHILD',
          collection: { type: 'micronix_plate', id: targetPlateId, position: 'A01' },
        },
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      derivation: { parentContainerId: number; childContainerId: number }
      childContainer: { id: number }
      specimen: { id: number }
    }
    expect(data.derivation.parentContainerId).toBe(parentContainerId)
    expect(data.childContainer.id).toBe(data.derivation.childContainerId)
    expect(data.specimen).toBeDefined()

    const listRes = await ctx.request(`${BASE}/containers/${parentContainerId}/derivations`, {
      method: 'GET',
    })
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { derivations: unknown[]; count: number }
    expect(list.count).toBe(1)
    expect(list.derivations).toHaveLength(1)
  })

  it('returns 409 when the child container write hits a constraint', async () => {
    const { parentContainerId, targetPlateId } = await createParentContainerFixture(ctx.db)
    failInsertsWithUniqueViolation(ctx.sqlite, 'micronix_tube')

    const res = await ctx.request(`${BASE}/containers/${parentContainerId}/derive`, {
      method: 'POST',
      json: {
        derivationType: 'aliquot',
        specimenTypeName: 'DNA',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MT-CHILD',
          collection: { type: 'micronix_plate', id: targetPlateId, position: 'A01' },
        },
      },
    })

    expect(res.status).toBe(409)
    expect(await ctx.db.select().from(storageContainer)).toHaveLength(1)
  })

  it('returns derivation source for the child container', async () => {
    const { parentContainerId, targetPlateId } = await createParentContainerFixture(ctx.db)

    const deriveRes = await ctx.request(`${BASE}/containers/${parentContainerId}/derive`, {
      method: 'POST',
      json: {
        derivationType: 'aliquot',
        specimenTypeName: 'DNA',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MT-CHILD-2',
          collection: { type: 'micronix_plate', id: targetPlateId, position: 'A02' },
        },
      },
    })
    expect(deriveRes.status).toBe(200)
    const derived = (await deriveRes.json()) as { childContainer: { id: number } }

    const sourceRes = await ctx.request(`${BASE}/containers/${derived.childContainer.id}/source`, {
      method: 'GET',
    })
    expect(sourceRes.status).toBe(200)
    const source = (await sourceRes.json()) as {
      type: string
      derivation: { derivationType: string; childContainerId: number }
    }
    expect(source.type).toBe('derivation')
    expect(source.derivation.derivationType).toBe('aliquot')
    expect(source.derivation.childContainerId).toBe(derived.childContainer.id)
  })

  it('returns wire DTOs without audit columns from derive and source endpoints', async () => {
    const { parentContainerId, targetPlateId } = await createParentContainerFixture(ctx.db)
    const [testUser] = await ctx.db.select().from(users)
    const [parentRow] = await ctx.db
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, parentContainerId))
    await ctx.db
      .update(storageContainer)
      .set({ createdBy: testUser!.id, updatedBy: testUser!.id })
      .where(eq(storageContainer.id, parentContainerId))
    await ctx.db
      .update(specimenTable)
      .set({ createdBy: testUser!.id, updatedBy: testUser!.id })
      .where(eq(specimenTable.id, parentRow!.specimenId))

    // 1. GET /source for a non-derived (original) container
    const originalSourceRes = await ctx.request(`${BASE}/containers/${parentContainerId}/source`, {
      method: 'GET',
    })
    expect(originalSourceRes.status).toBe(200)
    const originalSource = (await originalSourceRes.json()) as {
      type: string
      container: Record<string, unknown>
      specimen: Record<string, unknown>
      source: Record<string, unknown>
    }
    expect(originalSource.type).toBe('original')
    expect(originalSource.container).not.toHaveProperty('createdBy')
    expect(originalSource.container).not.toHaveProperty('updatedBy')
    expect(enrichedContainerWireSchema.safeParse(originalSource.container).success).toBe(true)
    expect(originalSource.specimen).not.toHaveProperty('createdBy')
    expect(originalSource.specimen).not.toHaveProperty('updatedBy')
    expect(specimenSummaryWireSchema.safeParse(originalSource.specimen).success).toBe(true)

    // 2. POST /derive
    const deriveRes = await ctx.request(`${BASE}/containers/${parentContainerId}/derive`, {
      method: 'POST',
      json: {
        derivationType: 'aliquot',
        specimenTypeName: 'DNA',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MT-WIRE-CHILD',
          collection: { type: 'micronix_plate', id: targetPlateId, position: 'A03' },
        },
      },
    })
    expect(deriveRes.status).toBe(200)
    const derived = (await deriveRes.json()) as {
      parentContainer: Record<string, unknown>
      childContainer: Record<string, unknown> & { id: number }
      specimen: Record<string, unknown>
    }
    expect(derived.parentContainer).not.toHaveProperty('createdBy')
    expect(derived.parentContainer).not.toHaveProperty('updatedBy')
    expect(enrichedContainerWireSchema.safeParse(derived.parentContainer).success).toBe(true)
    expect(derived.childContainer).not.toHaveProperty('createdBy')
    expect(derived.childContainer).not.toHaveProperty('updatedBy')
    expect(enrichedContainerWireSchema.safeParse(derived.childContainer).success).toBe(true)
    expect(derived.specimen).not.toHaveProperty('createdBy')
    expect(derived.specimen).not.toHaveProperty('updatedBy')
    expect(specimenSummaryWireSchema.safeParse(derived.specimen).success).toBe(true)

    // 3. GET /source for a derived container
    const derivedSourceRes = await ctx.request(`${BASE}/containers/${derived.childContainer.id}/source`, {
      method: 'GET',
    })
    expect(derivedSourceRes.status).toBe(200)
    const derivedSource = (await derivedSourceRes.json()) as {
      type: string
      parentContainer: Record<string, unknown>
      parentSpecimen: Record<string, unknown>
    }
    expect(derivedSource.type).toBe('derivation')
    expect(derivedSource.parentContainer).not.toHaveProperty('createdBy')
    expect(derivedSource.parentContainer).not.toHaveProperty('updatedBy')
    expect(enrichedContainerWireSchema.safeParse(derivedSource.parentContainer).success).toBe(true)
    expect(derivedSource.parentSpecimen).not.toHaveProperty('createdBy')
    expect(derivedSource.parentSpecimen).not.toHaveProperty('updatedBy')
    expect(specimenSummaryWireSchema.safeParse(derivedSource.parentSpecimen).success).toBe(true)
  })
})
