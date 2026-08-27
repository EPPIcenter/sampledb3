import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminDataIntegrityEmptyCollections from '../AdminDataIntegrityEmptyCollections'
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
      deleteEmptyCollections: vi.fn().mockResolvedValue({ deleted: 0 }),
    },
  })
})

describe('AdminDataIntegrityEmptyCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue(emptyIntegrityReport())
  })

  it('shows empty state when no empty collections', async () => {
    await render(<AdminDataIntegrityEmptyCollections />)
    await waitFor(() => {
      expect(screen.getByText(/No empty collections found/i)).toBeInTheDocument()
    })
  })

  it('shows retry when report load fails', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockRejectedValue(new Error('fail'))
    await render(<AdminDataIntegrityEmptyCollections />)
    await waitFor(() => {
      expect(screen.getByText(/Could not load empty collections/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })
})
