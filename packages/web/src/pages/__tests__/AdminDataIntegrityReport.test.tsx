import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
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
    specimensWithNonIsoCollectionDate: [],
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

  it('shows specimens whose collection date is not ISO', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      specimensWithNonIsoCollectionDate: [{ id: 143200, collectionDate: '9/14/20' }],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Collection date not ISO')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '143200' })).toHaveAttribute('href', '/specimens/143200')
    expect(screen.getByText('9/14/20')).toBeInTheDocument()
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

  it('lists duplicated tube barcodes with their spellings and tube types', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      duplicateBarcodes: [
        { barcode: 'CK3-3FR4', variants: ['CK3-3FR4', 'ck3-3fr4 '], containerTypes: ['cryovial_tube', 'micronix_tube'], ids: [42911, 137291] },
      ],
    })
    await render(<AdminDataIntegrityReport />)
    const row = (await screen.findByRole('cell', { name: 'CK3-3FR4' })).closest('tr')!
    expect(within(row).getByRole('cell', { name: '"CK3-3FR4", "ck3-3fr4 "' })).toBeInTheDocument()
    expect(within(row).getByRole('cell', { name: 'cryovial_tube, micronix_tube' })).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: '137291' })).toHaveAttribute('href', '/containers/137291')
    expect(screen.getByText('Duplicate tube barcodes')).toBeInTheDocument()
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
