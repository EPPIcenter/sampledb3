import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unitsApi } from '../reference-data'
import { api } from '../client'

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('unitsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listAll', () => {
    it('returns units array from GET /units ApiResponse envelope', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: [
          { id: 1, symbol: 'uL', name: 'microliter', category: 'volume' },
          { id: 2, symbol: 'mL', name: 'milliliter', category: 'volume' },
        ],
      })

      const result = await unitsApi.listAll()

      expect(api.get).toHaveBeenCalledWith('/units')
      expect(result).toHaveLength(2)
      expect(result[0]?.symbol).toBe('uL')
    })
  })

  describe('list', () => {
    it('preserves data and meta for reference-data CRUD', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: [{ id: 1, symbol: 'g', name: 'gram', category: 'mass' }],
        meta: { total: 1 },
      })

      const result = await unitsApi.list()

      expect(result.data).toHaveLength(1)
      expect(result.meta).toEqual({ total: 1 })
    })
  })
})
