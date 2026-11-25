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
    duplicateSpecimenIdentities: [],
    caseVariantSubjectNames: [],
    caseVariantCollectionNames: [],
    containersInDisallowedContainerType: [],
    exhaustedContainersWithRemainingQuantity: [],
    specimensWithPlaceholderCollectionDate: [],
    specimensWithFutureCollectionDate: [],
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

  it('shows Specimens sharing a Subject, Specimen type and collection date, undated ones as no date', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      duplicateSpecimenIdentities: [
        { studyId: 1, studyShortCode: 'HRP', subjectId: 2, subjectName: 'H-1', specimenTypeId: 3, specimenTypeName: 'DBS', collectionDate: '2022-03-17', specimenIds: [127776, 143389] },
        { studyId: 1, studyShortCode: 'HRP', subjectId: 5, subjectName: 'H-2', specimenTypeId: 3, specimenTypeName: 'DBS', specimenIds: [10, 11] },
      ],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Duplicate Specimens')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    const dated = rows.find((row) => within(row).queryByText('2022-03-17'))!
    expect(within(dated).getByRole('link', { name: 'H-1' })).toHaveAttribute('href', '/subjects/2')
    expect(within(dated).getByRole('link', { name: '127776' })).toHaveAttribute('href', '/specimens/127776')
    expect(within(dated).getByRole('link', { name: '143389' })).toHaveAttribute('href', '/specimens/143389')
    const undated = rows.find((row) => within(row).queryByText('H-2'))!
    expect(within(undated).getByText('No date')).toBeInTheDocument()
  })

  it('shows Subjects whose names differ only by case', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      caseVariantSubjectNames: [{ studyId: 3, studyShortCode: 'CTRL', subjects: [{ id: 31049, name: '3d7_10k' }, { id: 66543, name: '3D7_10K' }] }],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Subject names that differ only by case')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '3d7_10k' })).toHaveAttribute('href', '/subjects/31049')
    expect(screen.getByRole('link', { name: '3D7_10K' })).toHaveAttribute('href', '/subjects/66543')
  })

  it('shows Collections whose names differ only by case or spaces, quoting each name', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      caseVariantCollectionNames: [{ type: 'micronix_plate', collections: [{ id: 1760, name: 'EXVIVO-27 ' }, { id: 1761, name: 'EXVIVO-27' }] }],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Collection names that differ only by case or spaces')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '"EXVIVO-27 "' })).toHaveAttribute('href', '/collections/micronix-plates/1760')
    expect(screen.getByRole('link', { name: '"EXVIVO-27"' })).toHaveAttribute('href', '/collections/micronix-plates/1761')
  })

  it('shows Containers in a Container type their Specimen type does not allow', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      containersInDisallowedContainerType: [
        { id: 153439, containerType: 'micronix_tube', specimenId: 141173, specimenTypeId: 47, specimenTypeName: 'Polyclonal Ab' },
      ],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Containers in a type their Specimen type does not allow')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '153439' })).toHaveAttribute('href', '/containers/153439')
    expect(screen.getByText('Polyclonal Ab')).toBeInTheDocument()
  })

  it('shows exhausted Containers that still have remaining quantity', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      exhaustedContainersWithRemainingQuantity: [{ id: 50465, comment: 'Z20329; exhausted', remainingQuantity: 1 }],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Exhausted Containers with remaining quantity')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '50465' })).toHaveAttribute('href', '/containers/50465')
    expect(screen.getByText('Z20329; exhausted')).toBeInTheDocument()
  })

  it('shows Specimens on a placeholder date and Specimens dated in the future', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      specimensWithPlaceholderCollectionDate: [{ id: 7, collectionDate: '1970-01-01' }],
      specimensWithFutureCollectionDate: [{ id: 8, collectionDate: '2073-02-08' }],
    })
    await render(<AdminDataIntegrityReport />)
    expect(await screen.findByText('Placeholder collection dates')).toBeInTheDocument()
    expect(screen.getByText('Collection dates in the future')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '7' })).toHaveAttribute('href', '/specimens/7')
    expect(screen.getByText('1970-01-01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '8' })).toHaveAttribute('href', '/specimens/8')
    expect(screen.getByText('2073-02-08')).toBeInTheDocument()
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
