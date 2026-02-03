import { describe, it, expect } from 'vitest'
import { parseId, errorResponse, successResponse } from '../route-helpers'

describe('route-helpers', () => {
  describe('parseId', () => {
    it('returns number for valid string', () => {
      expect(parseId('1')).toBe(1)
      expect(parseId('42')).toBe(42)
      expect(parseId('0')).toBe(0)
    })

    it('returns null for invalid or missing', () => {
      expect(parseId(undefined)).toBe(null)
      expect(parseId('')).toBe(null)
      expect(parseId('notanid')).toBe(null)
      expect(parseId('1.5')).toBe(1) // parseInt truncates
    })
  })

  describe('errorResponse', () => {
    it('returns Response with error and status', async () => {
      const res = errorResponse('Bad request', 400)
      expect(res.status).toBe(400)
      const data = await res.json() as { error: string }
      expect(data.error).toBe('Bad request')
    })

    it('includes details when provided', async () => {
      const res = errorResponse('Validation failed', 422, { field: 'name' })
      expect(res.status).toBe(422)
      const data = await res.json() as { error: string; details: { field: string } }
      expect(data.error).toBe('Validation failed')
      expect(data.details).toEqual({ field: 'name' })
    })

    it('defaults to status 400', async () => {
      const res = errorResponse('Error')
      expect(res.status).toBe(400)
    })
  })

  describe('successResponse', () => {
    it('returns Response with data and status', async () => {
      const res = successResponse({ id: 1, name: 'Test' }, 200)
      expect(res.status).toBe(200)
      const data = await res.json() as { id: number; name: string }
      expect(data.id).toBe(1)
      expect(data.name).toBe('Test')
    })

    it('defaults to status 200', async () => {
      const res = successResponse({ ok: true })
      expect(res.status).toBe(200)
      const data = await res.json() as { ok: boolean }
      expect(data.ok).toBe(true)
    })
  })
})
