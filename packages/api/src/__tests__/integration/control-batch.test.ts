import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../helpers/authenticated-route-test'
import {
  createTestControlDefinition,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestStorageType,
  createTestUnit,
} from '../helpers/factories'
import { createControlsRoutes } from '../../routes/controls'
import { setContainerDefaults } from '../../lib/settings'
import { containerTypeUnit, controlBatch, specimenTypeContainerType } from '../../db/schema'
import { failInsertsWithUniqueViolation } from '../helpers/constraint-race'

describe('Control Batch Creation Integration Tests', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/blood-controls', createControlsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('should create a control batch successfully', async () => {
    const definition = await createTestControlDefinition(ctx.db, {
      name: 'Test Control',
      controlType: 'blood',
    })

    const response = await ctx.request(`/api/blood-controls/${definition.id}/batches`, {
      method: 'POST',
      json: {
        productionDate: '2024-01-01',
      },
    })

    if (response.status !== 201) {
      const errorData = await response.json() as { error?: string }
      console.error('Control batch creation failed:', errorData)
    }
    expect(response.status).toBe(201)
    const data = await response.json() as { batch: { id: number; controlDefinitionId: number } }
    expect(data).toHaveProperty('batch')
    expect(data.batch).toHaveProperty('id')
    expect(data.batch.controlDefinitionId).toBe(definition.id)
  })

  it('should return 404 when control definition does not exist', async () => {
    const response = await ctx.request('/api/blood-controls/99999/batches', {
      method: 'POST',
      json: {
        productionDate: '2024-01-01',
      },
    })

    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error')
  })

  describe('when a container write hits a constraint', () => {
    let definitionId: number
    let plateId: number

    beforeEach(async () => {
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(ctx.db, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await ctx.db.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      definitionId = (await createTestControlDefinition(ctx.db, { name: 'Def1' })).id
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'DNA' })
      await ctx.db.insert(specimenTypeContainerType).values({ specimenTypeId: specimenType.id, containerType: 'micronix_tube' })
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const location = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      plateId = (await createTestMicronixPlate(ctx.db, { name: 'Plate1', locationId: location.id })).id
      failInsertsWithUniqueViolation(ctx.sqlite, 'micronix_tube')
    })

    function specimens() {
      return [
        {
          specimenTypeName: 'DNA',
          containers: [{ containerType: 'micronix_tube', barcode: 'MT001', collection: { type: 'micronix_plate', id: plateId, position: 'A01' } }],
        },
      ]
    }

    it('create-with-specimens returns 409', async () => {
      const res = await ctx.request('/api/blood-controls/batches/create-with-specimens', {
        method: 'POST',
        json: { batch: { controlDefinitionId: definitionId, name: 'Batch1' }, specimens: specimens() },
      })

      expect(res.status).toBe(409)
      expect(await ctx.db.select().from(controlBatch)).toEqual([])
    })

    it('create-many-with-specimens returns 409', async () => {
      const res = await ctx.request('/api/blood-controls/batches/create-many-with-specimens', {
        method: 'POST',
        json: { batches: [{ batch: { controlDefinitionId: definitionId, name: 'Batch1' }, specimens: specimens() }] },
      })

      expect(res.status).toBe(409)
      expect(await ctx.db.select().from(controlBatch)).toEqual([])
    })

    it('adding specimens to a batch returns 409', async () => {
      const [batch] = await ctx.db.insert(controlBatch).values({ controlDefinitionId: definitionId, name: 'Existing' }).returning()

      const res = await ctx.request(`/api/blood-controls/batches/${batch.id}/specimens/bulk`, {
        method: 'POST',
        json: { specimens: specimens() },
      })

      expect(res.status).toBe(409)
    })
  })
})
