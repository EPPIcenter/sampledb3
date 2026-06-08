import { z } from 'zod'

const micronixPlateCollectionWriteSchema = z
  .object({
    type: z.literal('micronix_plate'),
    id: z.number().int().optional(),
    name: z.string().min(1).optional(),
    barcode: z.string().min(1).optional(),
    position: z.string().optional(),
    locationId: z.number().int().optional(),
  })
  .strict()

const cryovialBoxCollectionWriteSchema = z
  .object({
    type: z.literal('cryovial_box'),
    id: z.number().int().optional(),
    name: z.string().min(1).optional(),
    barcode: z.string().min(1).optional(),
    position: z.string().optional(),
    locationId: z.number().int().optional(),
  })
  .strict()

const boxParentWriteSchema = z
  .object({
    type: z.literal('box'),
    id: z.number().int().optional(),
    name: z.string().min(1).optional(),
    locationId: z.number().int().optional(),
  })
  .strict()

const bagParentWriteSchema = z
  .object({
    type: z.literal('bag'),
    id: z.number().int().optional(),
    name: z.string().min(1).optional(),
    locationId: z.number().int().optional(),
  })
  .strict()

const sheetParentWriteSchema = z.discriminatedUnion('type', [
  boxParentWriteSchema,
  bagParentWriteSchema,
])

const sheetCollectionWriteSchema = z
  .object({
    type: z.literal('sheet'),
    id: z.number().int().optional(),
    name: z.string().min(1).optional(),
    parent: sheetParentWriteSchema.optional(),
  })
  .strict()

const micronixContainerWriteInputSchema = z
  .object({
    containerType: z.literal('micronix_tube'),
    barcode: z.string().min(1),
    collection: micronixPlateCollectionWriteSchema.optional(),
    comment: z.string().optional(),
  })
  .strict()

const cryovialContainerWriteInputSchema = z
  .object({
    containerType: z.literal('cryovial_tube'),
    barcode: z.string().min(1).optional(),
    collection: cryovialBoxCollectionWriteSchema.optional(),
    comment: z.string().optional(),
  })
  .strict()

const paperContainerWriteInputSchema = z
  .object({
    containerType: z.literal('paper'),
    sublabel: z.string().optional(),
    collection: sheetCollectionWriteSchema.optional(),
    comment: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const extra = data as typeof data & { barcode?: string; position?: string }
    if (extra.barcode != null && extra.barcode.trim() !== '') {
      ctx.addIssue({
        code: 'custom',
        message: 'Paper containers use sublabel for spot identifiers, not barcode',
        path: ['barcode'],
      })
    }
    if (extra.position != null && extra.position.trim() !== '') {
      ctx.addIssue({
        code: 'custom',
        message: 'Paper containers use sublabel, not position',
        path: ['position'],
      })
    }
  })

const staticWellContainerWriteInputSchema = z
  .object({
    containerType: z.literal('static_well'),
    collection: micronixPlateCollectionWriteSchema.optional(),
    comment: z.string().optional(),
  })
  .strict()

export const containerWriteInputSchema = z.discriminatedUnion('containerType', [
  micronixContainerWriteInputSchema,
  cryovialContainerWriteInputSchema,
  paperContainerWriteInputSchema,
  staticWellContainerWriteInputSchema,
])

export type ContainerWriteInput = z.infer<typeof containerWriteInputSchema>
export type ContainerWriteType = ContainerWriteInput['containerType']
