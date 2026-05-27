import { describe, it, expect, vi } from 'vitest'
import { listTotal } from '../list-total'

describe('listTotal', () => {
  it('returns pagination.total when present', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      studies: [],
      pagination: { total: 42 },
    })
    await expect(listTotal(fetchPage, 'studies')).resolves.toBe(42)
    expect(fetchPage).toHaveBeenCalledWith({ limit: 1 })
  })

  it('falls back to array length when pagination is missing', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      specimens: [{ id: 1 }, { id: 2 }],
    })
    await expect(listTotal(fetchPage, 'specimens')).resolves.toBe(2)
  })

  it('returns 0 when the request fails', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('network'))
    await expect(listTotal(fetchPage, 'containers')).resolves.toBe(0)
  })
})
