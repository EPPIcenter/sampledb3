import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../helpers/authenticated-route-test'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
} from '../helpers/factories'
import { createCollectionsRoutes } from '../../routes/collections'
import { micronixPlate } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Collection Move Integration Tests', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/collections', createCollectionsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('moves a micronix plate to a new location through the HTTP seam', async () => {
    const storageType = await createTestStorageType(ctx.db, {
      name: 'Freezer',
      description: 'Test freezer',
    })
    const sourceLocation = await createTestLocation(ctx.db, {
      name: 'Source Location',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const targetLocation = await createTestLocation(ctx.db, {
      name: 'Target Location',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(ctx.db, {
      name: 'PlateA',
      locationId: sourceLocation.id,
    })

    const res = await ctx.request('/api/collections/move', {
      method: 'POST',
      json: {
        collectionType: 'micronix_plate',
        moves: [
          {
            identifier: { type: 'id', id: plate.id },
            targetLocationId: targetLocation.id,
          },
        ],
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean; moved: number }
    expect(data.success).toBe(true)
    expect(data.moved).toBe(1)

    const after = await ctx.db
      .select()
      .from(micronixPlate)
      .where(eq(micronixPlate.id, plate.id))
      .get()
    expect(after?.locationId).toBe(targetLocation.id)
  })

  it('returns 400 when the collection does not exist', async () => {
    const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
    const targetLocation = await createTestLocation(ctx.db, {
      name: 'Target Location',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })

    const res = await ctx.request('/api/collections/move', {
      method: 'POST',
      json: {
        collectionType: 'micronix_plate',
        moves: [
          {
            identifier: { type: 'id', id: 99999 },
            targetLocationId: targetLocation.id,
          },
        ],
      },
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string; moved: number }
    expect(data.error).toMatch(/failed/i)
    expect(data.moved).toBe(0)
  })
})
