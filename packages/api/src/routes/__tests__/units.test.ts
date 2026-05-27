import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getResponseData, authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createUnitsRoutes } from '../units'
import { createTestUnit } from '../../__tests__/helpers/factories'

describe('Units API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/units', createUnitsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/units', () => {
    it('returns 200 and list (data array)', async () => {
      const res = await ctx.request('/api/units', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as unknown[]
      expect(Array.isArray(data)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/units', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/units/:id', () => {
    it('returns 200 and unit when found', async () => {
      const unitRecord = await createTestUnit(ctx.db, {
        symbol: 'uL',
        name: 'microliter',
        category: 'volume',
      })
      const res = await ctx.request(`/api/units/${unitRecord.id}`, { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as { id: number; symbol: string }
      expect(data.id).toBe(unitRecord.id)
      expect(data.symbol).toBe('uL')
    })

    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/units/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/units', () => {
    it('returns 201 and created unit', async () => {
      const res = await ctx.request('/api/units', {
        method: 'POST',
        json: {
          symbol: 'mL',
          name: 'milliliter',
          category: 'volume',
        },
      })
      expect(res.status).toBe(201)
      const data = (await getResponseData(res)) as { symbol: string; name: string }
      expect(data.symbol).toBe('mL')
      expect(data.name).toBe('milliliter')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/units', {
        method: 'POST',
        json: { symbol: 'mL', name: 'milliliter', category: 'volume' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/units/:id', () => {
    it('returns 200 and updated unit', async () => {
      const unitRecord = await createTestUnit(ctx.db, {
        symbol: 'g',
        name: 'gram',
        category: 'mass',
      })
      const res = await ctx.request(`/api/units/${unitRecord.id}`, {
        method: 'PUT',
        json: { name: 'grams' },
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as { name: string }
      expect(data.name).toBe('grams')
    })
  })

  describe('DELETE /api/units/:id', () => {
    it('returns 200 when unit not in use', async () => {
      const unitRecord = await createTestUnit(ctx.db, {
        symbol: 'del',
        name: 'to delete',
        category: 'other',
      })
      const res = await ctx.request(`/api/units/${unitRecord.id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
    })
  })
})
