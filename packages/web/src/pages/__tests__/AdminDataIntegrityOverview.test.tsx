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
    containersWithNoGridPosition: [],
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

  it('does not count containers with no grid position as integrity issues', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      duplicateBarcodes: [{ barcode: 'DUP', containerType: 'micronix_tube', ids: [1, 2] }],
      containersWithNoGridPosition: [
        { id: 9, containerType: 'micronix_tube', collectionId: 3 },
      ],
    })
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /integrity report/i })).toHaveTextContent('1')
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
