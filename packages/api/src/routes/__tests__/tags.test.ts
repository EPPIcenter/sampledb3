import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getResponseData, authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createTagsRoutes } from '../tags'
import { createTestTag } from '../../__tests__/helpers/factories'

describe('Tags API', () => {
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
        app.route('/api/tags', createTagsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/tags', () => {
    it('returns 200 and list (data array)', async () => {
      const res = await ctx.request('/api/tags', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as unknown[]
      expect(Array.isArray(data)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/tags', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/tags/:id', () => {
    it('returns 200 and tag when found', async () => {
      const tagRecord = await createTestTag(ctx.db, { name: 'Test Tag' })
      const res = await ctx.request(`/api/tags/${tagRecord.id}`, { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as { id: number; name: string }
      expect(data.id).toBe(tagRecord.id)
      expect(data.name).toBe('Test Tag')
    })

    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/tags/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/tags', () => {
    it('returns 201 and created tag', async () => {
      const res = await ctx.request('/api/tags', {
        method: 'POST',
        json: { name: 'New Tag' },
      })
      expect(res.status).toBe(201)
      const data = (await getResponseData(res)) as { name: string }
      expect(data.name).toBe('New Tag')
    })
  })

  describe('PUT /api/tags/:id', () => {
    it('returns 200 and updated tag', async () => {
      const tagRecord = await createTestTag(ctx.db, { name: 'Original' })
      const res = await ctx.request(`/api/tags/${tagRecord.id}`, {
        method: 'PUT',
        json: { name: 'Updated' },
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as { name: string }
      expect(data.name).toBe('Updated')
    })
  })

  describe('DELETE /api/tags/:id', () => {
    it('returns 200 when tag not in use', async () => {
      const tagRecord = await createTestTag(ctx.db, { name: 'To Delete' })
      const res = await ctx.request(`/api/tags/${tagRecord.id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
    })
  })
})
