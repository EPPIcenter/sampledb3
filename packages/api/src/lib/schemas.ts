import { z } from 'zod'
import {
  bulkCombinedContainerSchema,
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
} from '@sampledb/contract'

export {
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
} from '@sampledb/contract'

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
export const containerSchemaWithLocation = bulkCombinedContainerSchema

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
