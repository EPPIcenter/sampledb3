import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { location, micronixPlate, cryovialBox, box, bag } from '../../db/schema'
import { utcNow } from '../datetime'
import { formatLocationPath } from '../container-enrichment'
import type { CreateCollectionInput } from './types'

export class CollectionLocationNotFoundError extends Error {
  constructor() {
    super('Location not found')
    this.name = 'CollectionLocationNotFoundError'
  }
}

export class CollectionLocationNotAllowedError extends Error {
  constructor() {
    super(
      'Location cannot contain collections. Only locations with canContainCollections=true can hold collections.',
    )
    this.name = 'CollectionLocationNotAllowedError'
  }
}

export class CollectionNameExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionNameExistsError'
  }
}

async function loadCollectionLocation(database: Database, locationId: number) {
  const loc = await database.select().from(location).where(eq(location.id, locationId)).get()
  if (!loc) throw new CollectionLocationNotFoundError()
  if (!loc.canContainCollections) throw new CollectionLocationNotAllowedError()
  return loc
}

export async function createMicronixPlate(database: Database, input: CreateCollectionInput) {
  const loc = await loadCollectionLocation(database, input.locationId)
  const existing = await database.select().from(micronixPlate).where(eq(micronixPlate.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Plate with this name already exists')

  const now = utcNow()
  const [newPlate] = await database
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

  if (!newPlate) throw new Error('Insert did not return plate row')
  return { plate: { ...newPlate, locationPath: formatLocationPath(loc) } }
}

export async function createCryovialBox(database: Database, input: CreateCollectionInput) {
  const loc = await loadCollectionLocation(database, input.locationId)
  const existing = await database.select().from(cryovialBox).where(eq(cryovialBox.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Cryovial box with this name already exists')

  const now = utcNow()
  const [newBox] = await database
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

  if (!newBox) throw new Error('Insert did not return cryovial box row')
  return { box: { ...newBox, locationPath: formatLocationPath(loc) } }
}

export async function createGenericBox(database: Database, input: CreateCollectionInput) {
  const loc = await loadCollectionLocation(database, input.locationId)
  const existing = await database.select().from(box).where(eq(box.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Box with this name already exists')

  const now = utcNow()
  const [newBox] = await database
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

  if (!newBox) throw new Error('Insert did not return box row')
  return { box: { ...newBox, locationPath: formatLocationPath(loc) } }
}

export async function createBag(database: Database, input: CreateCollectionInput) {
  const loc = await loadCollectionLocation(database, input.locationId)
  const existing = await database.select().from(bag).where(eq(bag.name, input.name)).get()
  if (existing) throw new CollectionNameExistsError('Bag with this name already exists')

  const now = utcNow()
  const [newBag] = await database
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

  if (!newBag) throw new Error('Insert did not return bag row')
  return { bag: { ...newBag, locationPath: formatLocationPath(loc) } }
}
