import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createReagentsRoutes } from '../reagents'

describe('Reagents API', () => {
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
        app.route('/api/reagents', createReagentsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/reagents', () => {
    it('returns 200 and reagents array', async () => {
      const res = await ctx.request('/api/reagents', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { reagents: unknown[] }
      expect(data).toHaveProperty('reagents')
      expect(Array.isArray(data.reagents)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/reagents', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/reagents/:id', () => {
    it('returns 200 and reagent when found', async () => {
      const createRes = await ctx.request('/api/reagents', {
        method: 'POST',
        json: { name: 'Test Reagent', reagentType: 'antibody' },
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { reagent: { id: number } }
      const id = created.reagent.id

      const res = await ctx.request(`/api/reagents/${id}`, { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { reagent: { id: number; name: string } }
      expect(data.reagent.id).toBe(id)
      expect(data.reagent.name).toBe('Test Reagent')
    })

    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/reagents/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/reagents', () => {
    it('returns 201 and created reagent', async () => {
      const res = await ctx.request('/api/reagents', {
        method: 'POST',
        json: { name: 'New Reagent', reagentType: 'primer' },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { reagent: { name: string; reagentType: string } }
      expect(data.reagent.name).toBe('New Reagent')
    })
  })

  describe('PATCH /api/reagents/:id', () => {
    it('returns 200 and updated reagent', async () => {
      const createRes = await ctx.request('/api/reagents', {
        method: 'POST',
        json: { name: 'To Update', reagentType: 'buffer' },
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { reagent: { id: number } }
      const id = created.reagent.id

      const res = await ctx.request(`/api/reagents/${id}`, {
        method: 'PATCH',
        json: { name: 'Updated Name' },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { reagent: { name: string } }
      expect(data.reagent.name).toBe('Updated Name')
    })
  })
})
