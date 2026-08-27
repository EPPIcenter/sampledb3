import type { ContainerWriteInput } from '@sampledb/contract'
import type { Database } from '../db/client'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type * as schema from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { bag, box, cryovialBox, micronixPlate, sheet } from '../db/schema'
import { resolveCollection, resolveCollectionByBarcode } from './collections/collection-resolve'
import {
  CollectionLocationNotAllowedError,
  CollectionLocationNotFoundError,
  createOrResolveCollection,
  type CollectionEntityType,
} from './collections/collection-lifecycle'
import { utcNow } from './datetime'
import { ValidationError } from './error-handler'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

type GridCollection = NonNullable<
  Extract<ContainerWriteInput, { containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well' }>['collection']
>

export type EnsuredPlacement =
  | {
      containerType: 'micronix_tube'
      collectionId: number
      barcode: string
      position?: string
      comment?: string
    }
  | {
      containerType: 'cryovial_tube'
      collectionId: number
      barcode?: string
      position?: string
      comment?: string
    }
  | {
      containerType: 'static_well'
      collectionId: number
      position?: string
      comment?: string
    }
  | {
      containerType: 'paper'
      sheetId: number
      sublabel?: string
      comment?: string
    }

export type BulkCombinedContainerInput = ContainerWriteInput & {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

type EnsureOptions = {
  collectionMap?: Map<string, number>
  userId?: number
}

function commentOf(input: ContainerWriteInput): string | undefined {
  return 'comment' in input ? input.comment : undefined
}

function asDatabase(database: DatabaseOrTransaction): Database {
  return database as unknown as Database
}

async function createCollectionAtLocation(
  database: DatabaseOrTransaction,
  input: {
    type: CollectionEntityType
    name: string
    locationId: number
    barcode?: string | null
    userId?: number
  }
): Promise<number> {
  try {
    return await createOrResolveCollection(database, input)
  } catch (error: unknown) {
    if (error instanceof CollectionLocationNotFoundError || error instanceof CollectionLocationNotAllowedError) {
      throw new ValidationError(error.message)
    }
    throw error
  }
}

function gridCollectionType(
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well'
): 'micronix_plate' | 'cryovial_box' {
  return containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
}

function gridCollectionMapKey(
  collectionType: 'micronix_plate' | 'cryovial_box',
  collection: GridCollection
): string {
  const identifier = collection.name ?? collection.barcode ?? String(collection.id ?? '')
  return `${collectionType}-${identifier}`
}

async function lookupGridCollectionId(
  database: DatabaseOrTransaction,
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well',
  collection: GridCollection,
  collectionMap?: Map<string, number>
): Promise<number | null> {
  const collectionType = gridCollectionType(containerType)
  const key = gridCollectionMapKey(collectionType, collection)
  if (collectionMap?.has(key)) {
    return collectionMap.get(key)!
  }

  const db = asDatabase(database)

  if (collection.id != null) {
    const existing =
      collectionType === 'cryovial_box'
        ? await database.select({ id: cryovialBox.id }).from(cryovialBox).where(eq(cryovialBox.id, collection.id)).get()
        : await database.select({ id: micronixPlate.id }).from(micronixPlate).where(eq(micronixPlate.id, collection.id)).get()
    if (!existing) {
      const label = collectionType === 'cryovial_box' ? 'Cryovial box' : 'Micronix plate'
      throw new ValidationError(`${label} not found: id ${collection.id}`)
    }
    collectionMap?.set(key, collection.id)
    return collection.id
  }

  if (collection.barcode) {
    const byBarcode = await resolveCollectionByBarcode(collection.barcode, collectionType, db)
    if (byBarcode) {
      collectionMap?.set(key, byBarcode)
      return byBarcode
    }
  }

  if (collection.name) {
    const existing = await resolveCollection(collection.name, collectionType, db)
    if (existing) {
      collectionMap?.set(key, existing)
      return existing
    }
  }

  return null
}

async function ensureGridCollectionId(
  database: DatabaseOrTransaction,
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well',
  collection: GridCollection | undefined,
  options?: EnsureOptions
): Promise<number> {
  const requiredMessage =
    containerType === 'cryovial_tube'
      ? 'Collection is required for cryovial tubes'
      : 'Collection is required for micronix tubes'
  if (!collection) {
    throw new ValidationError(requiredMessage)
  }

  const existing = await lookupGridCollectionId(database, containerType, collection, options?.collectionMap)
  if (existing != null) {
    return existing
  }

  if (collection.locationId == null) {
    throw new ValidationError('Collection not found and no location provided')
  }

  const name = collection.name ?? collection.barcode
  if (!name) {
    throw new ValidationError(
      containerType === 'cryovial_tube'
        ? 'box_name or collection_barcode is required for cryovial_tube'
        : 'plate_name or collection_barcode is required for micronix_tube'
    )
  }

  const collectionType = gridCollectionType(containerType)
  const id = await createCollectionAtLocation(database, {
    type: collectionType,
    name,
    locationId: collection.locationId,
    barcode: collection.barcode,
    userId: options?.userId,
  })
  options?.collectionMap?.set(gridCollectionMapKey(collectionType, collection), id)
  return id
}

async function lookupParentCollectionId(
  database: DatabaseOrTransaction,
  parent: { type: 'box' | 'bag'; id?: number; name?: string; locationId?: number },
  collectionMap?: Map<string, number>
): Promise<number | null> {
  if (parent.id != null) {
    if (parent.type === 'box') {
      const boxRecord = await database.select({ id: box.id }).from(box).where(eq(box.id, parent.id)).get()
      if (!boxRecord) throw new ValidationError(`Box not found: id ${parent.id}`)
      return parent.id
    }
    const bagRecord = await database.select({ id: bag.id }).from(bag).where(eq(bag.id, parent.id)).get()
    if (!bagRecord) throw new ValidationError(`Bag not found: id ${parent.id}`)
    return parent.id
  }

  if (!parent.name) {
    throw new ValidationError('box_name or bag_name is required for paper')
  }

  const key = `${parent.type}-${parent.name}`
  if (collectionMap?.has(key)) {
    return collectionMap.get(key)!
  }

  if (parent.type === 'box') {
    const byName = await database.select({ id: box.id }).from(box).where(eq(box.name, parent.name)).get()
    if (byName) {
      collectionMap?.set(key, byName.id)
      return byName.id
    }
  } else {
    const byName = await database.select({ id: bag.id }).from(bag).where(eq(bag.name, parent.name)).get()
    if (byName) {
      collectionMap?.set(key, byName.id)
      return byName.id
    }
  }

  return null
}

async function ensureParentCollectionId(
  database: DatabaseOrTransaction,
  parent: { type: 'box' | 'bag'; id?: number; name?: string; locationId?: number },
  options?: EnsureOptions
): Promise<number> {
  const existing = await lookupParentCollectionId(database, parent, options?.collectionMap)
  if (existing != null) {
    return existing
  }

  if (parent.locationId == null || !parent.name) {
    throw new ValidationError(`Collection (${parent.type}) not found: ${parent.name ?? ''}`)
  }

  const id = await createCollectionAtLocation(database, {
    type: parent.type,
    name: parent.name,
    locationId: parent.locationId,
    userId: options?.userId,
  })
  options?.collectionMap?.set(`${parent.type}-${parent.name}`, id)
  return id
}

async function ensureSheetId(
  database: DatabaseOrTransaction,
  collection: NonNullable<Extract<ContainerWriteInput, { containerType: 'paper' }>['collection']> | undefined,
  options?: EnsureOptions
): Promise<number> {
  if (!collection) {
    throw new ValidationError('Collection is required for paper containers')
  }

  if (collection.id != null) {
    const sheetRecord = await database
      .select({ id: sheet.id })
      .from(sheet)
      .where(eq(sheet.id, collection.id))
      .get()
    if (!sheetRecord) {
      throw new ValidationError(`Sheet not found: id ${collection.id}`)
    }
    return collection.id
  }

  if (!collection.name) {
    throw new ValidationError('sheet_name is required for paper')
  }
  if (!collection.parent) {
    throw new ValidationError('box_name or bag_name is required for paper')
  }

  const parentId = await ensureParentCollectionId(database, collection.parent, options)
  const parentType = collection.parent.type

  const existing =
    parentType === 'box'
      ? await database
          .select({ id: sheet.id })
          .from(sheet)
          .where(and(eq(sheet.name, collection.name), eq(sheet.boxId, parentId)))
          .get()
      : await database
          .select({ id: sheet.id })
          .from(sheet)
          .where(and(eq(sheet.name, collection.name), eq(sheet.bagId, parentId)))
          .get()

  if (existing) {
    return existing.id
  }

  const now = utcNow()
  const inserted = await database
    .insert(sheet)
    .values({
      name: collection.name,
      boxId: parentType === 'box' ? parentId : null,
      bagId: parentType === 'bag' ? parentId : null,
      created: now,
      lastUpdated: now,
      createdBy: options?.userId,
      updatedBy: options?.userId,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Insert did not return sheet row')
  return row.id
}

/** Find-or-create Collection placement and return ids. Does not insert the Container. */
export async function ensureContainerPlacement(
  database: DatabaseOrTransaction,
  input: ContainerWriteInput,
  options?: EnsureOptions
): Promise<EnsuredPlacement> {
  const comment = commentOf(input)

  switch (input.containerType) {
    case 'micronix_tube': {
      const collectionId = await ensureGridCollectionId(database, 'micronix_tube', input.collection, options)
      return {
        containerType: 'micronix_tube',
        collectionId,
        barcode: input.barcode,
        position: input.collection?.position,
        comment,
      }
    }
    case 'cryovial_tube': {
      const collectionId = await ensureGridCollectionId(database, 'cryovial_tube', input.collection, options)
      return {
        containerType: 'cryovial_tube',
        collectionId,
        barcode: input.barcode,
        position: input.collection?.position,
        comment,
      }
    }
    case 'static_well': {
      const collectionId = await ensureGridCollectionId(database, 'static_well', input.collection, options)
      return {
        containerType: 'static_well',
        collectionId,
        position: input.collection?.position,
        comment,
      }
    }
    case 'paper': {
      const sheetId = await ensureSheetId(database, input.collection, options)
      return {
        containerType: 'paper',
        sheetId,
        sublabel: input.sublabel,
        comment,
      }
    }
    default: {
      const _exhaustive: never = input
      void _exhaustive
      throw new ValidationError('Unsupported container type')
    }
  }
}

/** Lookup-only: collection exists or can be created (locationId present). Does not insert. */
export async function assertWriteInputPlacementResolvable(
  database: DatabaseOrTransaction,
  input: ContainerWriteInput,
  collectionMap?: Map<string, number>
): Promise<void> {
  switch (input.containerType) {
    case 'micronix_tube':
    case 'cryovial_tube':
    case 'static_well': {
      if (!input.collection) {
        throw new ValidationError(
          input.containerType === 'cryovial_tube'
            ? 'Collection is required for cryovial tubes'
            : 'Collection is required for micronix tubes'
        )
      }
      const existing = await lookupGridCollectionId(database, input.containerType, input.collection, collectionMap)
      if (existing == null && input.collection.locationId == null) {
        throw new ValidationError('Collection not found and no location provided')
      }
      return
    }
    case 'paper': {
      const collection = input.collection
      if (!collection) {
        throw new ValidationError('Collection is required for paper containers')
      }
      if (collection.id != null) {
        const sheetRecord = await database
          .select({ id: sheet.id })
          .from(sheet)
          .where(eq(sheet.id, collection.id))
          .get()
        if (!sheetRecord) {
          throw new ValidationError(`Sheet not found: id ${collection.id}`)
        }
        return
      }
      if (!collection.name) {
        throw new ValidationError('sheet_name is required for paper')
      }
      if (!collection.parent) {
        throw new ValidationError('box_name or bag_name is required for paper')
      }
      const parentId = await lookupParentCollectionId(database, collection.parent, collectionMap)
      if (parentId == null && collection.parent.locationId == null) {
        throw new ValidationError(
          `Collection (${collection.parent.type}) not found: ${collection.parent.name ?? ''}`
        )
      }
      return
    }
    default: {
      const _exhaustive: never = input
      void _exhaustive
      throw new ValidationError('Unsupported container type')
    }
  }
}

export function toContainerWriteInput(container: BulkCombinedContainerInput): ContainerWriteInput {
  const { unitId: _unitId, totalQuantity: _totalQuantity, remainingQuantity: _remainingQuantity, ...write } =
    container
  return write
}

export function collectionKeyFromWriteInput(input: ContainerWriteInput): string {
  switch (input.containerType) {
    case 'paper': {
      const parent = input.collection?.parent
      if (parent?.type === 'bag') {
        const name = parent.name ?? String(parent.id ?? '')
        return `bag-${name}`
      }
      const boxName = parent?.name ?? input.collection?.name ?? String(input.collection?.id ?? '')
      return `box-${boxName}`
    }
    case 'cryovial_tube': {
      const c = input.collection
      const identifier = c?.name ?? c?.barcode ?? String(c?.id ?? '')
      return `cryovial_box-${identifier}`
    }
    case 'micronix_tube':
    case 'static_well': {
      const c = input.collection
      const identifier = c?.name ?? c?.barcode ?? String(c?.id ?? '')
      return `micronix_plate-${identifier}`
    }
    default:
      return 'unknown'
  }
}

export async function lookupWriteInputCollectionId(
  database: DatabaseOrTransaction,
  input: ContainerWriteInput,
  collectionMap?: Map<string, number>
): Promise<{ collectionKey: string; collectionId: number | null }> {
  const collectionKey = collectionKeyFromWriteInput(input)
  if (collectionMap?.has(collectionKey)) {
    return { collectionKey, collectionId: collectionMap.get(collectionKey)! }
  }

  const dbForResolve = asDatabase(database)

  if (input.containerType === 'paper') {
    return { collectionKey, collectionId: null }
  }

  const collection = input.collection
  if (!collection) {
    return { collectionKey, collectionId: null }
  }

  if (collection.id != null) {
    return { collectionKey, collectionId: collection.id }
  }

  if (input.containerType === 'cryovial_tube') {
    if (collection.barcode) {
      const id = await resolveCollectionByBarcode(collection.barcode, 'cryovial_box', dbForResolve)
      return { collectionKey, collectionId: id }
    }
    if (collection.name) {
      const id = await resolveCollection(collection.name, 'cryovial_box', dbForResolve)
      return { collectionKey, collectionId: id }
    }
  } else {
    if (collection.barcode) {
      const id = await resolveCollectionByBarcode(collection.barcode, 'micronix_plate', dbForResolve)
      return { collectionKey, collectionId: id }
    }
    if (collection.name) {
      const id = await resolveCollection(collection.name, 'micronix_plate', dbForResolve)
      return { collectionKey, collectionId: id }
    }
  }

  return { collectionKey, collectionId: null }
}

export function placementContainerFromWriteInput(input: ContainerWriteInput) {
  if (input.containerType === 'paper') {
    return {
      containerType: 'paper' as const,
      collectionName: input.collection?.parent?.name,
      sublabel: input.sublabel,
      sheetName: input.collection?.name,
    }
  }
  return {
    containerType: input.containerType,
    collectionName: input.collection?.name,
    collectionBarcode: input.collection?.barcode,
    barcode: 'barcode' in input ? input.barcode : undefined,
    position: input.collection?.position,
  }
}
