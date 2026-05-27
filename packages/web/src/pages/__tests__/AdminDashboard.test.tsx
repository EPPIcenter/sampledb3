import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminDashboard from '../AdminDashboard'
import { adminApi } from '../../lib/api/admin'

function mockSystemStats() {
  return {
    users: { total: 5, active: 5, deleted: 0, byRole: {}, recentLogins: 0 },
    sessions: { active: 3 },
    entities: { studies: 10, subjects: 20, specimens: 100, containers: 200 },
    containers: { micronixTubes: 50, cryovialTubes: 50, papers: 50, staticWells: 50 },
    collections: { micronixPlates: 5, cryovialBoxes: 5, boxes: 0, bags: 0 },
    referenceData: { specimenTypes: 5, storageTypes: 2, tags: 0, units: 4, strains: 0 },
    locations: { total: 3 },
  }
}

vi.mock('../../lib/api/admin', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('admin', {
  adminApi: {
    getSystemStats: vi.fn().mockResolvedValue(mockSystemStats()),
  }
  })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getSystemStats).mockResolvedValue(mockSystemStats())
  })

  it('shows Admin Dashboard heading', async () => {
    await render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument()
    })
  })

  it('eventually shows stats or loading then content', async () => {
    await render(<AdminDashboard />)
    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })
})
