import { z } from 'zod'
import { containerWriteInputSchema, refinePaperContainerInboundWrite } from '@sampledb/contract'

const batchContainerExtraFieldsSchema = z.object({
  quantity: z.number().optional(),
  unitSymbol: z.string().optional(),
})

const batchContainerCoreSchema = containerWriteInputSchema
  .and(batchContainerExtraFieldsSchema)
  .superRefine((data, ctx) => {
    if (data.containerType === 'static_well') {
      ctx.addIssue({
        code: 'custom',
        message: 'static_well is not supported in control batch create-with-specimens',
      })
    }
    refinePaperContainerInboundWrite(data, ctx)
  })

export const batchContainerInputSchema = z
  .unknown()
  .superRefine((val, ctx) => {
    if (val == null) return
    if (typeof val !== 'object') {
      ctx.addIssue({ code: 'custom', message: 'Invalid container object' })
      return
    }
    const record = val as Record<string, unknown>
    if ('type' in record) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use containerType instead of type',
        path: ['type'],
      })
    }
    if (
      'collectionName' in record ||
      'collectionLocationId' in record ||
      'collectionId' in record ||
      'collectionType' in record ||
      'containerBarcode' in record ||
      'sheetName' in record
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use nested collection placement instead of flat collectionName/sheetName fields',
      })
    }
    refinePaperContainerInboundWrite(record as Parameters<typeof refinePaperContainerInboundWrite>[0], ctx)
  })
  .pipe(batchContainerCoreSchema)

export const batchSpecimenInputSchema = z.object({
  specimenTypeName: z.string().min(1),
  collectionDate: z.string().optional(),
  containers: z.array(batchContainerInputSchema),
})

export const createBloodControlBatchSchema = z.object({
  name: z.string().min(1).optional(),
  productionDate: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
})

export const createBatchWithSpecimensSchema = z.object({
  batch: z.object({
    controlDefinitionId: z.number().int(),
    name: z.string().min(1),
    productionDate: z.string().optional(),
    properties: z.record(z.string(), z.any()).optional(),
  }),
  specimens: z.array(batchSpecimenInputSchema).min(1),
})

export const addSpecimensToBatchSchema = z.object({
  specimens: z.array(batchSpecimenInputSchema).min(1),
})

export const validateControlBatchCsvSchema = z.object({
  csvText: z.string().min(1),
})

export type CreateBloodControlBatchInput = z.infer<typeof createBloodControlBatchSchema>
export type BatchContainerInput = z.infer<typeof batchContainerInputSchema>
export type CreateBatchWithSpecimensInput = z.infer<typeof createBatchWithSpecimensSchema>
export type AddSpecimensToBatchInput = z.infer<typeof addSpecimensToBatchSchema>
