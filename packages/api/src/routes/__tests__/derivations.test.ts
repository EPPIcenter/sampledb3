import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createDerivationsRoutes } from '../derivations'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../../lib/settings'
import { containerDerivation, containerTypeUnit, micronixTube, specimenTypeContainerType, storageContainer } from '../../db/schema'
import { utcNow } from '../../lib/datetime'
import { eq } from 'drizzle-orm'

const BASE = '/api/derivations'

describe('Derivations API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      additionalUsers: [{ key: 'member', email: 'member@test.com', password: 'password123', role: 'member' }],
      mount: (app, { db }) => {
        app.route('/api/derivations', createDerivationsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/containers/:id/derivations', () => {
    it('returns 200 and empty list for non-existent container', async () => {
      const res = await ctx.request(`${BASE}/containers/99999/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { derivations: unknown[]; count: number }
      expect(data).toHaveProperty('derivations')
      expect(data).toHaveProperty('count')
      expect(Array.isArray(data.derivations)).toBe(true)
      expect(data.count).toBe(0)
    })

    it('returns 400 for invalid container ID', async () => {
      const res = await ctx.request(`${BASE}/containers/notanid/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), `${BASE}/containers/1/derivations`, {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/containers/:id/derive', () => {
    it('returns 400 for invalid container ID', async () => {
      const res = await ctx.request(`${BASE}/containers/notanid/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          specimenTypeName: 'Blood',
          containerType: 'micronix_tube',
        },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid payload (missing required fields)', async () => {
      const res = await ctx.request(`${BASE}/containers/1/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          // missing specimenTypeName, containerType
        },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error?: string; details?: unknown }
      expect(data.error).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), `${BASE}/containers/1/derive`, {
        method: 'POST',
        json: {
          derivationType: 'Test',
          specimenTypeName: 'Blood',
          containerType: 'micronix_tube',
        },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/containers/:id/derive quantity bounds', () => {
    let parentId: number
    let targetPlateId: number

    /** A micronix Parent container with total 10 and remaining 4, and an empty target plate. */
    beforeEach(async () => {
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const defaults = { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' }
      await setContainerDefaults(ctx.db, {
        micronix_tube: defaults,
        cryovial_tube: defaults,
        paper: defaults,
        static_well: defaults,
      })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'DNA' })
      const now = utcNow()
      await ctx.db.insert(specimenTypeContainerType).values({ specimenTypeId: specimenType.id, containerType: 'micronix_tube', created: now })
      await ctx.db.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      const parentSpecimen = await createTestSpecimen(ctx.db, specimenType.id)
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const location = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      const sourcePlate = await createTestMicronixPlate(ctx.db, { name: 'SourcePlate', locationId: location.id })
      targetPlateId = (await createTestMicronixPlate(ctx.db, { name: 'TargetPlate', locationId: location.id })).id
      const [parent] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: parentSpecimen.id, unitId: unit.id, totalQuantity: 10, remainingQuantity: 4, created: now, lastUpdated: now })
        .returning()
      parentId = parent!.id
      await ctx.db.insert(micronixTube).values({ id: parentId, collectionId: sourcePlate.id, barcode: 'MT-PARENT', position: 'A01' })
    })

    function derive(fields: Record<string, unknown>) {
      return ctx.request(`${BASE}/containers/${parentId}/derive`, {
        method: 'POST',
        json: {
          derivationType: 'aliquot',
          specimenTypeName: 'DNA',
          container: {
            containerType: 'micronix_tube',
            barcode: 'MT-CHILD',
            collection: { type: 'micronix_plate', id: targetPlateId, position: 'A01' },
          },
          ...fields,
        },
      })
    }

    async function parentRemaining() {
      return (await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, parentId)).get())?.remainingQuantity
    }

    async function expectNothingDerived() {
      expect(await parentRemaining()).toBe(4)
      expect(await ctx.db.select().from(containerDerivation)).toHaveLength(0)
      expect(await ctx.db.select().from(storageContainer)).toHaveLength(1)
    }

    it.each([
      [0, 'Quantity used must be greater than 0 (got 0).'],
      [-100, 'Quantity used must be greater than 0 (got -100).'],
    ])('returns 400 for a quantity used of %d and changes nothing', async (quantityUsed, message) => {
      const res = await derive({ quantityUsed })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; errorCode: string }
      expect(body).toMatchObject({ error: message, errorCode: 'VALIDATION_ERROR' })
      await expectNothingDerived()
    })

    it('returns 400 for a quantity used greater than the Parent container remaining quantity', async () => {
      const res = await derive({ quantityUsed: 5 })

      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Quantity used (5) exceeds the Parent container's remaining quantity (4).",
      )
      await expectNothingDerived()
    })

    it('returns 400 for a negative Child container quantity', async () => {
      const res = await derive({ quantity: -1, quantityUsed: 1 })

      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('Child container: Total quantity must be 0 or more (got -1).')
      await expectNothingDerived()
    })

    it('draws all that remains', async () => {
      const res = await derive({ quantityUsed: 4 })

      expect(res.status).toBe(200)
      expect(await parentRemaining()).toBe(0)
    })

    it('does not bound a quantity used that leaves the Parent container unreduced', async () => {
      const res = await derive({ quantityUsed: 100, reduceParentQuantity: false })

      expect(res.status).toBe(200)
      expect(await parentRemaining()).toBe(4)
    })
  })

  describe('GET /api/containers/:id/source', () => {
    it('returns 400 for invalid container ID', async () => {
      const res = await ctx.request(`${BASE}/containers/notanid/source`, {
        method: 'GET',
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), `${BASE}/containers/1/source`, {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })
  describe('PATCH and DELETE /api/derivations/derivations/:id (admin-only)', () => {
    async function createDerivationRow() {
      const parent = await createTestStorageContainer(ctx.db)
      const specType = await createTestSpecimenType(ctx.db, { name: 'DNA' })
      const childSpecimen = await createTestSpecimen(ctx.db, specType.id)
      const child = await createTestStorageContainer(ctx.db, { unitId: parent!.unitId, specimenId: childSpecimen!.id })
      const [row] = await ctx.db
        .insert(containerDerivation)
        .values({ parentContainerId: parent!.id, childContainerId: child!.id, derivationType: 'extraction', protocol: 'P1' })
        .returning()
      return row!
    }

    async function loadDerivation(id: number) {
      return ctx.db.select().from(containerDerivation).where(eq(containerDerivation.id, id)).get()
    }

    it('returns 403 to a member editing a Derivation and leaves it unchanged', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, {
        method: 'PATCH',
        json: { protocol: 'P2' },
        cookie: ctx.cookies.member,
      })
      expect(res.status).toBe(403)
      expect((await loadDerivation(d.id))?.protocol).toBe('P1')
    })

    it('lets an admin edit a Derivation', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, { method: 'PATCH', json: { protocol: 'P2' } })
      expect(res.status).toBe(200)
      expect((await loadDerivation(d.id))?.protocol).toBe('P2')
    })

    it('returns 403 to a member deleting a Derivation and keeps it', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, { method: 'DELETE', cookie: ctx.cookies.member })
      expect(res.status).toBe(403)
      expect(await loadDerivation(d.id)).toBeDefined()
    })

    it('lets an admin delete a Derivation', async () => {
      const d = await createDerivationRow()
      const res = await ctx.request(`${BASE}/derivations/${d.id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await loadDerivation(d.id)).toBeUndefined()
    })
  })
})
