import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import type * as schema from '../../db/schema'
import { location, micronixPlate, cryovialBox, box, bag } from '../../db/schema'
import { resolveCollection } from './collection-resolve'
import { utcNow } from '../datetime'

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

export const LOCATION_CANNOT_CONTAIN_COLLECTIONS =
  'Location cannot contain collections. Only locations with canContainCollections=true can hold collections.'

export class CollectionLocationNotFoundError extends Error {
  constructor() {
    super('Location not found')
    this.name = 'CollectionLocationNotFoundError'
  }
}

export class CollectionLocationNotAllowedError extends Error {
  constructor() {
    super(LOCATION_CANNOT_CONTAIN_COLLECTIONS)
    this.name = 'CollectionLocationNotAllowedError'
  }
}

export type CollectionEntityType = 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'

export function collectionEntityKey(type: CollectionEntityType, name: string): string {
  return `${type}-${name}`
}

/** Load location and enforce canContainCollections. */
export function assertLocationCanContainCollections(
  database: DatabaseOrTransaction,
  locationId: number
): typeof location.$inferSelect {
  const loc = database.select().from(location).where(eq(location.id, locationId)).get()
  if (!loc) {
    throw new CollectionLocationNotFoundError()
  }
  if (!loc.canContainCollections) {
    throw new CollectionLocationNotAllowedError()
  }
  return loc
}

export type CreateOrResolveCollectionInput = {
  type: CollectionEntityType
  name: string
  locationId: number
  barcode?: string | null
  userId?: number
  now?: string
}

/**
 * Resolve an existing collection by name/barcode, or create it at locationId when missing.
 * Updates collectionMap when provided.
 */
export async function createOrResolveCollection(
  database: DatabaseOrTransaction,
  input: CreateOrResolveCollectionInput,
  collectionMap?: Map<string, number>
): Promise<number> {
  const key = collectionEntityKey(input.type, input.name)
  if (collectionMap?.has(key)) {
    return collectionMap.get(key)!
  }

  const dbForResolve = database as unknown as Database
  const existing = await resolveCollection(input.name, input.type, dbForResolve)
  if (existing) {
    collectionMap?.set(key, existing)
    return existing
  }

  assertLocationCanContainCollections(database, input.locationId)
  const now = input.now ?? utcNow()

  if (input.type === 'box') {
    const inserted = await database
      .insert(box)
      .values({
        name: input.name,
        locationId: input.locationId,
        created: now,
        lastUpdated: now,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('Insert did not return box row')
    collectionMap?.set(key, row.id)
    return row.id
  }

  if (input.type === 'bag') {
    const inserted = await database
      .insert(bag)
      .values({
        name: input.name,
        locationId: input.locationId,
        created: now,
        lastUpdated: now,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('Insert did not return bag row')
    collectionMap?.set(key, row.id)
    return row.id
  }

  if (input.type === 'micronix_plate') {
    const inserted = await database
      .insert(micronixPlate)
      .values({
        name: input.name,
        locationId: input.locationId,
        barcode: input.barcode ?? null,
        created: now,
        lastUpdated: now,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('Insert did not return micronix plate row')
    collectionMap?.set(key, row.id)
    return row.id
  }

  const inserted = await database
    .insert(cryovialBox)
    .values({
      name: input.name,
      locationId: input.locationId,
      barcode: input.barcode ?? null,
      created: now,
      lastUpdated: now,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Insert did not return cryovial box row')
  collectionMap?.set(key, row.id)
  return row.id
}
