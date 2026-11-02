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
      duplicateBarcodes: [{ barcode: 'DUP', variants: ['DUP'], containerTypes: ['micronix_tube'], ids: [1, 2] }],
      containersWithNoGridPosition: [
        { id: 9, containerType: 'micronix_tube', collectionId: 3 },
      ],
    })
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /integrity report/i })).toHaveTextContent('1')
    })
  })

  it('counts specimens whose collection date is not ISO as integrity issues', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      specimensWithNonIsoCollectionDate: [
        { id: 1, collectionDate: '5/7/24' },
        { id: 2, collectionDate: '9/14/2020' },
      ],
    })
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /integrity report/i })).toHaveTextContent('2')
    })
  })

  it('counts Containers with an invalid Grid position as integrity issues', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      containersWithInvalidGridPosition: [
        { id: 1, containerType: 'cryovial_tube', collectionId: 790, position: '--A01' },
        { id: 2, containerType: 'micronix_tube', collectionId: 254, position: 'A1145854300' },
      ],
    })
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /integrity report/i })).toHaveTextContent('2')
    })
  })

  it('counts every legacy data check as integrity issues', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockResolvedValue({
      ...emptyIntegrityReport(),
      duplicateSpecimenIdentities: [
        { studyId: 1, studyShortCode: 'S', subjectId: 2, subjectName: 'A', specimenTypeId: 3, specimenTypeName: 'DBS', specimenIds: [4, 5] },
      ],
      caseVariantSubjectNames: [{ studyId: 1, studyShortCode: 'CTRL', subjects: [{ id: 1, name: 'a' }, { id: 2, name: 'A' }] }],
      caseVariantCollectionNames: [{ type: 'micronix_plate', collections: [{ id: 1, name: 'P' }, { id: 2, name: 'P ' }] }],
      containersInDisallowedContainerType: [
        { id: 1, containerType: 'micronix_tube', specimenId: 2, specimenTypeId: 3, specimenTypeName: 'Polyclonal Ab' },
      ],
      exhaustedContainersWithRemainingQuantity: [{ id: 1, comment: 'exhausted', remainingQuantity: 1 }],
      specimensWithPlaceholderCollectionDate: [{ id: 1, collectionDate: '1970-01-01' }],
      specimensWithFutureCollectionDate: [{ id: 2, collectionDate: '2073-02-08' }],
    })
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /integrity report/i })).toHaveTextContent('7')
    })
    expect(screen.getByRole('link', { name: /integrity report/i })).toHaveTextContent(/duplicate tube barcodes/i)
  })

  it('shows retry when report load fails', async () => {
    vi.mocked(adminApi.getIntegrityReport).mockRejectedValue(new Error('fail'))
    await render(<AdminDataIntegrityOverview />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })
})
