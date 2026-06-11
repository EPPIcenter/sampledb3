import { z } from 'zod'

const sheetPlacementWireSchema = z
  .object({
    type: z.literal('sheet'),
    id: z.number(),
    name: z.string(),
  })
  .strict()

const micronixPlatePlacementWireSchema = z
  .object({
    type: z.literal('micronix_plate'),
    id: z.number(),
    name: z.string(),
    position: z.string().optional(),
  })
  .strict()

const cryovialBoxPlacementWireSchema = z
  .object({
    type: z.literal('cryovial_box'),
    id: z.number(),
    name: z.string(),
    position: z.string().optional(),
  })
  .strict()

const sharedContainerFieldsSchema = {
  id: z.number(),
  specimenId: z.number().optional(),
  comment: z.string().optional(),
  remainingQuantity: z.number().optional(),
  totalQuantity: z.number().optional(),
  unitId: z.number().optional(),
  locationPath: z.string().optional(),
  created: z.string().optional(),
  lastUpdated: z.string().optional(),
}

const tagWireSchema = z.object({ id: z.number(), name: z.string() })
const unitWireSchema = z.object({ id: z.number(), symbol: z.string(), name: z.string() }).passthrough()
const locationWireSchema = z
  .object({ id: z.number(), name: z.string(), path: z.string().optional() })
  .passthrough()

const sharedEnrichmentSchema = {
  tags: z.array(tagWireSchema).optional(),
  unit: unitWireSchema.optional(),
  location: locationWireSchema.nullable().optional(),
}

export const micronixContainerWireSchema = z
  .object({
    ...sharedContainerFieldsSchema,
    ...sharedEnrichmentSchema,
    containerType: z.literal('micronix_tube'),
    barcode: z.string(),
    collection: micronixPlatePlacementWireSchema.nullable().optional(),
  })
  .strict()

export const cryovialContainerWireSchema = z
  .object({
    ...sharedContainerFieldsSchema,
    ...sharedEnrichmentSchema,
    containerType: z.literal('cryovial_tube'),
    barcode: z.string().optional(),
    collection: cryovialBoxPlacementWireSchema.nullable().optional(),
  })
  .strict()

export const paperContainerWireSchema = z
  .object({
    ...sharedContainerFieldsSchema,
    ...sharedEnrichmentSchema,
    containerType: z.literal('paper'),
    sublabel: z.string().optional(),
    collection: sheetPlacementWireSchema.nullable().optional(),
  })
  .strict()

export const staticWellContainerWireSchema = z
  .object({
    ...sharedContainerFieldsSchema,
    ...sharedEnrichmentSchema,
    containerType: z.literal('static_well'),
    collection: micronixPlatePlacementWireSchema.nullable().optional(),
  })
  .strict()

export const unknownContainerWireSchema = z
  .object({
    ...sharedContainerFieldsSchema,
    ...sharedEnrichmentSchema,
    containerType: z.literal('unknown'),
    collection: z.null().optional(),
  })
  .strict()

export const enrichedContainerWireSchema = z.discriminatedUnion('containerType', [
  micronixContainerWireSchema,
  cryovialContainerWireSchema,
  paperContainerWireSchema,
  staticWellContainerWireSchema,
  unknownContainerWireSchema,
])

export type EnrichedContainerWire = z.infer<typeof enrichedContainerWireSchema>

/** Specimen summary attached to container detail (nulls omitted on wire). */
export const specimenSummaryWireSchema = z
  .object({
    id: z.number(),
    studySubjectId: z.number().nullable().optional(),
    controlBatchId: z.number().nullable().optional(),
    specimenTypeId: z.number(),
    collectionDate: z.string().nullable().optional(),
    created: z.string(),
    lastUpdated: z.string(),
    specimenType: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
  })
  .strict()

export type SpecimenSummaryWire = z.infer<typeof specimenSummaryWireSchema>

const containerDetailWireSchema = z
  .object({
    container: enrichedContainerWireSchema.optional(),
    specimen: specimenSummaryWireSchema.nullable().optional(),
    source: z.unknown().nullable().optional(),
  })
  .passthrough()
  .refine(
    (body) => body.container?.id != null || (body as { id?: number }).id != null,
    { message: 'container detail requires container.id (nested or legacy flat)' },
  )

export type ContainerDetailWire = z.infer<typeof containerDetailWireSchema>

export function parseContainerDetailWire(body: unknown): ContainerDetailWire {
  return containerDetailWireSchema.parse(body)
}

const containersListWireSchema = z.object({
  containers: z.array(enrichedContainerWireSchema),
  pagination: z
    .object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    })
    .optional(),
})

export type ContainersListWire = z.infer<typeof containersListWireSchema>

export function parseContainersListWire(body: unknown): ContainersListWire {
  return containersListWireSchema.parse(body)
}
