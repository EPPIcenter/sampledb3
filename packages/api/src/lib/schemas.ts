import { z } from 'zod'
import {
  bulkCombinedContainerSchema,
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
  containerInputSchema,
  optionalContainerInputSchema,
} from '@sampledb/contract'

export {
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
} from '@sampledb/contract'

/**
 * Container schema for single specimen creation (POST /).
 * Resolves collections by name/barcode only; does not support collectionLocationId.
 */
export const containerSchema = optionalContainerInputSchema

/**
 * Container schema for POST /specimens/:id/containers (add container to existing specimen).
 * Container object is required; containerType is required.
 */
export const containerSchemaRequired = containerInputSchema

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
