import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getResponseData, authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createTagsRoutes } from '../tags'
import { createTestTag } from '../../__tests__/helpers/factories'
import { tag } from '../../db/schema'
import { eq } from 'drizzle-orm'

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
      additionalUsers: [
        { key: 'member', email: 'member@test.com', role: 'member' },
        { key: 'viewer', email: 'viewer@test.com', role: 'viewer' },
      ],
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

  describe('what each role may write (#141)', () => {
    function tagsNamed(name: string) {
      return ctx.db.select().from(tag).where(eq(tag.name, name))
    }

    it('lets a member create a Tag', async () => {
      const res = await ctx.request('/api/tags', {
        method: 'POST',
        cookie: ctx.cookies.member,
        json: { name: 'Needs QC' },
      })

      expect(res.status).toBe(201)
      expect(((await getResponseData(res)) as { name: string }).name).toBe('Needs QC')
      expect(await tagsNamed('Needs QC')).toHaveLength(1)
    })

    it('refuses a member a Tag name that already exists', async () => {
      await createTestTag(ctx.db, { name: 'Needs QC' })

      const res = await ctx.request('/api/tags', {
        method: 'POST',
        cookie: ctx.cookies.member,
        json: { name: 'Needs QC' },
      })

      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe('Tag with this name already exists')
      expect(await tagsNamed('Needs QC')).toHaveLength(1)
    })

    it('refuses a member a Tag with no name', async () => {
      const res = await ctx.request('/api/tags', {
        method: 'POST',
        cookie: ctx.cookies.member,
        json: { name: '' },
      })

      expect(res.status).toBe(400)
      expect(await ctx.db.select().from(tag)).toHaveLength(0)
    })

    it('returns 403 to a member renaming a Tag, and changes nothing', async () => {
      const tagRecord = await createTestTag(ctx.db, { name: 'Original' })

      const res = await ctx.request(`/api/tags/${tagRecord.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.member,
        json: { name: 'Renamed' },
      })

      expect(res.status).toBe(403)
      expect(await tagsNamed('Original')).toHaveLength(1)
    })

    it('returns 403 to a member deleting a Tag, and deletes nothing', async () => {
      const tagRecord = await createTestTag(ctx.db, { name: 'Original' })

      const res = await ctx.request(`/api/tags/${tagRecord.id}`, {
        method: 'DELETE',
        cookie: ctx.cookies.member,
      })

      expect(res.status).toBe(403)
      expect(await tagsNamed('Original')).toHaveLength(1)
    })

    it('returns 403 to a viewer creating a Tag, and creates nothing', async () => {
      const res = await ctx.request('/api/tags', {
        method: 'POST',
        cookie: ctx.cookies.viewer,
        json: { name: 'Needs QC' },
      })

      expect(res.status).toBe(403)
      expect(await tagsNamed('Needs QC')).toHaveLength(0)
    })

    it('returns 401 for a create when not authenticated', async () => {
      const res = await ctx.request('/api/tags', { method: 'POST', cookie: null, json: { name: 'Needs QC' } })

      expect(res.status).toBe(401)
    })
  })
})
