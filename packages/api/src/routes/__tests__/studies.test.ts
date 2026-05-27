import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createStudiesRoutes } from '../studies'
import { createTestStudy } from '../../__tests__/helpers/factories'

describe('Studies API (list, get, create, update)', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      settings: { pagination: true },
      user: {
        email: 'member@test.com',
        name: 'Member',
        password: 'password123',
        role: 'member',
      },
      mount: (app, { db, sqlite }) => {
        app.route('/api/studies', createStudiesRoutes(db, sqlite))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/studies', () => {
    it('returns 200 and list shape with studies and pagination', async () => {
      const res = await ctx.request('/api/studies')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { studies: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('studies')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.studies)).toBe(true)
      expect(data.pagination).toHaveProperty('page')
      expect(data.pagination).toHaveProperty('total')
      expect(data.pagination).toHaveProperty('totalPages')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/studies', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/studies/:id', () => {
    it('returns 200 and study when found', async () => {
      const studyRecord = await createTestStudy(ctx.db, {
        title: 'Test Study',
        shortCode: 'TS01',
      })
      const res = await ctx.request(`/api/studies/${studyRecord.id}`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as { study: { id: number; title: string } }
      expect(data.study).toBeDefined()
      expect(data.study.id).toBe(studyRecord.id)
      expect(data.study.title).toBe('Test Study')
    })

    it('returns 404 when study does not exist', async () => {
      const res = await ctx.request('/api/studies/99999')
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/studies/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/studies', () => {
    it('returns 201 and created study', async () => {
      const res = await ctx.request('/api/studies', {
        method: 'POST',
        json: {
          title: 'New Study',
          shortCode: 'NEW01',
          isLongitudinal: false,
          leadPerson: 'Lead Person',
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { study: { title: string; shortCode: string } }
      expect(data.study.title).toBe('New Study')
      expect(data.study.shortCode).toBe('NEW01')
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/studies', {
        method: 'POST',
        json: {
          title: 'New Study',
          shortCode: 'NEW01',
          isLongitudinal: false,
          leadPerson: 'Lead Person',
        },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/studies/:id', () => {
    it('returns 200 and updated study', async () => {
      const studyRecord = await createTestStudy(ctx.db, {
        title: 'Original',
        shortCode: 'ORIG01',
      })
      const res = await ctx.request(`/api/studies/${studyRecord.id}`, {
        method: 'PUT',
        json: {
          title: 'Updated Title',
          leadPerson: 'New Lead',
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { study: { title: string } }
      expect(data.study.title).toBe('Updated Title')
    })

    it('returns 404 when study does not exist', async () => {
      const res = await ctx.request('/api/studies/99999', {
        method: 'PUT',
        json: { title: 'Updated' },
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const studyRecord = await createTestStudy(ctx.db, { title: 'S', shortCode: 'S01' })
      const res = await authenticatedRequest(ctx.createRequestApp(), `/api/studies/${studyRecord.id}`, {
        method: 'PUT',
        json: { title: 'Updated' },
      })
      expect(res.status).toBe(401)
    })
  })
})
