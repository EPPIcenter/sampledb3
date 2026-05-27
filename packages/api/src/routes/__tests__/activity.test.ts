import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import {
  createTestControlDefinition,
  createTestControlBatch,
  createTestSpecimenType,
  createTestSpecimen,
} from '../../__tests__/helpers/factories'
import { createActivityRoutes } from '../activity'

describe('Activity API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'user@test.com',
        name: 'User',
        password: 'password123',
        role: 'member',
      },
      mount: (app, { db }) => {
        app.route('/api/activity', createActivityRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/activity/recent', () => {
    it('returns 200 and array', async () => {
      const res = await ctx.request('/api/activity/recent', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity?: unknown[] }
      expect(Array.isArray(data.activity)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/activity/recent', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })

    it('returns control specimen labels without database ID, with definition and batch names', async () => {
      const definition = await createTestControlDefinition(ctx.db, {
        name: 'HPV18 DBS Control',
        controlType: 'blood',
      })
      const batch = await createTestControlBatch(ctx.db, definition.id, {
        name: 'HPV18-2024-001',
        productionDate: '2024-01-15',
      })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'DBS' })
      const controlSpecimen = await createTestSpecimen(ctx.db, specimenType.id, {
        controlBatchId: batch.id,
      })

      const res = await ctx.request('/api/activity/recent', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity?: Array<{ id: number; type: string; label: string }> }
      expect(Array.isArray(data.activity)).toBe(true)

      const specimenActivity = data.activity!.find(
        (a) => a.type === 'specimen' && a.id === controlSpecimen.id
      )
      expect(specimenActivity).toBeDefined()
      expect(specimenActivity!.label).not.toMatch(/#\d+/)
      expect(specimenActivity!.label).toContain('HPV18 DBS Control')
      expect(specimenActivity!.label).toContain('HPV18-2024-001')
    })
  })
})
