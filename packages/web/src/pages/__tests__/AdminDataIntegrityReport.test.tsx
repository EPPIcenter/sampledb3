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
    containersWithNoGridPosition: [],
    containersWithInvalidGridPosition: [],
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

  it('shows containers with no grid position when present', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      containersWithNoGridPosition: [
        { id: 42, containerType: 'micronix_tube', collectionId: 7 },
      ],
    })
    await render(<AdminDataIntegrityReport />)
    await waitFor(() => {
      expect(screen.getByText('Containers with no grid position')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '42' })).toHaveAttribute('href', '/containers/42')
    })
  })

  it('shows Containers with an invalid Grid position, with the stored position and a Collection link', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      containersWithInvalidGridPosition: [
        { id: 51, containerType: 'cryovial_tube', collectionId: 790, position: '--A01' },
      ],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Containers with an invalid Grid position')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '51' })).toHaveAttribute('href', '/containers/51')
    expect(screen.getByRole('link', { name: '790' })).toHaveAttribute('href', '/collections/cryovial-boxes/790')
    expect(screen.getByText('--A01')).toBeInTheDocument()
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
