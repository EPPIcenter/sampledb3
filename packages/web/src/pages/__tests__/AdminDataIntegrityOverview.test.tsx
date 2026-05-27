import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminDataIntegrityOverview from '../AdminDataIntegrityOverview'
import { adminApi } from '../../lib/api/admin'

function emptyIntegrityReport() {
  return {
    emptyCollections: [],
    collectionsWithMissingLocation: [],
    containersWithMissingSpecimen: [],
    subtypeOrphans: [],
    sheetsWithMissingBoxOrBag: [],
    specimensWithMissingSubjectOrBatch: [],
    studySubjectsWithMissingStudy: [],
    derivationBrokenRefs: [],
    storageContainerTagOrphans: [],
    duplicateBarcodes: [],
    locationPathInconsistencies: [],
  }
}

vi.mock('../../lib/api/admin', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('admin', {
    adminApi: {
      getIntegrityReport: vi.fn().mockResolvedValue(emptyIntegrityReport()),
    },
  })
})

describe('AdminDataIntegrityOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue(emptyIntegrityReport())
  })

  it('shows integrity cards when report loads', async () => {
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByText('Empty collections')).toBeInTheDocument()
      expect(screen.getByText('Integrity report')).toBeInTheDocument()
    })
  })

  it('shows retry when report load fails', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockRejectedValue(new Error('fail'))
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })
})
