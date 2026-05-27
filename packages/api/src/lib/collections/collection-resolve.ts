import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '../../db/client'
import { location, micronixPlate, cryovialBox, box, bag, sheet } from '../../db/schema'
import type { CollectionType } from './types'

export type { CollectionType } from './types'

/** Resolve collection by name. */
export async function resolveCollectionByName(
  name: string,
  type: CollectionType,
  database: Database,
): Promise<number | null> {
  switch (type) {
    case 'micronix_plate': {
      const plate = await database
        .select({ id: micronixPlate.id })
        .from(micronixPlate)
        .where(eq(micronixPlate.name, name))
        .get()
      return plate?.id ?? null
    }
    case 'cryovial_box': {
      const boxRecord = await database
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.name, name))
        .get()
      return boxRecord?.id ?? null
    }
    case 'box': {
      const boxRecord = await database
        .select({ id: box.id })
        .from(box)
        .where(eq(box.name, name))
        .get()
      return boxRecord?.id ?? null
    }
    case 'bag': {
      const bagRecord = await database
        .select({ id: bag.id })
        .from(bag)
        .where(eq(bag.name, name))
        .get()
      return bagRecord?.id ?? null
    }
    case 'sheet': {
      const sheetRecord = await database
        .select({ id: sheet.id })
        .from(sheet)
        .where(eq(sheet.name, name))
        .get()
      return sheetRecord?.id ?? null
    }
    default:
      return null
  }
}

/** Resolve collection by barcode (micronix plates and cryovial boxes only). */
export async function resolveCollectionByBarcode(
  barcode: string,
  type: CollectionType,
  database: Database,
): Promise<number | null> {
  switch (type) {
    case 'micronix_plate': {
      const plate = await database
        .select({ id: micronixPlate.id })
        .from(micronixPlate)
        .where(eq(micronixPlate.barcode, barcode))
        .get()
      return plate?.id ?? null
    }
    case 'cryovial_box': {
      const boxRecord = await database
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.barcode, barcode))
        .get()
      return boxRecord?.id ?? null
    }
    default:
      return null
  }
}

/** Resolve collection by name, then barcode when applicable. */
export async function resolveCollection(
  identifier: string,
  type: CollectionType,
  database: Database,
): Promise<number | null> {
  const byName = await resolveCollectionByName(identifier, type, database)
  if (byName) return byName

  if (type === 'micronix_plate' || type === 'cryovial_box') {
    const byBarcode = await resolveCollectionByBarcode(identifier, type, database)
    if (byBarcode) return byBarcode
  }

  return null
}

/** Get collection location ID (sheets resolve via parent box or bag). */
export async function getCollectionLocation(
  database: Database,
  collectionId: number,
  type: CollectionType,
): Promise<number | null> {
  switch (type) {
    case 'micronix_plate': {
      const plate = await database
        .select({ locationId: micronixPlate.locationId })
        .from(micronixPlate)
        .where(eq(micronixPlate.id, collectionId))
        .get()
      return plate?.locationId ?? null
    }
    case 'cryovial_box': {
      const boxRecord = await database
        .select({ locationId: cryovialBox.locationId })
        .from(cryovialBox)
        .where(eq(cryovialBox.id, collectionId))
        .get()
      return boxRecord?.locationId ?? null
    }
    case 'box': {
      const boxRecord = await database
        .select({ locationId: box.locationId })
        .from(box)
        .where(eq(box.id, collectionId))
        .get()
      return boxRecord?.locationId ?? null
    }
    case 'bag': {
      const bagRecord = await database
        .select({ locationId: bag.locationId })
        .from(bag)
        .where(eq(bag.id, collectionId))
        .get()
      return bagRecord?.locationId ?? null
    }
    case 'sheet': {
      const sheetRecord = await database
        .select({ boxId: sheet.boxId, bagId: sheet.bagId })
        .from(sheet)
        .where(eq(sheet.id, collectionId))
        .get()

      if (sheetRecord?.boxId) {
        return getCollectionLocation(database, sheetRecord.boxId, 'box')
      }
      if (sheetRecord?.bagId) {
        return getCollectionLocation(database, sheetRecord.bagId, 'bag')
      }
      return null
    }
    default:
      return null
  }
}

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
