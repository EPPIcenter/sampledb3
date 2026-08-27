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
  specimen,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from './defaults'
import { validateUnitForContainerType, validateContainerTypeForSpecimenType } from './validation'
import { utcNow } from './datetime'
import { normalizePosition } from './normalize-position'
import { ValidationError } from './error-handler'
import type { ContainerWriteInput } from '@sampledb/contract'
import { ensureContainerPlacement, type EnsuredPlacement } from './container-write-placement'
import { checkGridPositionOccupancy, occupiedGridPositionMessage } from './container-occupancy'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export type ContainerQuantity = {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

export function pickContainerQuantity(src: ContainerQuantity): ContainerQuantity | undefined {
  const quantity: ContainerQuantity = {
    ...(src.unitId != null ? { unitId: src.unitId } : {}),
    ...(src.totalQuantity != null ? { totalQuantity: src.totalQuantity } : {}),
    ...(src.remainingQuantity != null ? { remainingQuantity: src.remainingQuantity } : {}),
  }
  return Object.keys(quantity).length > 0 ? quantity : undefined
}

export type CreateContainerForSpecimenOptions = {
  userId?: number
  /** Mutable map of collection keys to ids; updated when collections are auto-created. */
  collectionMap?: Map<string, number>
  quantity?: ContainerQuantity
}

function hasGridCollection(collection: { id?: number; name?: string; barcode?: string } | undefined): boolean {
  if (!collection) return false
  return collection.id != null || Boolean(collection.name) || Boolean(collection.barcode)
}

/**
 * Required ContainerWriteInput fields by type (no DB uniqueness checks).
 */
export function validateContainerWriteFields(
  input: ContainerWriteInput
): { valid: boolean; error?: string } {
  if (input.containerType === 'micronix_tube') {
    if (!input.barcode) {
      return { valid: false, error: 'Barcode is required for micronix tubes' }
    }
    if (!hasGridCollection(input.collection)) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!input.collection?.position || String(input.collection.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for micronix tubes.' }
    }
  } else if (input.containerType === 'cryovial_tube') {
    if (!hasGridCollection(input.collection)) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!input.collection?.position || String(input.collection.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for cryovial tubes.' }
    }
  } else if (input.containerType === 'paper') {
    const barcode = Reflect.get(input, 'barcode')
    if (typeof barcode === 'string' && barcode !== '') {
      return { valid: false, error: 'Paper containers use sublabel for spot identifiers, not barcode' }
    }
    const collection = input.collection
    if (!collection) {
      return { valid: false, error: 'Collection is required for paper containers' }
    }
    if (collection.id == null) {
      if (!collection.parent || (collection.parent.id == null && !collection.parent.name)) {
        return { valid: false, error: 'Collection name is required for papers' }
      }
      if (!collection.name) {
        return { valid: false, error: 'Sheet name is required for papers' }
      }
    }
  } else {
    if (!hasGridCollection(input.collection)) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!input.collection?.position || String(input.collection.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for static wells.' }
    }
  }

  return { valid: true }
}

async function insertStorageContainer(
  specimenId: number,
  database: DatabaseOrTransaction,
  dbForValidation: Database,
  containerType: ContainerType,
  quantity: ContainerQuantity | undefined,
  comment: string | undefined,
  userId: number | undefined
): Promise<{ id: number } | { error: string }> {
  const defaultUnitId = await getDefaultUnit(dbForValidation, containerType)
  const finalUnitId = quantity?.unitId || defaultUnitId

  const unitValidation = await validateUnitForContainerType(dbForValidation, containerType, finalUnitId)
  if (!unitValidation.valid) {
    return { error: unitValidation.error ?? 'Invalid unit for container type' }
  }

  const defaultTotalQty = await getDefaultTotalQuantity(dbForValidation, containerType)
  const defaultRemainingQty = await getDefaultRemainingQuantity(dbForValidation, containerType)

  const now = utcNow()
  const inserted = await database.insert(storageContainer).values({
    specimenId,
    unitId: finalUnitId,
    totalQuantity: quantity?.totalQuantity ?? defaultTotalQty,
    remainingQuantity: quantity?.remainingQuantity ?? quantity?.totalQuantity ?? defaultRemainingQty,
    comment,
    created: now,
    lastUpdated: now,
    createdBy: userId,
    updatedBy: userId,
  }).returning()

  const container = inserted[0]
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
  if (inserted.length === 0 || container === undefined) throw new Error('Insert did not return container row')
  return { id: container.id }
}

async function createMicronixTube(
  specimenId: number,
  placement: Extract<EnsuredPlacement, { containerType: 'micronix_tube' }>,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const position = normalizePosition(placement.position)
    const occupancy = await checkGridPositionOccupancy(dbForValidation, {
      collectionKind: 'micronix_plate',
      collectionId: placement.collectionId,
      position,
    })
    if (occupancy.occupied && position) {
      return { success: false, error: occupiedGridPositionMessage(position, 'micronix_plate') }
    }

    if (placement.barcode) {
      const existing = await database
        .select({ id: micronixTube.id })
        .from(micronixTube)
        .where(eq(micronixTube.barcode, placement.barcode))
        .get()
      if (existing) {
        return { success: false, error: `Barcode '${placement.barcode}' already exists` }
      }
    }

    const inserted = await insertStorageContainer(
      specimenId,
      database,
      dbForValidation,
      'micronix_tube',
      options?.quantity,
      placement.comment,
      options?.userId
    )
    if ('error' in inserted) return { success: false, error: inserted.error }

    await database.insert(micronixTube).values({
      id: inserted.id,
      collectionId: placement.collectionId,
      barcode: placement.barcode,
      position,
    })

    return { success: true, containerId: inserted.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

async function createCryovialTube(
  specimenId: number,
  placement: Extract<EnsuredPlacement, { containerType: 'cryovial_tube' }>,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const position = normalizePosition(placement.position)
    const occupancy = await checkGridPositionOccupancy(dbForValidation, {
      collectionKind: 'cryovial_box',
      collectionId: placement.collectionId,
      position,
    })
    if (occupancy.occupied && position) {
      return { success: false, error: occupiedGridPositionMessage(position, 'cryovial_box') }
    }

    if (placement.barcode) {
      const existing = await database
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(eq(cryovialTube.barcode, placement.barcode))
        .get()
      if (existing) {
        return { success: false, error: `Barcode '${placement.barcode}' already exists` }
      }
    }

    const inserted = await insertStorageContainer(
      specimenId,
      database,
      dbForValidation,
      'cryovial_tube',
      options?.quantity,
      placement.comment,
      options?.userId
    )
    if ('error' in inserted) return { success: false, error: inserted.error }

    await database.insert(cryovialTube).values({
      id: inserted.id,
      collectionId: placement.collectionId,
      barcode: placement.barcode || null,
      position,
    })

    return { success: true, containerId: inserted.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

async function createPaper(
  specimenId: number,
  placement: Extract<EnsuredPlacement, { containerType: 'paper' }>,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const inserted = await insertStorageContainer(
      specimenId,
      database,
      dbForValidation,
      'paper',
      options?.quantity,
      placement.comment,
      options?.userId
    )
    if ('error' in inserted) return { success: false, error: inserted.error }

    await database.insert(paper).values({
      id: inserted.id,
      sheetId: placement.sheetId,
      sublabel: placement.sublabel?.trim() || null,
    })

    return { success: true, containerId: inserted.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

async function createStaticWell(
  specimenId: number,
  placement: Extract<EnsuredPlacement, { containerType: 'static_well' }>,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const dbForValidation = database as unknown as Database
    const position = normalizePosition(placement.position)
    const occupancy = await checkGridPositionOccupancy(dbForValidation, {
      collectionKind: 'micronix_plate',
      collectionId: placement.collectionId,
      position,
    })
    if (occupancy.occupied && position) {
      return { success: false, error: occupiedGridPositionMessage(position, 'micronix_plate') }
    }

    const inserted = await insertStorageContainer(
      specimenId,
      database,
      dbForValidation,
      'static_well',
      options?.quantity,
      placement.comment,
      options?.userId
    )
    if ('error' in inserted) return { success: false, error: inserted.error }

    await database.insert(staticWell).values({
      id: inserted.id,
      collectionId: placement.collectionId,
      position,
    })

    return { success: true, containerId: inserted.id }
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

export async function createContainerForSpecimen(
  specimenId: number,
  data: ContainerWriteInput,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions | number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  const opts: CreateContainerForSpecimenOptions =
    typeof options === 'number' ? { userId: options } : (options ?? {})
  const dbForValidation = database as unknown as Database

  const fieldValidation = validateContainerWriteFields(data)
  if (!fieldValidation.valid) return { success: false, error: fieldValidation.error }

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
    data.containerType
  )
  if (!containerTypeValidation.valid) {
    return { success: false, error: containerTypeValidation.error }
  }

  let placement: EnsuredPlacement
  try {
    placement = await ensureContainerPlacement(database, data, {
      collectionMap: opts.collectionMap,
      userId: opts.userId,
    })
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message }
    }
    throw error
  }

  switch (placement.containerType) {
    case 'micronix_tube':
      return createMicronixTube(specimenId, placement, database, opts)
    case 'cryovial_tube':
      return createCryovialTube(specimenId, placement, database, opts)
    case 'paper':
      return createPaper(specimenId, placement, database, opts)
    case 'static_well':
      return createStaticWell(specimenId, placement, database, opts)
    default: {
      const _exhaustive: never = placement
      void _exhaustive
      return { success: false, error: 'Unsupported container type' }
    }
  }
}
