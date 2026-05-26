import { z } from 'zod'

export const createBloodControlBatchSchema = z.object({
  name: z.string().min(1).optional(),
  productionDate: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
})

export const batchContainerInputSchema = z.object({
  type: z.enum(['paper', 'cryovial_tube', 'micronix_tube']),
  collectionId: z.number().int().optional(),
  collectionName: z.string().optional(),
  collectionLocationId: z.number().int().optional(),
  collectionType: z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box']).optional(),
  containerBarcode: z.string().optional(),
  position: z.string().optional(),
  quantity: z.number().optional(),
  unitSymbol: z.string().optional(),
  sheetName: z.string().optional(),
})

export const batchSpecimenInputSchema = z.object({
  specimenTypeName: z.string().min(1),
  collectionDate: z.string().optional(),
  containers: z.array(batchContainerInputSchema),
})

export const batchCollectionCreateSchema = z.object({
  type: z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box']),
  name: z.string().min(1),
  locationId: z.number().int(),
  barcode: z.string().optional(),
})

export const createBatchWithSpecimensSchema = z.object({
  batch: z.object({
    controlDefinitionId: z.number().int(),
    name: z.string().min(1),
    productionDate: z.string().optional(),
    properties: z.record(z.string(), z.any()).optional(),
  }),
  specimens: z.array(batchSpecimenInputSchema).min(1),
  createCollections: z.array(batchCollectionCreateSchema).optional(),
})

export const addSpecimensToBatchSchema = z.object({
  specimens: z.array(batchSpecimenInputSchema).min(1),
  createCollections: z.array(batchCollectionCreateSchema).optional(),
})

export const validateControlBatchCsvSchema = z.object({
  csvText: z.string().min(1),
})

export type CreateBloodControlBatchInput = z.infer<typeof createBloodControlBatchSchema>
export type CreateBatchWithSpecimensInput = z.infer<typeof createBatchWithSpecimensSchema>
export type AddSpecimensToBatchInput = z.infer<typeof addSpecimensToBatchSchema>
