import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminDataIntegrityReport from '../AdminDataIntegrityReport'
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

describe('AdminDataIntegrityReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue(emptyIntegrityReport())
  })

  it('shows report intro when data loads', async () => {
    await render(<AdminDataIntegrityReport />)
    await waitFor(() => {
      expect(screen.getByText(/read-only checks/i)).toBeInTheDocument()
    })
  })

  it('shows retry when report load fails', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockRejectedValue(new Error('fail'))
    await render(<AdminDataIntegrityReport />)
    await waitFor(() => {
      expect(screen.getByText(/Could not load integrity report/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })
})
