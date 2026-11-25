import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { micronixPlate, cryovialBox, box, bag } from '../../db/schema'
import { utcNow } from '../datetime'
import { formatLocationPath } from '../container-enrichment'
import {
  assertLocationCanContainCollections,
  CollectionLocationNotAllowedError,
  CollectionLocationNotFoundError,
} from './collection-lifecycle'
import type { CreateCollectionInput } from './types'

export {
  CollectionLocationNotFoundError,
  CollectionLocationNotAllowedError,
} from './collection-lifecycle'
import { insertedRow } from '../inserted-row'

export class CollectionNameExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionNameExistsError'
  }
}

export async function createMicronixPlate(database: Database, input: CreateCollectionInput) {
  const loc = assertLocationCanContainCollections(database, input.locationId)
  const existing = await database.select().from(micronixPlate).where(eq(micronixPlate.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Plate with this name already exists')

  const now = utcNow()
  const inserted = await database
    .insert(micronixPlate)
    .values({
      name: input.name,
      locationId: input.locationId,
      barcode: input.barcode || null,
      created: now,
      lastUpdated: now,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .returning()
  const newPlate = insertedRow(inserted, 'plate')
  return { plate: { ...newPlate, locationPath: formatLocationPath(loc) } }
}

export async function createCryovialBox(database: Database, input: CreateCollectionInput) {
  const loc = assertLocationCanContainCollections(database, input.locationId)
  const existing = await database.select().from(cryovialBox).where(eq(cryovialBox.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Cryovial box with this name already exists')

  const now = utcNow()
  const inserted = await database
    .insert(cryovialBox)
    .values({
      name: input.name,
      locationId: input.locationId,
      barcode: input.barcode || null,
      created: now,
      lastUpdated: now,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .returning()
  const newBox = insertedRow(inserted, 'cryovial box')
  return { box: { ...newBox, locationPath: formatLocationPath(loc) } }
}

export async function createGenericBox(database: Database, input: CreateCollectionInput) {
  const loc = assertLocationCanContainCollections(database, input.locationId)
  const existing = await database.select().from(box).where(eq(box.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Box with this name already exists')

  const now = utcNow()
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
  const newBox = insertedRow(inserted, 'box')
  return { box: { ...newBox, locationPath: formatLocationPath(loc) } }
}

export async function createBag(database: Database, input: CreateCollectionInput) {
  const loc = assertLocationCanContainCollections(database, input.locationId)
  const existing = await database.select().from(bag).where(eq(bag.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Bag with this name already exists')

  const now = utcNow()
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
  const newBag = insertedRow(inserted, 'bag')
  return { bag: { ...newBag, locationPath: formatLocationPath(loc) } }
}
