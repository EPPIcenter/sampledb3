import { z } from 'zod'

const baseContainerObject = z.object({
  containerType: z.enum(['micronix_tube', 'cryovial_tube', 'paper', 'static_well']).optional(),
  collectionName: z.string().optional(),
  collectionBarcode: z.string().optional(),
  barcode: z.string().optional(),
  position: z.string().optional(),
  label: z.string().optional(),
  unitId: z.number().int().optional(),
  totalQuantity: z.number().optional(),
  remainingQuantity: z.number().optional(),
  comment: z.string().optional(),
})

/**
 * Container schema for single specimen creation (POST /).
 * Resolves collections by name/barcode only; does not support collectionLocationId.
 */
export const containerSchema = baseContainerObject.optional()

/**
 * Container schema for POST /specimens/:id/containers (add container to existing specimen).
 * Container object is required; containerType is required.
 */
export const containerSchemaRequired = baseContainerObject.extend({
  containerType: z.enum(['micronix_tube', 'cryovial_tube', 'paper', 'static_well']),
})

/**
 * Extended container schema for bulk endpoints (POST /bulk, imports) that support
 * collection creation. Includes collectionLocationId for creating collections when missing.
 */
export const containerSchemaWithLocation = baseContainerObject
  .extend({
    collectionLocationId: z.number().int().optional(),
  })
  .optional()

const bulkCombinedSubjectSpecimenSchema = z.object({
  specimenTypeName: z.string().min(1),
  collectionDate: z.string().optional(),
  container: containerSchemaWithLocation,
})

const bulkCombinedSubjectSchema = z.object({
  subjectName: z.string().min(1),
  specimens: z.array(bulkCombinedSubjectSpecimenSchema),
})

/** POST /imports/bulk-combined and POST /imports/bulk-combined/validate */
export const bulkCombinedRequestSchema = z.object({
  studyShortCode: z.string().min(1),
  atomicMode: z.enum(['full_file', 'per_subject']),
  createCollections: z
    .array(
      z.object({
        type: z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box']),
        name: z.string().min(1),
        locationId: z.number().int(),
        barcode: z.string().optional(),
      })
    )
    .optional(),
  subjects: z.array(bulkCombinedSubjectSchema),
})

/** Validate endpoint allows optional rowIndex per specimen for CSV alignment */
export const bulkCombinedValidateRequestSchema = bulkCombinedRequestSchema.extend({
  subjects: z.array(
    bulkCombinedSubjectSchema.extend({
      specimens: z.array(
        bulkCombinedSubjectSpecimenSchema.extend({
          rowIndex: z.number().int().optional(),
        })
      ),
    })
  ),
})

/** POST /subjects/with-specimens */
export const withSpecimensRequestSchema = z.object({
  studyShortCode: z.string().min(1),
  subjectName: z.string().min(1),
  specimens: z.array(
    z.object({
      specimenTypeName: z.string().min(1),
      collectionDate: z.string().optional(),
      container: containerSchemaWithLocation,
    })
  ),
})
