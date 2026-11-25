import { describe, it, expect } from 'vitest'
import {
  bulkCombinedValidateRequestSchema,
  bulkCombinedValidateResponseSchema,
  bulkCombinedImportResponseSchema,
  mapBulkImportTemplateCsv,
} from '@sampledb/contract'

describe('bulk import contract conformance', () => {
  it('template-mapped validate payload satisfies bulkCombinedValidateRequestSchema', () => {
    const csv = [
      'subject_name,specimen_type_name,collection_date,plate_name,barcode,position',
      'SUBJ-1,Whole Blood,2025-01-01,Plate-A,BC-1,A01',
    ].join('\n')
    const mapped = mapBulkImportTemplateCsv(csv, {
      containerType: 'micronix_tube',
      defaultStudyShortCode: 'STUDY1',
      collections: [{ type: 'micronix_plate', name: 'Plate-A', locationId: 42, barcode: 'PLT-A' }],
      atomicMode: 'full_file',
    })
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return

    const payload = mapped.validateRequest
    const result = bulkCombinedValidateRequestSchema.safeParse(payload)
    expect(result.success).toBe(true)
    const container = payload.subjects[0]!.specimens[0]!.container
    expect(container).toEqual({
      containerType: 'micronix_tube',
      barcode: 'BC-1',
      collection: {
        type: 'micronix_plate',
        name: 'Plate-A',
        barcode: 'PLT-A',
        position: 'A01',
        locationId: 42,
      },
    })
    expect(payload).not.toHaveProperty('createCollections')
  })

  it('rejects payloads with invalid atomicMode', () => {
    const mapped = mapBulkImportTemplateCsv('subject_name,specimen_type_name\nSub1,T', {
      containerType: 'none',
      defaultStudyShortCode: 'S',
      atomicMode: 'per_subject',
    })
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return

    const payload = mapped.validateRequest
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
