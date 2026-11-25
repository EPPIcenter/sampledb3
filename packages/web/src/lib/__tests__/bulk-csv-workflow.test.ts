import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('specimens', {
    specimensApi: {
      validateBulk: vi.fn(),
      createBulk: vi.fn(),
    },
  })
})

vi.mock('../api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('subjects', {
    subjectsApi: {
      validateBulk: vi.fn(),
      createBulk: vi.fn(),
    },
  })
})

vi.mock('../api/imports', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('imports', {
    importsApi: {
      bulkCombinedValidate: vi.fn(),
      bulkCombined: vi.fn(),
    },
  })
})

import { specimensApi } from '../api/specimens'
import { subjectsApi } from '../api/subjects'
import { importsApi } from '../api/imports'
import {
  formatBulkCsvRequestError,
  runBulkCsvServerValidation,
  type BulkCsvWorkflowContext,
} from '../bulk-csv-workflow'

describe('bulk-csv-workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps row-level validate responses for specimens, subjects, and combined imports to spreadsheet rows', async () => {
    vi.mocked(specimensApi.validateBulk).mockResolvedValue({
      valid: false,
      errors: [{ index: 1, message: 'container.barcode: Required' }],
    })
    const specimenCtx: BulkCsvWorkflowContext = {
      importType: 'specimens',
      containerType: 'micronix_tube',
      missingCollections: [],
      atomicMode: 'full_file',
      fileRows: [2, 5],
    }
    const specimenErrors = await runBulkCsvServerValidation(
      [
        { sourceType: 'subject', studyShortCode: 'ST1', subjectName: 'S1', specimenTypeName: 'Blood' },
        { sourceType: 'subject', studyShortCode: 'ST1', subjectName: 'S2', specimenTypeName: 'Blood' },
      ],
      specimenCtx,
    )
    expect(specimenErrors).toEqual([{ fileRows: [5], error: 'container.barcode: Required' }])

    vi.mocked(subjectsApi.validateBulk).mockResolvedValue({
      valid: false,
      errors: [{ index: 0, message: 'name: Too small' }],
    })
    const subjectCtx: BulkCsvWorkflowContext = {
      importType: 'subjects',
      containerType: '',
      missingCollections: [],
      atomicMode: 'full_file',
      fileRows: [3],
    }
    const subjectErrors = await runBulkCsvServerValidation(
      [{ studyShortCode: 'ST1', name: '' }],
      subjectCtx,
    )
    expect(subjectErrors).toEqual([{ fileRows: [3], error: 'name: Too small' }])

    vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue({
      valid: false,
      errors: [{ subjectIndex: 0, specimenIndex: 0, rowIndex: 7, message: 'container.barcode: Required' }],
    })
    const combinedCtx: BulkCsvWorkflowContext = {
      importType: 'combined',
      containerType: 'micronix_tube',
      fixedStudyShortCode: 'ST1',
      missingCollections: [],
      atomicMode: 'full_file',
      fileRows: [7],
    }
    const combinedErrors = await runBulkCsvServerValidation(
      [{ subjectName: 'S1', specimenTypeName: 'Blood' }],
      combinedCtx,
    )
    expect(combinedErrors).toEqual([{ fileRows: [7], error: 'container.barcode: Required' }])
  })

  it('continues formatting legacy 400 Zod details errors against spreadsheet rows', () => {
    const ctx: BulkCsvWorkflowContext = {
      importType: 'specimens',
      containerType: 'micronix_tube',
      missingCollections: [],
      atomicMode: 'full_file',
      fileRows: [2, 4],
    }
    const err = {
      response: {
        status: 400,
        data: {
          error: 'Validation error',
          details: [{ path: ['specimens', 1, 'container', 'barcode'], message: 'Required' }],
        },
      },
    }
    expect(formatBulkCsvRequestError(err, [{}, {}], ctx, 'Validation failed')).toEqual([
      { fileRows: [4], error: 'container.barcode: Required' },
    ])
  })
})
