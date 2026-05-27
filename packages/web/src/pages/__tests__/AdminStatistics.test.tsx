import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminStatistics from '../AdminStatistics'
import { adminApi } from '../../lib/api/admin'

function emptySystemStats() {
  return {
    users: { total: 0, active: 0, deleted: 0, byRole: {}, recentLogins: 0 },
    sessions: { active: 0 },
    entities: { studies: 0, subjects: 0, specimens: 0, containers: 0 },
    containers: { micronixTubes: 0, cryovialTubes: 0, papers: 0, staticWells: 0 },
    collections: { micronixPlates: 0, cryovialBoxes: 0, boxes: 0, bags: 0 },
    referenceData: { specimenTypes: 0, storageTypes: 0, tags: 0, units: 0, strains: 0 },
    locations: { total: 0 },
  }
}

vi.mock('../../lib/api/admin', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('admin', {
  adminApi: {
    getSystemStats: vi.fn().mockResolvedValue(emptySystemStats()),
  }
  })
})

describe('AdminStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getSystemStats).mockResolvedValue(emptySystemStats())
  })

  it('shows System Statistics heading', async () => {
    await render(<AdminStatistics />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /system statistics/i })).toBeInTheDocument()
    })
  })
})
