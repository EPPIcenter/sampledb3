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
  micronixPlate,
  cryovialBox,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from './defaults'
import { validateUnitForContainerType, validateContainerTypeForSpecimenType } from './validation'
import { resolveCollection } from './collections/collection-resolve'
import {
  assertLocationCanContainCollections,
  CollectionLocationNotAllowedError,
  CollectionLocationNotFoundError,
} from './collections/collection-lifecycle'
import { utcNow } from './datetime'
import { normalizePosition } from './normalize-position'
import { ValidationError } from './error-handler'
import type { ContainerWriteInput } from '@sampledb/contract'
import { isContainerWriteInput, resolveContainerPlacement } from './container-write-placement'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export interface ContainerData {
  containerType: ContainerType
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  sheetName?: string
  sublabel?: string
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
  comment?: string
  /** When collection does not exist, create it at this location (combined import). */
  collectionLocationId?: number
  /** Paper parent collection type when creating by name (default box). */
  parentCollectionType?: 'box' | 'bag'
}

export type CreateContainerForSpecimenOptions = {
  userId?: number
  /** Mutable map of collection keys to ids; updated when collections are auto-created. */
  collectionMap?: Map<string, number>
  /** Skip field/DB validation when caller already validated (e.g. combined import prepare). */
  skipValidation?: boolean
}

function guardCollectionLocation(
  database: DatabaseOrTransaction,
  locationId: number
): void {
  try {
    assertLocationCanContainCollections(database, locationId)
  } catch (error) {
    if (error instanceof CollectionLocationNotFoundError || error instanceof CollectionLocationNotAllowedError) {
      throw new ValidationError(error.message)
    }
    throw error
  }
}

async function resolveMicronixPlateId(
  data: ContainerData,
  database: DatabaseOrTransaction,
  collectionMap?: Map<string, number>
): Promise<number> {
  const identifier = data.collectionName || data.collectionBarcode!
  const key = `micronix_plate-${identifier}`
  if (collectionMap?.has(key)) {
    return collectionMap.get(key)!
  }
  const dbForResolve = database as unknown as Database
  const existing = await resolveCollection(identifier, 'micronix_plate', dbForResolve)
  if (existing) {
    collectionMap?.set(key, existing)
    return existing
  }
  if (data.collectionLocationId) {
    guardCollectionLocation(database, data.collectionLocationId)
    const now = utcNow()
    const inserted = await database
      .insert(micronixPlate)
      .values({
        name: data.collectionName ?? identifier,
        locationId: data.collectionLocationId,
        barcode: data.collectionBarcode ?? null,
        created: now,
        lastUpdated: now,
      })
      .returning()
    const plate = inserted[0]
    if (!plate) throw new Error('Insert did not return micronix plate row')
    collectionMap?.set(key, plate.id)
    return plate.id
  }
  throw new ValidationError('Collection not found and no location provided')
}

async function resolveCryovialBoxId(
  data: ContainerData,
  database: DatabaseOrTransaction,
  collectionMap?: Map<string, number>
): Promise<number> {
  const identifier = data.collectionName || data.collectionBarcode!
  const key = `cryovial_box-${identifier}`
  if (collectionMap?.has(key)) {
    return collectionMap.get(key)!
  }
  const dbForResolve = database as unknown as Database
  const existing = await resolveCollection(identifier, 'cryovial_box', dbForResolve)
  if (existing) {
    collectionMap?.set(key, existing)
    return existing
  }
  if (data.collectionLocationId) {
    guardCollectionLocation(database, data.collectionLocationId)
    const now = utcNow()
    const inserted = await database
      .insert(cryovialBox)
      .values({
        name: data.collectionName ?? identifier,
        locationId: data.collectionLocationId,
        barcode: data.collectionBarcode ?? null,
        created: now,
        lastUpdated: now,
      })
      .returning()
    const boxRecord = inserted[0]
    if (!boxRecord) throw new Error('Insert did not return cryovial box row')
    collectionMap?.set(key, boxRecord.id)
    return boxRecord.id
  }
  throw new ValidationError('Collection not found and no location provided')
}

async function resolvePaperCollection(
  data: ContainerData,
  database: DatabaseOrTransaction,
  collectionMap?: Map<string, number>
): Promise<{ boxId: number | null; bagId: number | null }> {
  const boxName = data.collectionName!
  const parentType = data.parentCollectionType ?? 'box'
  const key = parentType === 'bag' ? `bag-${boxName}` : `box-${boxName}`
  if (collectionMap?.has(key)) {
    const id = collectionMap.get(key)!
    return parentType === 'bag' ? { boxId: null, bagId: id } : { boxId: id, bagId: null }
  }
  const boxRecord = await database.select({ id: box.id }).from(box).where(eq(box.name, boxName)).get()
  if (boxRecord) {
    collectionMap?.set(key, boxRecord.id)
    return { boxId: boxRecord.id, bagId: null }
  }
  const bagRecord = await database.select({ id: bag.id }).from(bag).where(eq(bag.name, boxName)).get()
  if (bagRecord) {
    return { boxId: null, bagId: bagRecord.id }
  }
  if (data.collectionLocationId) {
    guardCollectionLocation(database, data.collectionLocationId)
    const now = utcNow()
    const parentType = data.parentCollectionType ?? 'box'
    if (parentType === 'bag') {
      const bagKey = `bag-${boxName}`
      const inserted = await database
        .insert(bag)
        .values({
          name: boxName,
          locationId: data.collectionLocationId,
          created: now,
          lastUpdated: now,
        })
        .returning()
      const newBag = inserted[0]
      if (!newBag) throw new Error('Insert did not return bag row')
      collectionMap?.set(bagKey, newBag.id)
      return { boxId: null, bagId: newBag.id }
    }
    const inserted = await database
      .insert(box)
      .values({
        name: boxName,
        locationId: data.collectionLocationId,
        created: now,
        lastUpdated: now,
      })
      .returning()
    const newBox = inserted[0]
    if (!newBox) throw new Error('Insert did not return box row')
    collectionMap?.set(key, newBox.id)
    return { boxId: newBox.id, bagId: null }
  }
  throw new ValidationError(`Collection (box/bag) not found: ${boxName}`)
}

/**
 * Validate required container fields by type (no DB uniqueness checks).
 */
export function validateContainerFieldRequirements(
  containerType: ContainerType,
  data: ContainerData
): { valid: boolean; error?: string } {
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
  } else if (containerType === 'cryovial_tube') {
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!data.position || String(data.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for cryovial tubes.' }
    }
  } else if (containerType === 'paper') {
    if (data.barcode != null && data.barcode !== '') {
      return { valid: false, error: 'Paper containers use sublabel for spot identifiers, not barcode' }
    }
    if (!data.collectionName) {
      return { valid: false, error: 'Collection name is required for papers' }
    }
    if (!data.sheetName) {
      return { valid: false, error: 'Sheet name is required for papers' }
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
 * Validate container data based on container type
 */
export async function validateContainerData(
  database: Database,
  containerType: ContainerType,
  data: ContainerData,
  options?: { skipDbUniqueness?: boolean }
): Promise<{ valid: boolean; error?: string }> {
  const fieldValidation = validateContainerFieldRequirements(containerType, data)
  if (!fieldValidation.valid) return fieldValidation

  if (options?.skipDbUniqueness) {
    return { valid: true }
  }

  if (containerType === 'micronix_tube') {
    const existing = await database
      .select({ id: micronixTube.id })
      .from(micronixTube)
      .where(eq(micronixTube.barcode, data.barcode!))
      .get()
    if (existing) {
      return { valid: false, error: `Barcode '${data.barcode}' already exists` }
    }
  } else if (containerType === 'cryovial_tube' && data.barcode) {
    const existing = await database
      .select({ id: cryovialTube.id })
      .from(cryovialTube)
      .where(eq(cryovialTube.barcode, data.barcode))
      .get()
    if (existing) {
      return { valid: false, error: `Barcode '${data.barcode}' already exists` }
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
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const collectionId = await resolveMicronixPlateId(data, database, options?.collectionMap)

    if (!options?.skipValidation && data.barcode) {
      const existing = await database
        .select({ id: micronixTube.id })
        .from(micronixTube)
        .where(eq(micronixTube.barcode, data.barcode))
        .get()
      if (existing) {
        return { success: false, error: `Barcode '${data.barcode}' already exists` }
      }
    }

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'micronix_tube')
    const finalUnitId = data.unitId || defaultUnitId

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
      createdBy: options?.userId,
      updatedBy: options?.userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(micronixTube).values({
      id: container.id,
      collectionId,
      barcode: data.barcode!,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

async function createCryovialTube(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const collectionId = await resolveCryovialBoxId(data, database, options?.collectionMap)

    if (!options?.skipValidation && data.barcode) {
      const existing = await database
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(eq(cryovialTube.barcode, data.barcode))
        .get()
      if (existing) {
        return { success: false, error: `Barcode '${data.barcode}' already exists` }
      }
    }

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'cryovial_tube')
    const finalUnitId = data.unitId || defaultUnitId

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
      createdBy: options?.userId,
      updatedBy: options?.userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(cryovialTube).values({
      id: container.id,
      collectionId,
      barcode: data.barcode || null,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

async function createPaper(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const { boxId, bagId } = await resolvePaperCollection(data, database, options?.collectionMap)

    const sheetName = data.sheetName!
    let sheetRecord: { id: number } | undefined
    if (boxId) {
      sheetRecord = await database
        .select({ id: sheet.id })
        .from(sheet)
        .where(and(eq(sheet.name, sheetName), eq(sheet.boxId, boxId)))
        .get()
    } else {
      sheetRecord = await database
        .select({ id: sheet.id })
        .from(sheet)
        .where(and(eq(sheet.name, sheetName), eq(sheet.bagId, bagId!)))
        .get()
    }

    if (!sheetRecord) {
      const now = utcNow()
      const [newSheet] = await database.insert(sheet).values({
        name: sheetName,
        boxId: boxId ?? null,
        bagId: bagId ?? null,
        created: now,
        lastUpdated: now,
        createdBy: options?.userId,
        updatedBy: options?.userId,
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
      createdBy: options?.userId,
      updatedBy: options?.userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(paper).values({
      id: container.id,
      sheetId: sheetRecord.id,
      sublabel: data.sublabel?.trim() || null,
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

async function createStaticWell(
  specimenId: number,
  data: ContainerData,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const collectionId = await resolveMicronixPlateId(data, database, options?.collectionMap)

    const defaultUnitId = await getDefaultUnit(dbForValidation, 'static_well')
    const finalUnitId = data.unitId || defaultUnitId

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
      createdBy: options?.userId,
      updatedBy: options?.userId,
    }).returning()

    const container = inserted[0]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
    await database.insert(staticWell).values({
      id: container.id,
      collectionId,
      position: normalizePosition(data.position),
    })

    return { success: true, containerId: container.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

export async function createContainerForSpecimen(
  specimenId: number,
  data: ContainerData | ContainerWriteInput,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions | number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  const opts: CreateContainerForSpecimenOptions =
    typeof options === 'number' ? { userId: options } : (options ?? {})
  const dbForValidation = database as unknown as Database

  let containerData: ContainerData
  try {
    containerData = isContainerWriteInput(data)
      ? await resolveContainerPlacement(database, data, opts.collectionMap)
      : data
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }

  if (!opts.skipValidation) {
    const validation = await validateContainerData(dbForValidation, containerData.containerType, containerData)
    if (!validation.valid) return { success: false, error: validation.error }

    const specimenRecord = await database
      .select({ specimenTypeId: specimen.specimenTypeId })
      .from(specimen)
      .where(eq(specimen.id, specimenId))
      .get()
    if (!specimenRecord) {
      return { success: false, error: 'Specimen not found' }
    }

    const containerTypeValidation = await validateContainerTypeForSpecimenType(
      dbForValidation,
      specimenRecord.specimenTypeId,
      containerData.containerType
    )
    if (!containerTypeValidation.valid) {
      return { success: false, error: containerTypeValidation.error }
    }
  }

  switch (containerData.containerType) {
    case 'micronix_tube':
      return createMicronixTube(specimenId, containerData, database, opts)
    case 'cryovial_tube':
      return createCryovialTube(specimenId, containerData, database, opts)
    case 'paper':
      return createPaper(specimenId, containerData, database, opts)
    case 'static_well':
      return createStaticWell(specimenId, containerData, database, opts)
    default:
      return { success: false, error: `Unsupported container type: ${containerData.containerType}` }
  }
}
