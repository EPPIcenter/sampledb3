import type { ContainerWriteInput } from '@sampledb/contract'
import type { Database } from '../db/client'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { bag, box, cryovialBox, micronixPlate, sheet } from '../db/schema'
import { resolveCollection, resolveCollectionByBarcode } from './collections/collection-resolve'
import { ValidationError } from './error-handler'
import type { ContainerData, ContainerQuantity } from './container-creation'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

async function resolveMicronixPlateCollection(
  database: DatabaseOrTransaction,
  collection: NonNullable<Extract<ContainerWriteInput, { containerType: 'micronix_tube' }>['collection']> | undefined,
  collectionMap?: Map<string, number>,
): Promise<Pick<ContainerData, 'collectionName' | 'collectionBarcode' | 'collectionLocationId'>> {
  if (!collection) {
    throw new ValidationError('Collection is required for micronix tubes')
  }
  if (collection.id != null) {
    const plate = await database
      .select({ id: micronixPlate.id, name: micronixPlate.name, barcode: micronixPlate.barcode })
      .from(micronixPlate)
      .where(eq(micronixPlate.id, collection.id))
      .get()
    if (!plate) {
      throw new ValidationError(`Micronix plate not found: id ${collection.id}`)
    }
    return { collectionName: plate.name, collectionBarcode: plate.barcode ?? undefined }
  }
  if (collection.barcode) {
    const dbForResolve = database as unknown as Database
    const id = await resolveCollectionByBarcode(collection.barcode, 'micronix_plate', dbForResolve)
    if (id) {
      const plate = await database
        .select({ name: micronixPlate.name, barcode: micronixPlate.barcode })
        .from(micronixPlate)
        .where(eq(micronixPlate.id, id))
        .get()
      return {
        collectionName: plate?.name ?? collection.name,
        collectionBarcode: collection.barcode,
      }
    }
    return {
      collectionName: collection.name,
      collectionBarcode: collection.barcode,
      collectionLocationId: collection.locationId,
    }
  }
  if (collection.name) {
    const key = `micronix_plate-${collection.name}`
    if (collectionMap?.has(key)) {
      return { collectionName: collection.name, collectionLocationId: collection.locationId }
    }
    const dbForResolve = database as unknown as Database
    const existing = await resolveCollection(collection.name, 'micronix_plate', dbForResolve)
    if (existing) {
      collectionMap?.set(key, existing)
      return { collectionName: collection.name }
    }
    if (collection.locationId == null) {
      throw new ValidationError('Collection not found and no location provided')
    }
    return { collectionName: collection.name, collectionLocationId: collection.locationId }
  }
  throw new ValidationError('plate_name or collection_barcode is required for micronix_tube')
}

async function resolveCryovialBoxCollection(
  database: DatabaseOrTransaction,
  collection: NonNullable<Extract<ContainerWriteInput, { containerType: 'cryovial_tube' }>['collection']> | undefined,
  collectionMap?: Map<string, number>,
): Promise<Pick<ContainerData, 'collectionName' | 'collectionBarcode' | 'collectionLocationId'>> {
  if (!collection) {
    throw new ValidationError('Collection is required for cryovial tubes')
  }
  if (collection.id != null) {
    const boxRecord = await database
      .select({ id: cryovialBox.id, name: cryovialBox.name, barcode: cryovialBox.barcode })
      .from(cryovialBox)
      .where(eq(cryovialBox.id, collection.id))
      .get()
    if (!boxRecord) {
      throw new ValidationError(`Cryovial box not found: id ${collection.id}`)
    }
    return { collectionName: boxRecord.name, collectionBarcode: boxRecord.barcode ?? undefined }
  }
  if (collection.barcode) {
    const dbForResolve = database as unknown as Database
    const id = await resolveCollectionByBarcode(collection.barcode, 'cryovial_box', dbForResolve)
    if (id) {
      const boxRecord = await database
        .select({ name: cryovialBox.name })
        .from(cryovialBox)
        .where(eq(cryovialBox.id, id))
        .get()
      return {
        collectionName: boxRecord?.name ?? collection.name,
        collectionBarcode: collection.barcode,
      }
    }
    return {
      collectionName: collection.name,
      collectionBarcode: collection.barcode,
      collectionLocationId: collection.locationId,
    }
  }
  if (collection.name) {
    const key = `cryovial_box-${collection.name}`
    if (collectionMap?.has(key)) {
      return { collectionName: collection.name, collectionLocationId: collection.locationId }
    }
    const dbForResolve = database as unknown as Database
    const existing = await resolveCollection(collection.name, 'cryovial_box', dbForResolve)
    if (existing) {
      collectionMap?.set(key, existing)
      return { collectionName: collection.name }
    }
    if (collection.locationId == null) {
      throw new ValidationError('Collection not found and no location provided')
    }
    return { collectionName: collection.name, collectionLocationId: collection.locationId }
  }
  throw new ValidationError('box_name or collection_barcode is required for cryovial_tube')
}

async function resolveBoxOrBagParent(
  database: DatabaseOrTransaction,
  parent: { type: 'box' | 'bag'; id?: number; name?: string; locationId?: number },
  collectionMap?: Map<string, number>,
): Promise<{ collectionName: string; collectionLocationId?: number; parentType: 'box' | 'bag' }> {
  if (parent.id != null) {
    if (parent.type === 'box') {
      const boxRecord = await database.select({ name: box.name }).from(box).where(eq(box.id, parent.id)).get()
      if (!boxRecord) throw new ValidationError(`Box not found: id ${parent.id}`)
      return { collectionName: boxRecord.name, parentType: 'box' }
    }
    const bagRecord = await database.select({ name: bag.name }).from(bag).where(eq(bag.id, parent.id)).get()
    if (!bagRecord) throw new ValidationError(`Bag not found: id ${parent.id}`)
    return { collectionName: bagRecord.name, parentType: 'bag' }
  }
  if (!parent.name) {
    throw new ValidationError('box_name or bag_name is required for paper')
  }
  const key = `${parent.type}-${parent.name}`
  if (collectionMap?.has(key)) {
    return {
      collectionName: parent.name,
      collectionLocationId: parent.locationId,
      parentType: parent.type,
    }
  }
  if (parent.type === 'box') {
    const boxRecord = await database.select({ id: box.id }).from(box).where(eq(box.name, parent.name)).get()
    if (boxRecord) {
      collectionMap?.set(key, boxRecord.id)
      return { collectionName: parent.name, parentType: 'box' }
    }
  } else {
    const bagRecord = await database.select({ id: bag.id }).from(bag).where(eq(bag.name, parent.name)).get()
    if (bagRecord) {
      collectionMap?.set(key, bagRecord.id)
      return { collectionName: parent.name, parentType: 'bag' }
    }
  }
  if (parent.locationId == null) {
    throw new ValidationError(`Collection (${parent.type}) not found: ${parent.name}`)
  }
  return {
    collectionName: parent.name,
    collectionLocationId: parent.locationId,
    parentType: parent.type,
  }
}

async function resolveSheetCollection(
  database: DatabaseOrTransaction,
  collection: NonNullable<Extract<ContainerWriteInput, { containerType: 'paper' }>['collection']> | undefined,
  collectionMap?: Map<string, number>,
): Promise<
  Pick<ContainerData, 'collectionName' | 'collectionLocationId' | 'sheetName' | 'parentCollectionType'>
> {
  if (!collection) {
    throw new ValidationError('Collection is required for paper containers')
  }
  if (collection.id != null) {
    const sheetRecord = await database
      .select({ id: sheet.id, name: sheet.name, boxId: sheet.boxId, bagId: sheet.bagId })
      .from(sheet)
      .where(eq(sheet.id, collection.id))
      .get()
    if (!sheetRecord) {
      throw new ValidationError(`Sheet not found: id ${collection.id}`)
    }
    let collectionName = collection.name
    if (sheetRecord.boxId != null) {
      const boxRecord = await database.select({ name: box.name }).from(box).where(eq(box.id, sheetRecord.boxId)).get()
      collectionName = boxRecord?.name ?? collectionName
    } else if (sheetRecord.bagId != null) {
      const bagRecord = await database.select({ name: bag.name }).from(bag).where(eq(bag.id, sheetRecord.bagId)).get()
      collectionName = bagRecord?.name ?? collectionName
    }
    if (!collectionName) {
      throw new ValidationError('Could not resolve parent collection for sheet')
    }
    return {
      collectionName,
      sheetName: collection.name ?? sheetRecord.name,
    }
  }
  if (!collection.name) {
    throw new ValidationError('sheet_name is required for paper')
  }
  if (!collection.parent) {
    throw new ValidationError('box_name or bag_name is required for paper')
  }
  const parent = await resolveBoxOrBagParent(database, collection.parent, collectionMap)
  return {
    collectionName: parent.collectionName,
    collectionLocationId: parent.collectionLocationId,
    sheetName: collection.name,
    parentCollectionType: parent.parentType,
  }
}

/** Resolve nested ContainerWriteInput placement for persistence internals. */
export async function resolveContainerPlacement(
  database: DatabaseOrTransaction,
  input: ContainerWriteInput,
  collectionMap?: Map<string, number>,
): Promise<ContainerData> {
  const comment = 'comment' in input ? input.comment : undefined

  switch (input.containerType) {
    case 'micronix_tube': {
      const placement = await resolveMicronixPlateCollection(database, input.collection, collectionMap)
      return {
        containerType: 'micronix_tube',
        barcode: input.barcode,
        position: input.collection?.position,
        comment,
        ...placement,
      }
    }
    case 'cryovial_tube': {
      const placement = await resolveCryovialBoxCollection(database, input.collection, collectionMap)
      return {
        containerType: 'cryovial_tube',
        barcode: input.barcode,
        position: input.collection?.position,
        comment,
        ...placement,
      }
    }
    case 'static_well': {
      const placement = await resolveMicronixPlateCollection(database, input.collection, collectionMap)
      return {
        containerType: 'static_well',
        position: input.collection?.position,
        comment,
        ...placement,
      }
    }
    case 'paper': {
      const placement = await resolveSheetCollection(database, input.collection, collectionMap)
      return {
        containerType: 'paper',
        sublabel: input.sublabel,
        comment,
        ...placement,
      }
    }
    default:
      throw new ValidationError(`Unsupported container type: ${(input as ContainerWriteInput).containerType}`)
  }
}

export type BulkCombinedContainerInput = ContainerWriteInput & ContainerQuantity

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
  collectionMap?: Map<string, number>,
): Promise<{ collectionKey: string; collectionId: number | null }> {
  const collectionKey = collectionKeyFromWriteInput(input)
  if (collectionMap?.has(collectionKey)) {
    return { collectionKey, collectionId: collectionMap.get(collectionKey)! }
  }

  const dbForResolve = database as unknown as Database

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
