import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../helpers/authenticated-route-test'
import {
  createTestControlDefinition,
} from '../helpers/factories'
import { createControlsRoutes } from '../../routes/controls'

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
})
