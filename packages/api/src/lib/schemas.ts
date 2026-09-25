import { z } from 'zod'
import {
  bulkCombinedContainerSchema,
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
  optionalContainerInputSchema,
} from '@sampledb/contract'

export {
  bulkCombinedRequestSchema,
  bulkCombinedValidateRequestSchema,
} from '@sampledb/contract'

/**
 * Container schema for POST /specimens and POST /specimens/:id/containers.
 * Unified ContainerWriteInput shape (ADR 0006); resolves existing collections by id/name/barcode only.
 */
export const containerSchema = optionalContainerInputSchema

/**
 * Extended container schema for bulk endpoints (POST /bulk, imports).
 * Nested collection.locationId (or collection.parent.locationId for paper) supports create-by-name.
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
