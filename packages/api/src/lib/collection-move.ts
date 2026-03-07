import type { Database } from '../db/client'
import {
  micronixPlate,
  cryovialBox,
  box,
  bag,
  location,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { resolveCollectionByName, resolveCollectionByBarcode, type CollectionType } from './collection-resolution'

export type MoveableCollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

export interface CollectionInfo {
  collectionId: number
  collectionType: MoveableCollectionType
  name: string
  barcode: string | null
  currentLocationId: number | null
  currentLocationPath: string | null
}

export interface CollectionIdentifier {
  type: 'id' | 'name' | 'barcode'
  id?: number
  name?: string
  barcode?: string
  locationId?: number
  locationPath?: string
}

export interface CollectionMoveOperation {
  identifier: CollectionIdentifier
  targetLocationId: number
}

export interface CollectionMoveRequest {
  collectionType: MoveableCollectionType
  moves: CollectionMoveOperation[]
  atomicMode?: 'all_or_nothing' | 'best_effort'
}

export interface ValidationError {
  row: number
  error: string
}

export interface CollectionMoveResult {
  success: boolean
  moved: number
  errors?: ValidationError[]
}

/**
 * Build location path string from location record
 */
function buildLocationPath(loc: typeof location.$inferSelect | null | undefined): string | null {
  if (!loc) return null
  // Use the materialized path if available, otherwise use name
  if (loc.path) {
    return loc.path
  }
  if (loc.name) {
    return loc.name
  }
  return null
}

/**
 * Resolve location by path string
 * Note: Users should provide locationId directly. This function is only used
 * for programmatic API calls that provide locationPath strings.
 */
export async function resolveLocationByPath(database: Database, locationPath: string): Promise<number | null> {
  if (!locationPath) return null

  // Find by exact path match
  const locByPath = await database
    .select({ id: location.id })
    .from(location)
    .where(eq(location.path, locationPath))
    .get()

  return locByPath?.id || null
}

/**
 * Resolve collection by name and location
 */
async function resolveCollectionByNameAndLocation(
  database: Database,
  name: string,
  collectionType: MoveableCollectionType,
  locationId?: number,
  locationPath?: string
): Promise<CollectionInfo | null> {
  let resolvedLocationId: number | null = null

  if (locationId) {
    resolvedLocationId = locationId
  } else if (locationPath) {
    resolvedLocationId = await resolveLocationByPath(database, locationPath)
    if (!resolvedLocationId) return null
  }

  switch (collectionType) {
    case 'micronix_plate': {
      const plates = await database.select().from(micronixPlate).where(eq(micronixPlate.name, name))

      if (plates.length === 0) return null
      if (plates.length === 1) {
        const plate = plates[0]
        const loc = await database.select().from(location).where(eq(location.id, plate.locationId)).get()
        return {
          collectionId: plate.id,
          collectionType: 'micronix_plate',
          name: plate.name,
          barcode: plate.barcode,
          currentLocationId: plate.locationId,
          currentLocationPath: buildLocationPath(loc),
        }
      }

      // Multiple matches - need location disambiguation
      if (resolvedLocationId === null) {
        return null // Ambiguous, need location
      }

      const plate = plates.find(p => p.locationId === resolvedLocationId)
      if (!plate) return null

      const loc = await database.select().from(location).where(eq(location.id, plate.locationId)).get()
      return {
        collectionId: plate.id,
        collectionType: 'micronix_plate',
        name: plate.name,
        barcode: plate.barcode,
        currentLocationId: plate.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'cryovial_box': {
      const boxes = await database.select().from(cryovialBox).where(eq(cryovialBox.name, name))

      if (boxes.length === 0) return null
      if (boxes.length === 1) {
        const boxRecord = boxes[0]
        const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
        return {
          collectionId: boxRecord.id,
          collectionType: 'cryovial_box',
          name: boxRecord.name,
          barcode: boxRecord.barcode,
          currentLocationId: boxRecord.locationId,
          currentLocationPath: buildLocationPath(loc),
        }
      }

      // Multiple matches - need location disambiguation
      if (resolvedLocationId === null) {
        return null // Ambiguous, need location
      }

      const boxRecord = boxes.find(b => b.locationId === resolvedLocationId)
      if (!boxRecord) return null

      const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
      return {
        collectionId: boxRecord.id,
        collectionType: 'cryovial_box',
        name: boxRecord.name,
        barcode: boxRecord.barcode,
        currentLocationId: boxRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'box': {
      const boxRecord = await database
        .select()
        .from(box)
        .where(eq(box.name, name))
        .get()

      if (!boxRecord) return null

      // Box names are unique, but verify location if provided
      if (resolvedLocationId !== null && boxRecord.locationId !== resolvedLocationId) {
        return null // Location mismatch
      }

      const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
      return {
        collectionId: boxRecord.id,
        collectionType: 'box',
        name: boxRecord.name,
        barcode: null,
        currentLocationId: boxRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'bag': {
      const bagRecord = await database
        .select()
        .from(bag)
        .where(eq(bag.name, name))
        .get()

      if (!bagRecord) return null

      // Bag names are unique, but verify location if provided
      if (resolvedLocationId !== null && bagRecord.locationId !== resolvedLocationId) {
        return null // Location mismatch
      }

      const loc = await database.select().from(location).where(eq(location.id, bagRecord.locationId)).get()
      return {
        collectionId: bagRecord.id,
        collectionType: 'bag',
        name: bagRecord.name,
        barcode: null,
        currentLocationId: bagRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }
  }

  return null
}

/**
 * Resolve collection by barcode and location
 */
async function resolveCollectionByBarcodeAndLocation(
  database: Database,
  barcode: string,
  collectionType: MoveableCollectionType,
  locationId?: number,
  locationPath?: string
): Promise<CollectionInfo | null> {
  let resolvedLocationId: number | null = null

  if (locationId) {
    resolvedLocationId = locationId
  } else if (locationPath) {
    resolvedLocationId = await resolveLocationByPath(database, locationPath)
    if (!resolvedLocationId) return null
  }

  switch (collectionType) {
    case 'micronix_plate': {
      const plate = await database
        .select()
        .from(micronixPlate)
        .where(eq(micronixPlate.barcode, barcode))
        .get()

      if (!plate) return null

      // If location specified, verify it matches
      if (resolvedLocationId !== null && plate.locationId !== resolvedLocationId) {
        return null // Location mismatch
      }

      const loc = await database.select().from(location).where(eq(location.id, plate.locationId)).get()
      return {
        collectionId: plate.id,
        collectionType: 'micronix_plate',
        name: plate.name,
        barcode: plate.barcode,
        currentLocationId: plate.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'cryovial_box': {
      const boxRecord = await database
        .select()
        .from(cryovialBox)
        .where(eq(cryovialBox.barcode, barcode))
        .get()

      if (!boxRecord) return null

      // If location specified, verify it matches
      if (resolvedLocationId !== null && boxRecord.locationId !== resolvedLocationId) {
        return null // Location mismatch
      }

      const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
      return {
        collectionId: boxRecord.id,
        collectionType: 'cryovial_box',
        name: boxRecord.name,
        barcode: boxRecord.barcode,
        currentLocationId: boxRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    default:
      // Box and bag don't have barcodes
      return null
  }
}

/**
 * Resolve collection by ID
 */
async function resolveCollectionById(
  database: Database,
  id: number,
  collectionType: MoveableCollectionType
): Promise<CollectionInfo | null> {
  switch (collectionType) {
    case 'micronix_plate': {
      const plate = await database
        .select()
        .from(micronixPlate)
        .where(eq(micronixPlate.id, id))
        .get()

      if (!plate) return null

      const loc = await database.select().from(location).where(eq(location.id, plate.locationId)).get()
      return {
        collectionId: plate.id,
        collectionType: 'micronix_plate',
        name: plate.name,
        barcode: plate.barcode,
        currentLocationId: plate.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'cryovial_box': {
      const boxRecord = await database
        .select()
        .from(cryovialBox)
        .where(eq(cryovialBox.id, id))
        .get()

      if (!boxRecord) return null

      const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
      return {
        collectionId: boxRecord.id,
        collectionType: 'cryovial_box',
        name: boxRecord.name,
        barcode: boxRecord.barcode,
        currentLocationId: boxRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'box': {
      const boxRecord = await database
        .select()
        .from(box)
        .where(eq(box.id, id))
        .get()

      if (!boxRecord) return null

      const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
      return {
        collectionId: boxRecord.id,
        collectionType: 'box',
        name: boxRecord.name,
        barcode: null,
        currentLocationId: boxRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }

    case 'bag': {
      const bagRecord = await database
        .select()
        .from(bag)
        .where(eq(bag.id, id))
        .get()

      if (!bagRecord) return null

      const loc = await database.select().from(location).where(eq(location.id, bagRecord.locationId)).get()
      return {
        collectionId: bagRecord.id,
        collectionType: 'bag',
        name: bagRecord.name,
        barcode: null,
        currentLocationId: bagRecord.locationId,
        currentLocationPath: buildLocationPath(loc),
      }
    }
  }

  return null
}

/**
 * Resolve collection by identifier
 */
export async function resolveCollectionByIdentifier(
  database: Database,
  identifier: CollectionIdentifier,
  collectionType: MoveableCollectionType
): Promise<CollectionInfo | null> {
  if (identifier.type === 'id' && identifier.id !== undefined) {
    return resolveCollectionById(database, identifier.id, collectionType)
  }

  if (identifier.type === 'name' && identifier.name) {
    return resolveCollectionByNameAndLocation(
      database,
      identifier.name,
      collectionType,
      identifier.locationId,
      identifier.locationPath
    )
  }

  if (identifier.type === 'barcode' && identifier.barcode) {
    return resolveCollectionByBarcodeAndLocation(
      database,
      identifier.barcode,
      collectionType,
      identifier.locationId,
      identifier.locationPath
    )
  }

  return null
}

/**
 * Validate collection move
 */
async function validateCollectionMove(
  database: Database,
  collectionInfo: CollectionInfo,
  targetLocationId: number
): Promise<{ valid: boolean; error?: string }> {
  // Verify target location exists
  const targetLocation = await database
    .select()
    .from(location)
    .where(eq(location.id, targetLocationId))
    .get()

  if (!targetLocation) {
    return { valid: false, error: `Target location ${targetLocationId} not found` }
  }

  // Verify target location can contain collections
  if (!targetLocation.canContainCollections) {
    return { valid: false, error: `Target location cannot contain collections. Only locations with canContainCollections=true can hold collections.` }
  }

  // Can't move to the same location
  if (collectionInfo.currentLocationId === targetLocationId) {
    return { valid: false, error: `Collection is already at location ${targetLocationId}` }
  }

  return { valid: true }
}

/**
 * Execute collection moves
 */
export async function executeCollectionMoves(
  database: Database,
  request: CollectionMoveRequest
): Promise<CollectionMoveResult> {
  try {
    const { moves, collectionType, atomicMode = 'all_or_nothing' } = request
    const errors: ValidationError[] = []
    const validMoves: Array<{ collectionInfo: CollectionInfo; targetLocationId: number }> = []

    // Resolve all collections
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]
      const collectionInfo = await resolveCollectionByIdentifier(database, move.identifier, collectionType)

      if (!collectionInfo) {
        errors.push({
          row: i,
          error: `Collection not found: ${move.identifier.type === 'id' ? `ID ${move.identifier.id}` : move.identifier.type === 'name' ? `name "${move.identifier.name}"` : `barcode "${move.identifier.barcode}"`}${move.identifier.locationId ? ` at location ${move.identifier.locationId}` : move.identifier.locationPath ? ` at ${move.identifier.locationPath}` : ''}. ${move.identifier.type === 'name' || move.identifier.type === 'barcode' ? 'If multiple collections match, provide locationId or locationPath for disambiguation.' : ''}`,
        })
        continue
      }

      // Validate move
      const validation = await validateCollectionMove(database, collectionInfo, move.targetLocationId)
      if (!validation.valid) {
        errors.push({
          row: i,
          error: validation.error || 'Invalid move',
        })
        continue
      }

      validMoves.push({
        collectionInfo,
        targetLocationId: move.targetLocationId,
      })
    }

    if (validMoves.length === 0) {
      return { success: false, moved: 0, errors }
    }
    if (atomicMode === 'all_or_nothing' && errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    // Execute moves in transaction
    await database.transaction(async (tx) => {
      const now = new Date().toISOString()

      for (const { collectionInfo, targetLocationId } of validMoves) {
        switch (collectionInfo.collectionType) {
          case 'micronix_plate':
            tx.update(micronixPlate)
              .set({
                locationId: targetLocationId,
                lastUpdated: now,
              })
              .where(eq(micronixPlate.id, collectionInfo.collectionId))
              .run()
            break

          case 'cryovial_box':
            tx.update(cryovialBox)
              .set({
                locationId: targetLocationId,
                lastUpdated: now,
              })
              .where(eq(cryovialBox.id, collectionInfo.collectionId))
              .run()
            break

          case 'box':
            tx.update(box)
              .set({
                locationId: targetLocationId,
                lastUpdated: now,
              })
              .where(eq(box.id, collectionInfo.collectionId))
              .run()
            break

          case 'bag':
            tx.update(bag)
              .set({
                locationId: targetLocationId,
                lastUpdated: now,
              })
              .where(eq(bag.id, collectionInfo.collectionId))
              .run()
            break
        }
      }
    })

    return {
      success: errors.length === 0,
      moved: validMoves.length,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    throw error
  }
}

