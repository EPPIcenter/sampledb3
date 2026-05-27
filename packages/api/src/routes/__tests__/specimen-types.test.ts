import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getResponseData } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createCrudRoutes } from '../../lib/crud-routes'
import { specimenType, specimen, type SpecimenType } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { ErrorResponse } from '../../__tests__/helpers/test-types'
import { utcNow } from '../../lib/datetime'

describe('Specimen Types API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin User',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        const createSchema = z.object({
          name: z.string().min(1, 'Name is required'),
        })

        function transformList(item: SpecimenType) {
          return {
            id: item.id,
            name: item.name,
            created: item.created,
            lastUpdated: item.lastUpdated,
          }
        }

        async function checkSpecimenTypeInUse(id: number, database: typeof db): Promise<string | null> {
          const inUse = await database
            .select()
            .from(specimen)
            .where(eq(specimen.specimenTypeId, id))
            .limit(1)
            .get()

          if (inUse) {
            return 'Cannot delete specimen type: it is in use by specimens'
          }
          return null
        }

        function onCreateDefaults() {
          const now = utcNow()
          return {
            created: now,
            lastUpdated: now,
          }
        }

        function onUpdateDefaults() {
          return {
            lastUpdated: utcNow(),
          }
        }

        const specimenTypesRoutes = createCrudRoutes({
          table: specimenType,
          database: db,
          entityName: 'Specimen type',
          pluralName: 'specimenTypes',
          singularName: 'specimenType',
          createSchema,
          transformList,
          checkInUse: checkSpecimenTypeInUse,
          onCreateDefaults,
          onUpdateDefaults,
        })
        app.route('/api/specimen-types', specimenTypesRoutes)
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /specimen-types', () => {
    it('should return list of specimen types', async () => {
      const res = await ctx.request('/api/specimen-types', {
        method: 'GET',
      })

      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType[]>(res)
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('POST /specimen-types', () => {
    it('should create a new specimen type', async () => {
      const res = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: {
          name: 'Test Type',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData<SpecimenType>(res)
      expect(data).toBeDefined()
      expect(data.name).toBe('Test Type')
      expect(data.id).toBeDefined()
    })

    it('should reject empty name', async () => {
      const res = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: {
          name: '',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should reject duplicate names', async () => {
      await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Duplicate Test' },
      })

      const res = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: {
          name: 'Duplicate Test',
        },
      })

      expect(res.status).toBe(409)
      const data = (await res.json()) as ErrorResponse
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /specimen-types/:id', () => {
    it('should return specimen type by ID', async () => {
      const createRes = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Get Test Type' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const id = created.id

      const res = await ctx.request(`/api/specimen-types/${id}`, {
        method: 'GET',
      })

      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType>(res)
      expect(data.id).toBe(id)
      expect(data.name).toBe('Get Test Type')
    })

    it('should return 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/specimen-types/99999', {
        method: 'GET',
      })

      expect(res.status).toBe(404)
    })

    it('should return 400 for invalid ID', async () => {
      const res = await ctx.request('/api/specimen-types/invalid', {
        method: 'GET',
      })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /specimen-types/:id', () => {
    it('should update specimen type', async () => {
      const createRes = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Original Name' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const id = created.id

      const res = await ctx.request(`/api/specimen-types/${id}`, {
        method: 'PUT',
        json: {
          name: 'Updated Name',
        },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType>(res)
      expect(data.name).toBe('Updated Name')
    })

    it('should reject duplicate names on update', async () => {
      const create1 = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Type A' },
      })
      const type1 = await getResponseData<SpecimenType>(create1)

      await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Type B' },
      })

      const res = await ctx.request(`/api/specimen-types/${type1.id}`, {
        method: 'PUT',
        json: {
          name: 'Type B',
        },
      })

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /specimen-types/:id', () => {
    it('should delete specimen type when not in use', async () => {
      const createRes = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Delete Test Type' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const id = created.id

      const res = await ctx.request(`/api/specimen-types/${id}`, {
        method: 'DELETE',
      })

      expect(res.status).toBe(200)

      const getRes = await ctx.request(`/api/specimen-types/${id}`, {
        method: 'GET',
      })
      expect(getRes.status).toBe(404)
    })

    it('should return 400 for invalid ID', async () => {
      const res = await ctx.request('/api/specimen-types/invalid', {
        method: 'DELETE',
      })

      expect(res.status).toBe(400)
    })
  })

  describe('List transformation', () => {
    it('should transform list response to include only specific fields', async () => {
      await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Type 1' },
      })
      await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Type 2' },
      })

      const res = await ctx.request('/api/specimen-types', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType[]>(res)
      if (data.length > 0) {
        const item = data[0]
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('created')
        expect(item).toHaveProperty('lastUpdated')
      }
    })
  })

  describe('Timestamp handling', () => {
    it('should set created and lastUpdated on create', async () => {
      const res = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Timestamp Test' },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData<SpecimenType>(res)
      expect(data.created).toBeDefined()
      expect(data.lastUpdated).toBeDefined()
      expect(new Date(data.created).getTime()).toBeGreaterThan(0)
    })

    it('should update lastUpdated on update', async () => {
      const createRes = await ctx.request('/api/specimen-types', {
        method: 'POST',
        json: { name: 'Update Timestamp Test' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const originalUpdated = created.lastUpdated

      await new Promise(resolve => setTimeout(resolve, 1100))

      const updateRes = await ctx.request(`/api/specimen-types/${created.id}`, {
        method: 'PUT',
        json: { name: 'Updated Name' },
      })

      expect(updateRes.status).toBe(200)
      const updated = await getResponseData<SpecimenType>(updateRes)
      expect(updated.lastUpdated).not.toBe(originalUpdated)
    })
  })
})
