import { db } from '../db/client'
import { micronixPlate, cryovialBox, box, bag, sheet } from '../db/schema'
import { eq } from 'drizzle-orm'

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet'

/**
 * Resolve collection by name
 */
export async function resolveCollectionByName(
  name: string,
  type: CollectionType
): Promise<number | null> {
  switch (type) {
    case 'micronix_plate': {
      const plate = await db
        .select({ id: micronixPlate.id })
        .from(micronixPlate)
        .where(eq(micronixPlate.name, name))
        .get()
      return plate?.id ?? null
    }
    case 'cryovial_box': {
      const box = await db
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.name, name))
        .get()
      return box?.id ?? null
    }
    case 'box': {
      const boxRecord = await db
        .select({ id: box.id })
        .from(box)
        .where(eq(box.name, name))
        .get()
      return boxRecord?.id ?? null
    }
    case 'bag': {
      const bagRecord = await db
        .select({ id: bag.id })
        .from(bag)
        .where(eq(bag.name, name))
        .get()
      return bagRecord?.id ?? null
    }
    case 'sheet': {
      const sheetRecord = await db
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

/**
 * Resolve collection by barcode
 */
export async function resolveCollectionByBarcode(
  barcode: string,
  type: CollectionType
): Promise<number | null> {
  switch (type) {
    case 'micronix_plate': {
      const plate = await db
        .select({ id: micronixPlate.id })
        .from(micronixPlate)
        .where(eq(micronixPlate.barcode, barcode))
        .get()
      return plate?.id ?? null
    }
    case 'cryovial_box': {
      const box = await db
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.barcode, barcode))
        .get()
      return box?.id ?? null
    }
    default:
      // Boxes, bags, and sheets don't have barcodes directly in their primary tables
      return null
  }
}

/**
 * Resolve collection by name or barcode
 */
export async function resolveCollection(
  identifier: string,
  type: CollectionType
): Promise<number | null> {
  // Try by name first
  const byName = await resolveCollectionByName(identifier, type)
  if (byName) return byName

  // Try by barcode if applicable
  if (type === 'micronix_plate' || type === 'cryovial_box') {
    const byBarcode = await resolveCollectionByBarcode(identifier, type)
    if (byBarcode) return byBarcode
  }

  return null
}

/**
 * Get collection location ID
 */
export async function getCollectionLocation(
  collectionId: number,
  type: CollectionType
): Promise<number | null> {
  switch (type) {
    case 'micronix_plate': {
      const plate = await db
        .select({ locationId: micronixPlate.locationId })
        .from(micronixPlate)
        .where(eq(micronixPlate.id, collectionId))
        .get()
      return plate?.locationId ?? null
    }
    case 'cryovial_box': {
      const box = await db
        .select({ locationId: cryovialBox.locationId })
        .from(cryovialBox)
        .where(eq(cryovialBox.id, collectionId))
        .get()
      return box?.locationId ?? null
    }
    case 'box': {
      const boxRecord = await db
        .select({ locationId: box.locationId })
        .from(box)
        .where(eq(box.id, collectionId))
        .get()
      return boxRecord?.locationId ?? null
    }
    case 'bag': {
      const bagRecord = await db
        .select({ locationId: bag.locationId })
        .from(bag)
        .where(eq(bag.id, collectionId))
        .get()
      return bagRecord?.locationId ?? null
    }
    case 'sheet': {
      const sheetRecord = await db
        .select({ boxId: sheet.boxId, bagId: sheet.bagId })
        .from(sheet)
        .where(eq(sheet.id, collectionId))
        .get()
      
      if (sheetRecord?.boxId) {
        return getCollectionLocation(sheetRecord.boxId, 'box')
      }
      if (sheetRecord?.bagId) {
        return getCollectionLocation(sheetRecord.bagId, 'bag')
      }
      return null
    }
    default:
      return null
  }
}
