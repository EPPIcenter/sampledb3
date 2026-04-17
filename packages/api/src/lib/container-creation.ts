import type { Database } from '../db/client'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type * as schema from '../db/schema'
import {
  storageContainer,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
  sheet,
  specimen,
  box,
  bag,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from './defaults'
import { validateUnitForContainerType, validateContainerTypeForSpecimenType } from './validation'
import {
  resolveCollection,
} from './collection-resolution'
import { utcNow } from './datetime'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

/**
 * Normalize position string to match frontend format (e.g., "B1" -> "B01")
 */
function normalizePosition(position: string | null | undefined): string | null {
  if (!position || !position.trim()) return null
  
  const trimmed = position.trim()
  const match = trimmed.match(/^([A-Z]+)(\d+)$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = match[2]
    return `${row}${col.padStart(2, '0')}`
  }
  
  // If it doesn't match the pattern, return as-is
  return trimmed
}

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export interface ContainerData {
  containerType: ContainerType
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  label?: string
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
  comment?: string
}

/**
 * Validate container data based on container type
 */
export async function validateContainerData(
  database: Database,
  containerType: ContainerType,
  data: ContainerData
): Promise<{ valid: boolean; error?: string }> {
  if (containerType === 'micronix_tube') {
    if (!data.barcode) {
      return { valid: false, error: 'Barcode is required for micronix tubes' }
    }
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!data.position || String(data.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for micronix tubes.' }
    }
    // Validate barcode uniqueness
    const existing = await database
      .select({ id: micronixTube.id })
      .from(micronixTube)
      .where(eq(micronixTube.barcode, data.barcode))
      .get()
    if (existing) {
      return { valid: false, error: `Barcode '${data.barcode}' already exists` }
    }
  } else if (containerType === 'cryovial_tube') {
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!data.position || String(data.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for cryovial tubes.' }
    }
    // Validate barcode uniqueness if provided
    if (data.barcode) {
      const existing = await database
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(eq(cryovialTube.barcode, data.barcode))
        .get()
      if (existing) {
        return { valid: false, error: `Barcode '${data.barcode}' already exists` }
      }
    }
  } else if (containerType === 'paper') {
    if (!data.collectionName) {
      return { valid: false, error: 'Collection name is required for papers' }
    }
    if (!data.label) {
      return { valid: false, error: 'Label is required for papers' }
    }
  } else {
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!data.position || String(data.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for static wells.' }
    }
  }

  return { valid: true }
}

/**
 * Create micronix tube container
 */
async function createMicronixTube(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  userId?: number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const collectionId = await resolveCollection(data.collectionName || data.collectionBarcode!, 'micronix_plate', dbForValidation)
    if (!collectionId) return { success: false, error: 'Micronix plate not found' }

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'micronix_tube')
    const finalUnitId = data.unitId || defaultUnitId

    // Validate unit is allowed for container type
    const unitValidation = await validateUnitForContainerType(dbForValidation, 'micronix_tube', finalUnitId)
    if (!unitValidation.valid) {
      return { success: false, error: unitValidation.error }
    }

    const defaultTotalQty = await getDefaultTotalQuantity(dbForValidation, 'micronix_tube')
    const defaultRemainingQty = await getDefaultRemainingQuantity(dbForValidation, 'micronix_tube')

    const now = utcNow()
    const inserted = await database.insert(storageContainer).values({
      specimenId,
      unitId: finalUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
      createdBy: userId,
      updatedBy: userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(micronixTube).values({
      id: container.id,
      collectionId: collectionId,
      barcode: data.barcode!,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    throw error
  }
}

/**
 * Create cryovial tube container
 */
async function createCryovialTube(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  userId?: number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const collectionId = await resolveCollection(data.collectionName || data.collectionBarcode!, 'cryovial_box', dbForValidation)
    if (!collectionId) return { success: false, error: 'Cryovial box not found' }

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'cryovial_tube')
    const finalUnitId = data.unitId || defaultUnitId

    // Validate unit is allowed for container type
    const unitValidation = await validateUnitForContainerType(dbForValidation, 'cryovial_tube', finalUnitId)
    if (!unitValidation.valid) {
      return { success: false, error: unitValidation.error }
    }

    const defaultTotalQty = await getDefaultTotalQuantity(dbForValidation, 'cryovial_tube')
    const defaultRemainingQty = await getDefaultRemainingQuantity(dbForValidation, 'cryovial_tube')

    const now = utcNow()
    const inserted = await database.insert(storageContainer).values({
      specimenId,
      unitId: finalUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
      createdBy: userId,
      updatedBy: userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(cryovialTube).values({
      id: container.id,
      collectionId: collectionId,
      barcode: data.barcode || null,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    throw error
  }
}

/**
 * Create paper container
 *
 * For paper: collectionName = box (or bag) name, label = sheet name within that box/bag.
 * The function resolves the box, then finds or creates the sheet inside it.
 */
async function createPaper(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  userId?: number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database

    // Resolve box by collectionName
    const boxRecord = await database.select({ id: box.id }).from(box).where(eq(box.name, data.collectionName!)).get()
    const bagRecord = !boxRecord
      ? await database.select({ id: bag.id }).from(bag).where(eq(bag.name, data.collectionName!)).get()
      : null
    if (!boxRecord && !bagRecord) {
      return { success: false, error: `Collection (box/bag) not found: ${data.collectionName}` }
    }

    // Find or create sheet by label within the resolved box/bag
    const sheetName = data.label!
    let sheetRecord: { id: number } | undefined
    if (boxRecord) {
      sheetRecord = await database
        .select({ id: sheet.id })
        .from(sheet)
        .where(and(eq(sheet.name, sheetName), eq(sheet.boxId, boxRecord.id)))
        .get()
    } else {
      sheetRecord = await database
        .select({ id: sheet.id })
        .from(sheet)
        .where(and(eq(sheet.name, sheetName), eq(sheet.bagId, bagRecord!.id)))
        .get()
    }

    if (!sheetRecord) {
      const now = utcNow()
      const [newSheet] = await database.insert(sheet).values({
        name: sheetName,
        boxId: boxRecord?.id ?? null,
        bagId: bagRecord?.id ?? null,
        created: now,
        lastUpdated: now,
        createdBy: userId,
        updatedBy: userId,
      }).returning()
      sheetRecord = { id: newSheet.id }
    }

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'paper')
    const finalUnitId = data.unitId || defaultUnitId

    const unitValidation = await validateUnitForContainerType(dbForValidation, 'paper', finalUnitId)
    if (!unitValidation.valid) {
      return { success: false, error: unitValidation.error }
    }

    const defaultTotalQty = await getDefaultTotalQuantity(dbForValidation, 'paper')
    const defaultRemainingQty = await getDefaultRemainingQuantity(dbForValidation, 'paper')

    const now = utcNow()
    const inserted = await database.insert(storageContainer).values({
      specimenId,
      unitId: finalUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
      createdBy: userId,
      updatedBy: userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(paper).values({
      id: container.id,
      sheetId: sheetRecord.id,
      barcode: data.barcode || null,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    throw error
  }
}

/**
 * Create static well container
 */
async function createStaticWell(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  userId?: number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const collectionId = await resolveCollection(data.collectionName || data.collectionBarcode!, 'micronix_plate', dbForValidation)
    if (!collectionId) return { success: false, error: 'Micronix plate not found' }

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'static_well')
    const finalUnitId = data.unitId || defaultUnitId

    // Validate unit is allowed for container type
    const unitValidation = await validateUnitForContainerType(dbForValidation, 'static_well', finalUnitId)
    if (!unitValidation.valid) {
      return { success: false, error: unitValidation.error }
    }

    const defaultTotalQty = await getDefaultTotalQuantity(dbForValidation, 'static_well')
    const defaultRemainingQty = await getDefaultRemainingQuantity(dbForValidation, 'static_well')

    const now = utcNow()
    const inserted = await database.insert(storageContainer).values({
      specimenId,
      unitId: finalUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
      createdBy: userId,
      updatedBy: userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(staticWell).values({
      id: container.id,
      collectionId: collectionId,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    throw error
  }
}

/**
 * Main function to create container for specimen
 */
export async function createContainerForSpecimen(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  userId?: number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
    const dbForValidation = database as unknown as Database
    const validation = await validateContainerData(dbForValidation, data.containerType, data)
  if (!validation.valid) return { success: false, error: validation.error }

  // Get specimen to find specimen type ID for validation
  const specimenRecord = await database.select({ specimenTypeId: specimen.specimenTypeId }).from(specimen).where(eq(specimen.id, specimenId)).get()
  if (!specimenRecord) {
    return { success: false, error: 'Specimen not found' }
  }

  // Validate container type is allowed for specimen type
  const containerTypeValidation = await validateContainerTypeForSpecimenType(dbForValidation, specimenRecord.specimenTypeId, data.containerType)
  if (!containerTypeValidation.valid) {
    return { success: false, error: containerTypeValidation.error }
  }

  switch (data.containerType) {
    case 'micronix_tube': return createMicronixTube(specimenId, data, database, userId)
    case 'cryovial_tube': return createCryovialTube(specimenId, data, database, userId)
    case 'paper': return createPaper(specimenId, data, database, userId)
    case 'static_well': return createStaticWell(specimenId, data, database, userId)
    default: return { success: false, error: `Unsupported container type: ${data.containerType}` }
  }
}
