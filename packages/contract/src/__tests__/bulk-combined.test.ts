import { describe, it, expect } from 'bun:test'
import {
  bulkCombinedContainerSchema,
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
  bulkCombinedValidateResponseSchema,
  bulkCombinedImportResponseSchema,
  optionalContainerInputSchema,
} from '../bulk-combined'

const validPayload = {
  studyShortCode: 'STUDY1',
  atomicMode: 'full_file' as const,
  subjects: [
    {
      subjectName: 'SUBJ-1',
      specimens: [
        {
          specimenTypeName: 'Whole Blood',
          collectionDate: '2025-01-01',
          container: {
            containerType: 'micronix_tube' as const,
            barcode: 'BC-1',
            collection: {
              type: 'micronix_plate' as const,
              name: 'Plate-A',
              position: 'A01',
            },
          },
        },
      ],
    },
  ],
}

describe('bulkCombinedRequestSchema', () => {
  it('accepts a valid combined import payload', () => {
    const result = bulkCombinedRequestSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.studyShortCode).toBe('STUDY1')
      expect(result.data.subjects).toHaveLength(1)
    }
  })

  it('rejects legacy flat collectionName on container', () => {
    const result = bulkCombinedRequestSchema.safeParse({
      ...validPayload,
      subjects: [
        {
          subjectName: 'SUBJ-1',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: {
                containerType: 'micronix_tube' as const,
                collectionName: 'Plate-A',
                barcode: 'BC-1',
                position: 'A01',
              },
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty studyShortCode', () => {
    const result = bulkCombinedRequestSchema.safeParse({
      ...validPayload,
      studyShortCode: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid atomicMode', () => {
    const result = bulkCombinedRequestSchema.safeParse({
      ...validPayload,
      atomicMode: 'per_row',
    })
    expect(result.success).toBe(false)
  })

  it('rejects subject without specimens array', () => {
    const result = bulkCombinedRequestSchema.safeParse({
      studyShortCode: 'S',
      atomicMode: 'per_subject',
      subjects: [{ subjectName: 'A' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects specimen without specimenTypeName', () => {
    const result = bulkCombinedRequestSchema.safeParse({
      studyShortCode: 'S',
      atomicMode: 'per_subject',
      subjects: [
        {
          subjectName: 'A',
          specimens: [{ collectionDate: '2025-01-01' }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid container type', () => {
    const result = bulkCombinedRequestSchema.safeParse({
      ...validPayload,
      subjects: [
        {
          subjectName: 'SUBJ-1',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              container: { containerType: 'vial' },
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('bulkCombinedValidateRequestSchema', () => {
  it('accepts rowIndex on specimens', () => {
    const result = bulkCombinedValidateRequestSchema.safeParse({
      ...validPayload,
      subjects: [
        {
          subjectName: 'SUBJ-1',
          specimens: [
            {
              specimenTypeName: 'Whole Blood',
              rowIndex: 2,
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subjects[0]?.specimens[0]?.rowIndex).toBe(2)
    }
  })

  it('rejects non-integer rowIndex', () => {
    const result = bulkCombinedValidateRequestSchema.safeParse({
      ...validPayload,
      subjects: [
        {
          subjectName: 'SUBJ-1',
          specimens: [{ specimenTypeName: 'Whole Blood', rowIndex: 1.5 }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('bulkCombinedValidateResponseSchema', () => {
  it('accepts valid validate response', () => {
    const result = bulkCombinedValidateResponseSchema.safeParse({
      valid: true,
      errors: [],
    })
    expect(result.success).toBe(true)
  })
})

describe('bulkCombinedImportResponseSchema', () => {
  it('accepts import summary without errors', () => {
    const result = bulkCombinedImportResponseSchema.safeParse({
      summary: {
        subjectsCreated: 1,
        subjectsUpdated: 0,
        specimensCreated: 1,
        containersCreated: 1,
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('paper inbound fields', () => {
  it('rejects barcode on paper container rows', () => {
    const result = bulkCombinedContainerSchema.safeParse({
      containerType: 'paper' as const,
      barcode: 'P-1',
      collection: {
        type: 'sheet' as const,
        name: 'Sheet-A',
        parent: { type: 'bag' as const, name: 'Bag1' },
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('optionalContainerInputSchema', () => {
  it('accepts undefined container', () => {
    expect(optionalContainerInputSchema.safeParse(undefined).success).toBe(true)
  })

  it('accepts micronix write shape', () => {
    const result = optionalContainerInputSchema.safeParse({
      containerType: 'micronix_tube' as const,
      barcode: 'BC-1',
      collection: { type: 'micronix_plate' as const, name: 'Plate-A', position: 'A01' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects legacy flat collectionName', () => {
    const result = optionalContainerInputSchema.safeParse({
      containerType: 'micronix_tube' as const,
      collectionName: 'Plate-A',
      barcode: 'BC-1',
      position: 'A01',
    })
    expect(result.success).toBe(false)
  })
})
