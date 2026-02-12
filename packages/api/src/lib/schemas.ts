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
 * Extended container schema for bulk endpoints (POST /bulk, imports) that support
 * collection creation. Includes collectionLocationId for creating collections when missing.
 */
export const containerSchemaWithLocation = baseContainerObject
  .extend({
    collectionLocationId: z.number().int().optional(),
  })
  .optional()
