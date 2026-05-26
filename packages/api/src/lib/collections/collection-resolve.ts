import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '../../db/client'
import { location } from '../../db/schema'
import { resolveCollection, resolveCollectionByName, getCollectionLocation } from '../collection-resolution'
import type { CollectionType } from './types'

export const checkCollectionsBodySchema = z.object({
  collections: z.array(
    z.object({
      identifier: z.string(),
      type: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag', 'sheet']),
    }),
  ),
})

export const resolveCollectionBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['box', 'bag', 'micronix_plate', 'cryovial_box']),
})

export const validatePlateScanBodySchema = z.object({
  csvText: z.string(),
  plateId: z.number().int().positive().optional(),
  scannerConfigurationId: z.string().min(1),
})

export const createMicronixPlateBodySchema = z.object({
  name: z.string().min(1),
  locationId: z.number().int(),
  barcode: z.string().optional(),
})

export const createCryovialBoxBodySchema = z.object({
  name: z.string().min(1),
  locationId: z.number().int(),
  barcode: z.string().optional(),
})

export const createBoxBodySchema = z.object({
  name: z.string().min(1),
  locationId: z.number().int(),
})

export const createBagBodySchema = z.object({
  name: z.string().min(1),
  locationId: z.number().int(),
})

export const resolveContainersBodySchema = z.object({
  identifiers: z.array(
    z.union([
      z.object({ type: z.literal('barcode'), barcode: z.string().min(1) }),
      z.object({
        type: z.literal('position'),
        sourceCollectionName: z.string().min(1),
        sourcePosition: z.string().min(1),
      }),
      z.object({ type: z.literal('container_id'), containerId: z.number().int().positive() }),
    ]),
  ),
})

export const moveContainersBodySchema = z.object({
  collectionType: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag', 'sheet']).optional(),
  atomicMode: z.enum(['all_or_nothing', 'best_effort']).default('all_or_nothing'),
  mappings: z.array(
    z.object({
      fromCollectionName: z.string().min(1),
      toCollectionName: z.string().min(1),
    }),
  ),
  moves: z.array(
    z.object({
      identifier: z.union([
        z.object({ type: z.literal('barcode'), barcode: z.string().min(1) }),
        z.object({
          type: z.literal('position'),
          sourceCollectionName: z.string().min(1),
          sourcePosition: z.string().min(1),
        }),
        z.object({ type: z.literal('container_id'), containerId: z.number().int().positive() }),
      ]),
      targetPosition: z.string().optional(),
    }),
  ),
})

export const moveSheetsBodySchema = z.object({
  sheetIds: z.array(z.number().int().positive()),
  targetCollectionId: z.number().int().positive(),
  targetCollectionType: z.enum(['box', 'bag']),
})

export const moveCollectionsBodySchema = z.object({
  collectionType: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag']),
  atomicMode: z.enum(['all_or_nothing', 'best_effort']).default('all_or_nothing'),
  moves: z.array(
    z.object({
      identifier: z.union([
        z.object({ type: z.literal('id'), id: z.number().int().positive() }),
        z.object({
          type: z.literal('name'),
          name: z.string().min(1),
          locationId: z.number().int().positive().optional(),
          locationPath: z.string().optional(),
        }),
        z.object({
          type: z.literal('barcode'),
          barcode: z.string().min(1),
          locationId: z.number().int().positive().optional(),
          locationPath: z.string().optional(),
        }),
      ]),
      targetLocationId: z.number().int().positive(),
    }),
  ),
})

export const deleteWithContentsBodySchema = z.object({
  collectionType: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag']),
  id: z.number().int().positive(),
  removeEmptySubjects: z.boolean().optional().default(false),
})

export async function checkCollectionsExist(
  database: Database,
  collections: Array<{ identifier: string; type: CollectionType | 'sheet' }>,
) {
  return Promise.all(
    collections.map(async (col) => {
      const exists = await resolveCollection(col.identifier, col.type, database)
      return {
        identifier: col.identifier,
        type: col.type,
        exists: !!exists,
        id: exists || null,
      }
    }),
  )
}

export async function resolveNamedCollection(
  database: Database,
  name: string,
  type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box',
) {
  const id = await resolveCollectionByName(name, type, database)
  if (!id) {
    return { found: false as const }
  }

  const locationId = await getCollectionLocation(database, id, type)
  let locationName: string | undefined
  if (locationId != null) {
    const loc = await database
      .select({ name: location.name, path: location.path })
      .from(location)
      .where(eq(location.id, locationId))
      .get()
    locationName = loc?.path ?? loc?.name ?? undefined
  }

  return {
    found: true as const,
    id,
    name,
    type,
    locationId: locationId ?? undefined,
    locationName,
  }
}
