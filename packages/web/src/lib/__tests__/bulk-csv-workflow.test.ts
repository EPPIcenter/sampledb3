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
    }
    const specimenCsv = [
      'study_short_code,subject_name,specimen_type_name,plate_name,barcode,position',
      'ST1,S1,Blood,P1,B1,A01',
      '',
      '',
      'ST1,S2,Blood,P1,B2,A02',
    ].join('\n')
    const specimenErrors = await runBulkCsvServerValidation(specimenCsv, specimenCtx)
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
    }
    const subjectCsv = 'study_short_code,subject_name\n\nST1,S1'
    const subjectErrors = await runBulkCsvServerValidation(subjectCsv, subjectCtx)
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
    }
    const combinedCsv = [
      'subject_name,specimen_type_name,plate_name,barcode,position',
      '',
      '',
      '',
      '',
      '',
      'S1,Blood,P1,B1,A01',
    ].join('\n')
    const combinedErrors = await runBulkCsvServerValidation(combinedCsv, combinedCtx)
    expect(combinedErrors).toEqual([{ fileRows: [7], error: 'container.barcode: Required' }])
  })

  it('continues formatting legacy 400 Zod details errors against spreadsheet rows', () => {
    const ctx: BulkCsvWorkflowContext = {
      importType: 'specimens',
      containerType: 'micronix_tube',
      missingCollections: [],
      atomicMode: 'full_file',
    }
    const csv = [
      'study_short_code,subject_name,specimen_type_name,plate_name,barcode,position',
      'ST1,S1,Blood,P1,B1,A01',
      '',
      'ST1,S2,Blood,P1,B2,A02',
    ].join('\n')
    const err = {
      response: {
        status: 400,
        data: {
          error: 'Validation error',
          details: [{ path: ['specimens', 1, 'container', 'barcode'], message: 'Required' }],
        },
      },
    }
    expect(formatBulkCsvRequestError(err, csv, ctx, 'Validation failed')).toEqual([
      { fileRows: [4], error: 'container.barcode: Required' },
    ])
  })
})
