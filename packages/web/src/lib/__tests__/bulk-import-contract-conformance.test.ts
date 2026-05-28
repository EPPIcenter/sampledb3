import { describe, it, expect } from 'vitest'
import {
  bulkCombinedValidateRequestSchema,
  bulkCombinedValidateResponseSchema,
  bulkCombinedImportResponseSchema,
} from '@sampledb/contract'
import { buildBulkCombinedRequestPayload } from '../bulk-import-payload'

describe('bulk import contract conformance', () => {
  it('web-built validate payload satisfies bulkCombinedValidateRequestSchema', () => {
    const payload = buildBulkCombinedRequestPayload(
      [
        {
          studyShortCode: 'STUDY1',
          subjectName: 'SUBJ-1',
          specimenTypeName: 'Whole Blood',
          collectionDate: '2025-01-01',
          container: {
            containerType: 'micronix_tube',
            collectionName: 'Plate-A',
            barcode: 'BC-1',
            position: 'A01',
          },
        },
        {
          studyShortCode: 'STUDY1',
          subjectName: 'SUBJ-2',
          specimenTypeName: 'Plasma',
        },
      ],
      {
        containerType: 'micronix_tube',
        fixedStudyShortCode: 'STUDY1',
        missingCollections: [{ name: 'Plate-A', locationId: 42, barcode: 'PLT-A' }],
        atomicMode: 'full_file',
      }
    )

    const result = bulkCombinedValidateRequestSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('rejects payloads with invalid atomicMode', () => {
    const payload = buildBulkCombinedRequestPayload(
      [
        {
          studyShortCode: 'S',
          subjectName: 'Sub1',
          specimenTypeName: 'T',
        },
      ],
      {
        containerType: 'none',
        fixedStudyShortCode: 'S',
        missingCollections: [],
        atomicMode: 'per_subject',
      }
    )

    const malformed = { ...payload, atomicMode: 'invalid_mode' as typeof payload.atomicMode }
    const result = bulkCombinedValidateRequestSchema.safeParse(malformed)
    expect(result.success).toBe(false)
  })

  it('accepts representative validate response fixture', () => {
    const result = bulkCombinedValidateResponseSchema.safeParse({
      valid: false,
      errors: [{ subjectIndex: 0, rowIndex: 2, message: 'Duplicate barcode' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts representative import response fixture', () => {
    const result = bulkCombinedImportResponseSchema.safeParse({
      summary: {
        subjectsCreated: 1,
        subjectsUpdated: 0,
        specimensCreated: 2,
        containersCreated: 2,
      },
      errors: [{ index: 1, error: 'Subject failed' }],
    })
    expect(result.success).toBe(true)
  })
})
