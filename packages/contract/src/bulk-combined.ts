import { z } from 'zod'
import { refinePaperContainerInboundWrite } from './paper-container-inbound'
import { containerWriteInputSchema } from './write/container-write-input'

const atomicModeEnum = z.enum(['full_file', 'per_subject'])

const bulkCombinedContainerBatchFieldsSchema = z.object({
  unitId: z.number().int().optional(),
  totalQuantity: z.number().optional(),
  remainingQuantity: z.number().optional(),
})

const bulkCombinedContainerCoreSchema = containerWriteInputSchema.and(
  bulkCombinedContainerBatchFieldsSchema,
)

/** Bulk combined container: unified write shape plus optional quantity overrides. */
export const bulkCombinedContainerSchema = z
  .unknown()
  .superRefine((val, ctx) => {
    if (val == null) return
    if (typeof val !== 'object') {
      ctx.addIssue({ code: 'custom', message: 'Invalid container object' })
      return
    }
    const record = val as Record<string, unknown>
    if (
      'collectionName' in record ||
      'collectionLocationId' in record ||
      'sheetName' in record ||
      'collectionBarcode' in record
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use nested collection placement instead of flat collectionName/sheetName fields',
      })
    }
    refinePaperContainerInboundWrite(record as Parameters<typeof refinePaperContainerInboundWrite>[0], ctx)
  })
  .pipe(bulkCombinedContainerCoreSchema)
  .optional()

export const bulkCombinedSubjectSpecimenSchema = z.object({
  specimenTypeName: z.string().min(1),
  collectionDate: z.string().optional(),
  container: bulkCombinedContainerSchema,
})

export const bulkCombinedSubjectSchema = z.object({
  subjectName: z.string().min(1),
  specimens: z.array(bulkCombinedSubjectSpecimenSchema),
})

/** POST /imports/bulk-combined request body */
export const bulkCombinedRequestSchema = z.object({
  studyShortCode: z.string().min(1),
  atomicMode: atomicModeEnum,
  subjects: z.array(bulkCombinedSubjectSchema),
})

/** POST /imports/bulk-combined/validate — specimens may include rowIndex for CSV alignment */
export const bulkCombinedValidateRequestSchema = bulkCombinedRequestSchema.extend({
  subjects: z.array(
    bulkCombinedSubjectSchema.extend({
      specimens: z.array(
        bulkCombinedSubjectSpecimenSchema.extend({
          rowIndex: z.number().int().optional(),
        }),
      ),
    }),
  ),
})

export type BulkCombinedContainer = z.infer<typeof bulkCombinedContainerSchema>
export type BulkCombinedSubjectSpecimen = z.infer<typeof bulkCombinedSubjectSpecimenSchema>
export type BulkCombinedSubject = z.infer<typeof bulkCombinedSubjectSchema>
export type BulkCombinedRequest = z.infer<typeof bulkCombinedRequestSchema>
export type BulkCombinedValidateRequest = z.infer<typeof bulkCombinedValidateRequestSchema>

const singleSpecimenContainerBatchFieldsSchema = z.object({
  unitId: z.number().int().optional(),
  totalQuantity: z.number().optional(),
  remainingQuantity: z.number().optional(),
})

const singleSpecimenContainerCoreSchema = containerWriteInputSchema.and(
  singleSpecimenContainerBatchFieldsSchema,
)

function refineSingleSpecimenContainerInbound(val: unknown, ctx: z.RefinementCtx): void {
  if (val == null) return
  if (typeof val !== 'object') {
    ctx.addIssue({ code: 'custom', message: 'Invalid container object' })
    return
  }
  const record = val as Record<string, unknown>
  if (
    'collectionName' in record ||
    'collectionLocationId' in record ||
    'sheetName' in record ||
    'collectionBarcode' in record
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Use nested collection placement instead of flat collectionName/sheetName fields',
    })
  }
  refinePaperContainerInboundWrite(record as Parameters<typeof refinePaperContainerInboundWrite>[0], ctx)
}

/** Optional unified write container for POST /specimens (container not required). */
export const optionalContainerInputSchema = z
  .unknown()
  .superRefine(refineSingleSpecimenContainerInbound)
  .pipe(singleSpecimenContainerCoreSchema)
  .optional()

export const bulkCombinedValidateErrorSchema = z.object({
  subjectIndex: z.number().int(),
  specimenIndex: z.number().int().optional(),
  rowIndex: z.number().int().optional(),
  message: z.string(),
})

export const bulkCombinedValidateResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(bulkCombinedValidateErrorSchema),
})

export const bulkCombinedImportSummarySchema = z.object({
  subjectsCreated: z.number().int(),
  subjectsUpdated: z.number().int(),
  specimensCreated: z.number().int(),
  containersCreated: z.number().int(),
})

export const bulkCombinedImportErrorSchema = z.object({
  index: z.number().int(),
  error: z.string(),
})

export const bulkCombinedImportResponseSchema = z.object({
  summary: bulkCombinedImportSummarySchema,
  errors: z.array(bulkCombinedImportErrorSchema).optional(),
})

export const collectionDeleteBlockerSchema = z.object({
  code: z.string(),
  message: z.string(),
  count: z.number().int().optional(),
})

export const collectionDeletePreflightSchema = z.object({
  canDelete: z.boolean(),
  blockers: z.array(collectionDeleteBlockerSchema),
  summary: z.object({
    containerCount: z.number().int(),
    specimenCount: z.number().int(),
  }),
})

export type BulkCombinedValidateError = z.infer<typeof bulkCombinedValidateErrorSchema>
export type BulkCombinedValidateResponse = z.infer<typeof bulkCombinedValidateResponseSchema>
export type BulkCombinedImportSummary = z.infer<typeof bulkCombinedImportSummarySchema>
export type BulkCombinedImportResponse = z.infer<typeof bulkCombinedImportResponseSchema>
export type CollectionDeletePreflight = z.infer<typeof collectionDeletePreflightSchema>
