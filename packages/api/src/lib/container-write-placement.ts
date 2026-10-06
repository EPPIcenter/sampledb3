import type { ContainerWriteInput } from '@sampledb/contract'
import type { Database } from '../db/client'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type * as schema from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { bag, box, cryovialBox, micronixPlate, sheet } from '../db/schema'
import { resolveCollection, resolveCollectionByBarcode } from './collections/collection-resolve'
import { ValidationError } from './error-handler'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

type GridCollection = NonNullable<
  Extract<ContainerWriteInput, { containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well' }>['collection']
>

export type BulkCombinedContainerInput = ContainerWriteInput & {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

function asDatabase(database: DatabaseOrTransaction): Database {
  return database as unknown as Database
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
