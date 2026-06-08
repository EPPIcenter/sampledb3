import { z } from 'zod'
import { containerWriteInputSchema } from '@sampledb/contract'

const legacyDerivationPlacementKeys = [
  'containerType',
  'collectionId',
  'collectionName',
  'collectionType',
  'collectionLocationId',
  'sheetParentType',
  'sheetParentName',
  'containerBarcode',
  'sublabel',
  'position',
] as const

export const createDerivationRequestSchema = z
  .unknown()
  .superRefine((val, ctx) => {
    if (val == null) return
    if (typeof val !== 'object') {
      ctx.addIssue({ code: 'custom', message: 'Invalid derivation request' })
      return
    }
    const record = val as Record<string, unknown>
    for (const key of legacyDerivationPlacementKeys) {
      if (key in record) {
        ctx.addIssue({
          code: 'custom',
          message: 'Use nested container write shape instead of flat placement fields',
        })
        return
      }
    }
  })
  .pipe(
    z.object({
      derivationType: z.string().min(1),
      specimenTypeName: z.string().min(1),
      container: containerWriteInputSchema,
      quantity: z.number().optional(),
      unitSymbol: z.string().optional(),
      quantityUsed: z.number().optional(),
      reduceParentQuantity: z.boolean().optional().default(true),
      derivationDate: z.string().optional(),
      protocol: z.string().optional(),
      notes: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
      operatorId: z.number().int().optional(),
    })
  )

export type CreateDerivationRequest = z.infer<typeof createDerivationRequestSchema>
