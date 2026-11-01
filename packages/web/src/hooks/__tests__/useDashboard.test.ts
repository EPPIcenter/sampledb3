import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchDashboardCount, fetchDashboardTrend } from '../useDashboard'
import { studiesApi } from '../../lib/api/studies'
import { specimensApi } from '../../lib/api/specimens'
import { subjectsApi } from '../../lib/api/subjects'

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('studies', { studiesApi: { list: vi.fn() } })
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('specimens', { specimensApi: { search: vi.fn() } })
})

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('subjects', { subjectsApi: { list: vi.fn() } })
})

const NOW = new Date('2026-10-31T12:00:00Z')
const CURRENT = { limit: 1, created_from: '2026-10-02' }
const PREVIOUS = { limit: 1, created_from: '2026-09-02', created_to: '2026-10-01' }

function body(total: number) {
  return { pagination: { total, page: 1, limit: 1, totalPages: total } } as never
}

describe('fetchDashboardTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts studies created in each window, never the all-time total', async () => {
    vi.mocked(studiesApi.list).mockResolvedValueOnce(body(3)).mockResolvedValueOnce(body(4))
    await expect(fetchDashboardTrend('studies', NOW)).resolves.toEqual({ current: 3, previous: 4 })
    expect(studiesApi.list).toHaveBeenCalledWith(undefined, CURRENT)
    expect(studiesApi.list).toHaveBeenCalledWith(undefined, PREVIOUS)
  })

  it('counts subjects created in each window', async () => {
    vi.mocked(subjectsApi.list).mockResolvedValueOnce(body(20)).mockResolvedValueOnce(body(5))
    await expect(fetchDashboardTrend('subjects', NOW)).resolves.toEqual({ current: 20, previous: 5 })
    expect(subjectsApi.list).toHaveBeenCalledWith(CURRENT)
    expect(subjectsApi.list).toHaveBeenCalledWith(PREVIOUS)
  })

  it('counts specimens created in each window', async () => {
    vi.mocked(specimensApi.search).mockResolvedValueOnce(body(15)).mockResolvedValueOnce(body(10))
    await expect(fetchDashboardTrend('specimens', NOW)).resolves.toEqual({ current: 15, previous: 10 })
    expect(specimensApi.search).toHaveBeenCalledWith(CURRENT)
    expect(specimensApi.search).toHaveBeenCalledWith(PREVIOUS)
  })

  it('rejects when either window fails', async () => {
    vi.mocked(subjectsApi.list).mockResolvedValueOnce(body(20)).mockRejectedValueOnce(new Error('boom'))
    await expect(fetchDashboardTrend('subjects', NOW)).rejects.toThrow('boom')
  })
})

describe('fetchDashboardCount', () => {
  it('rejects on a failed request instead of resolving to 0', async () => {
    vi.mocked(subjectsApi.list).mockRejectedValueOnce(new Error('offline'))
    await expect(fetchDashboardCount('subjects')).rejects.toThrow('offline')
  })
})
