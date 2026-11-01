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

  it('passes created-date filters through to the request', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ pagination: { total: 3 } })
    await listTotal(fetchPage, 'subjects', { created_from: '2026-09-02', created_to: '2026-10-01' })
    expect(fetchPage).toHaveBeenCalledWith({ limit: 1, created_from: '2026-09-02', created_to: '2026-10-01' })
  })

  it('falls back to array length when pagination is missing', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      specimens: [{ id: 1 }, { id: 2 }],
    })
    await expect(listTotal(fetchPage, 'specimens')).resolves.toBe(2)
  })

  it('rejects when the request fails, instead of returning 0', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('network'))
    await expect(listTotal(fetchPage, 'containers')).rejects.toThrow('network')
  })

  it('rejects when the body has no total and no rows array', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ unexpected: true })
    await expect(listTotal(fetchPage, 'containers')).rejects.toThrow(/containers/)
  })
})
