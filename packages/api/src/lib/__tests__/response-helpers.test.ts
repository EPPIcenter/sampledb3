import { describe, it, expect } from 'vitest'
import { successResponse, listResponse, createdResponse } from '../response-helpers'
import type { Context } from 'hono'

describe('response-helpers', () => {
  function createMockContext(): Context {
    return {
      get: () => undefined,
      set: () => {},
      json: (body: unknown, status?: number) =>
        new Response(JSON.stringify(body), {
          status: status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    } as unknown as Context
  }

  describe('successResponse', () => {
    it('returns response with data and default status 200', async () => {
      const c = createMockContext()
      const res = successResponse(c, { id: 1, name: 'Test' })
      expect(res).toBeInstanceOf(Response)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ data: { id: 1, name: 'Test' } })
    })
  })

  describe('listResponse', () => {
    it('returns response with data array and optional meta', async () => {
      const c = createMockContext()
      const res = listResponse(c, [{ id: 1 }, { id: 2 }])
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('data')
      expect(Array.isArray((data as any).data)).toBe(true)
      expect((data as any).data).toHaveLength(2)
    })

    it('includes meta when pagination provided', async () => {
      const c = createMockContext()
      const res = listResponse(c, [], { page: 1, limit: 10, total: 0, totalPages: 0 })
      const data = await res.json()
      expect(data).toHaveProperty('meta')
      expect((data as any).meta).toHaveProperty('pagination')
    })
  })

  describe('createdResponse', () => {
    it('returns response with status 201', async () => {
      const c = createMockContext()
      const res = createdResponse(c, { id: 42 })
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data).toEqual({ data: { id: 42 } })
    })
  })
})
