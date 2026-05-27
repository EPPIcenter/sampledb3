import { z } from 'zod'

const containerTypeEnum = z.enum(['micronix_tube', 'cryovial_tube', 'paper', 'static_well'])

const collectionTypeEnum = z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box'])

const atomicModeEnum = z.enum(['full_file', 'per_subject'])

/**
 * Container fields on a specimen row in combined bulk import.
 * Supports collection creation via collectionLocationId when the collection is missing.
 */
export const bulkCombinedContainerSchema = z
  .object({
    containerType: containerTypeEnum.optional(),
    collectionName: z.string().optional(),
    collectionBarcode: z.string().optional(),
    barcode: z.string().optional(),
    position: z.string().optional(),
    label: z.string().optional(),
    unitId: z.number().int().optional(),
    totalQuantity: z.number().optional(),
    remainingQuantity: z.number().optional(),
    comment: z.string().optional(),
    collectionLocationId: z.number().int().optional(),
  })
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

export const bulkCombinedCreateCollectionSchema = z.object({
  type: collectionTypeEnum,
  name: z.string().min(1),
  locationId: z.number().int(),
  barcode: z.string().optional(),
})

/** POST /imports/bulk-combined request body */
export const bulkCombinedRequestSchema = z.object({
  studyShortCode: z.string().min(1),
  atomicMode: atomicModeEnum,
  createCollections: z.array(bulkCombinedCreateCollectionSchema).optional(),
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
export type BulkCombinedCreateCollection = z.infer<typeof bulkCombinedCreateCollectionSchema>
export type BulkCombinedRequest = z.infer<typeof bulkCombinedRequestSchema>
export type BulkCombinedValidateRequest = z.infer<typeof bulkCombinedValidateRequestSchema>
