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
import { specimenTypeContainerType, containerTypeUnit, storageContainer, micronixTube } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../../lib/datetime'

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
})
