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
import {
  resolveCollectionByName,
  resolveCollectionByBarcode,
  type CollectionType,
} from './collections/collection-resolve'
import { utcNow } from './datetime'
import { formatLocationPath } from './container-enrichment'

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
  /** Type of the Collection to move; falls back to the request's `collectionType`. */
  collectionType?: MoveableCollectionType
  identifier: CollectionIdentifier
  targetLocationId: number
}

/**
 * One move request, run as one transaction. Each move may name its own Collection type, so
 * plates, boxes and bags move together and `all_or_nothing` holds across types.
 */
export interface CollectionMoveRequest {
  /** Default type for moves that do not name one. */
  collectionType?: MoveableCollectionType
  moves: CollectionMoveOperation[]
  atomicMode?: 'all_or_nothing' | 'best_effort'
}

/** `row` is the 1-based position of the move in the request; row 0 is a request-level error. */
export interface ValidationError {
  row: number
  error: string
}

/**
 * Outcome of a Collection move. `success` is true only when every move ran. A best-effort
 * move can move some Collections (`moved > 0`) and report `errors` for the rest; those moves
 * are committed.
 */
export interface CollectionMoveResult {
  success: boolean
  moved: number
  errors?: ValidationError[]
}

/** Who is moving: recorded as each moved Collection's `updated_by`. */
export interface CollectionMoveActor {
  userId: number | null
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
          currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
          currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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
        currentLocationPath: formatLocationPath(loc) ?? null,
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

function describeIdentifier(identifier: CollectionIdentifier): string {
  const what =
    identifier.type === 'id'
      ? `ID ${identifier.id}`
      : identifier.type === 'name'
        ? `name "${identifier.name}"`
        : `barcode "${identifier.barcode}"`
  const where = identifier.locationId
    ? ` at location ${identifier.locationId}`
    : identifier.locationPath
      ? ` at ${identifier.locationPath}`
      : ''
  const hint =
    identifier.type === 'name' || identifier.type === 'barcode'
      ? ' If multiple collections match, provide locationId or locationPath for disambiguation.'
      : ''
  return `Collection not found: ${what}${where}.${hint}`
}

/**
 * Execute collection moves in one transaction. `all_or_nothing` commits nothing if any move
 * fails validation; `best_effort` commits the valid moves and returns errors for the rest.
 */
export async function executeCollectionMoves(
  database: Database,
  request: CollectionMoveRequest,
  actor: CollectionMoveActor = { userId: null },
): Promise<CollectionMoveResult> {
  const { moves, atomicMode = 'all_or_nothing' } = request
  const errors: ValidationError[] = []
  const validMoves: Array<{ collectionInfo: CollectionInfo; targetLocationId: number }> = []
  const seen = new Set<string>()

  for (const [index, move] of moves.entries()) {
    const row = index + 1
    const collectionType = move.collectionType ?? request.collectionType
    if (!collectionType) {
      errors.push({ row, error: 'collectionType is required' })
      continue
    }
    const collectionInfo = await resolveCollectionByIdentifier(database, move.identifier, collectionType)
    if (!collectionInfo) {
      errors.push({ row, error: describeIdentifier(move.identifier) })
      continue
    }

    const key = `${collectionInfo.collectionType}:${collectionInfo.collectionId}`
    if (seen.has(key)) {
      errors.push({ row, error: `Collection "${collectionInfo.name}" appears more than once in this move` })
      continue
    }
    seen.add(key)

    const validation = await validateCollectionMove(database, collectionInfo, move.targetLocationId)
    if (!validation.valid) {
      errors.push({ row, error: validation.error || 'Invalid move' })
      continue
    }

    validMoves.push({ collectionInfo, targetLocationId: move.targetLocationId })
  }

  if (validMoves.length === 0) {
    return { success: false, moved: 0, errors: errors.length > 0 ? errors : [{ row: 0, error: 'No moves provided' }] }
  }
  if (atomicMode === 'all_or_nothing' && errors.length > 0) {
    return { success: false, moved: 0, errors }
  }

  database.transaction((tx) => {
    // A move changes where the Collection is stored, so record when and by whom.
    const audit = { lastUpdated: utcNow(), updatedBy: actor.userId }

    for (const { collectionInfo, targetLocationId } of validMoves) {
      const set = { locationId: targetLocationId, ...audit }
      switch (collectionInfo.collectionType) {
        case 'micronix_plate':
          tx.update(micronixPlate).set(set).where(eq(micronixPlate.id, collectionInfo.collectionId)).run()
          break
        case 'cryovial_box':
          tx.update(cryovialBox).set(set).where(eq(cryovialBox.id, collectionInfo.collectionId)).run()
          break
        case 'box':
          tx.update(box).set(set).where(eq(box.id, collectionInfo.collectionId)).run()
          break
        case 'bag':
          tx.update(bag).set(set).where(eq(bag.id, collectionInfo.collectionId)).run()
          break
      }
    }
  })

  return {
    success: errors.length === 0,
    moved: validMoves.length,
    errors: errors.length > 0 ? errors : undefined,
  }
}
