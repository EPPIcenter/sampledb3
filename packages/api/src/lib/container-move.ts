import type { Database } from '../db/client'
import {
  micronixTube,
  cryovialTube,
  staticWell,
  paper,
  micronixPlate,
  cryovialBox,
  box,
  bag,
  sheet,
  storageContainer,
} from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { utcNow } from './datetime'
import { resolveCollection, resolveSheetsByName, type CollectionType } from './collections/collection-resolve'
import { checkGridPositionOccupancy } from './container-occupancy'
import { normalizePosition } from './normalize-position'
import { parseGridPosition, type GridCollectionType } from '@sampledb/contract'
import { AmbiguousBarcodeError, resolveContainerByBarcode } from './identifier-resolution'
import type { ContainerSubtype } from './container-placement'

/** Staging prefix for position updates so swaps on one plate do not violate UNIQUE(collection_id, position) mid-transaction. */
const MOVE_STAGING_PREFIX = '__mv_'

function stagingPositionForContainer(containerId: number): string {
  return `${MOVE_STAGING_PREFIX}${containerId}`
}

/** A Container subtype a write can name; `unknown` is only read back. */
export type ContainerType = Exclude<ContainerSubtype, 'unknown'>

export interface ContainerInfo {
  containerId: number
  containerType: ContainerType
  currentCollectionId: number | null
  currentCollectionName: string | null
  currentCollectionType: CollectionType | null
  currentPosition: string | null
  barcode?: string | null
}

export interface MoveOperation {
  identifier: ContainerIdentifier
  targetPosition: string
}

export interface CollectionMapping {
  fromCollectionName: string
  toCollectionName: string
  /** For sheets: box or bag holding the source / target sheet (sheet names repeat). */
  fromParentName?: string
  toParentName?: string
}

export interface BatchMoveRequest {
  collectionType?: CollectionType
  mappings: CollectionMapping[]
  moves: MoveOperation[]
  atomicMode?: 'all_or_nothing' | 'best_effort'
}

export interface ValidationError {
  row: number
  error: string
}

/**
 * Outcome of a move. `success` is true only when every row moved. A best-effort move can
 * move some rows (`moved > 0`) and still report `errors` for the rest; those moves are
 * committed.
 */
export interface MoveResult {
  success: boolean
  moved: number
  errors?: ValidationError[]
}

/** Who is moving: recorded as each moved Container's `updated_by`. */
export interface MoveActor {
  userId: number | null
}

/**
 * Resolve container by position and collection
 */
export async function resolveContainerByPosition(
  database: Database,
  collectionName: string,
  collectionType: GridCollectionType,
  rawPosition: string
): Promise<ContainerInfo | null> {
  // Stored grid positions are normalized ("B1" -> "B01"); match that form.
  const position = normalizePosition(rawPosition)
  if (!position) return null
  const collectionId = await resolveCollection(collectionName, collectionType, database)
  if (!collectionId) return null

  switch (collectionType) {
    case 'cryovial_box': {
      const cryovial = await database
        .select()
        .from(cryovialTube)
        .where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, position)))
        .get()

      if (cryovial) {
        const boxRec = await database.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.collectionId)).get()
        return {
          containerId: cryovial.id,
          containerType: 'cryovial_tube',
          currentCollectionId: cryovial.collectionId,
          currentCollectionName: boxRec?.name || null,
          currentCollectionType: 'cryovial_box',
          currentPosition: cryovial.position || null,
          barcode: cryovial.barcode || null,
        }
      }
      break
    }

    case 'micronix_plate': {
      const tubeRec = await database
        .select()
        .from(micronixTube)
        .where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, position)))
        .get()

      if (tubeRec) {
        const plate = await database.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, tubeRec.collectionId)).get()
        return {
          containerId: tubeRec.id,
          containerType: 'micronix_tube',
          currentCollectionId: tubeRec.collectionId,
          currentCollectionName: plate?.name || null,
          currentCollectionType: 'micronix_plate',
          currentPosition: tubeRec.position || null,
          barcode: tubeRec.barcode,
        }
      }

      const well = await database
        .select()
        .from(staticWell)
        .where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, position)))
        .get()

      if (well) {
        const plate = await database.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, well.collectionId)).get()
        return {
          containerId: well.id,
          containerType: 'static_well',
          currentCollectionId: well.collectionId,
          currentCollectionName: plate?.name || null,
          currentCollectionType: 'micronix_plate',
          currentPosition: well.position || null,
          barcode: null,
        }
      }
      break
    }
  }

  return null
}

/**
 * Check position availability
 */
export async function checkPositionAvailability(
  database: Database,
  collectionId: number,
  collectionType: CollectionType,
  position: string | null,
  excludeContainerIds: number[] = []
): Promise<{ occupied: boolean; containerId: number | null; containerType: ContainerType | null }> {
  if (collectionType !== 'micronix_plate' && collectionType !== 'cryovial_box') {
    return { occupied: false, containerId: null, containerType: null }
  }

  const result = await checkGridPositionOccupancy(database, {
    collectionKind: collectionType,
    collectionId,
    position,
    excludeContainerIds,
  })
  return {
    occupied: result.occupied,
    containerId: result.containerId,
    containerType: result.occupyingType,
  }
}

export interface ContainerIdentifier {
  type: 'barcode' | 'position' | 'container_id'
  barcode?: string
  sourceCollectionName?: string
  sourcePosition?: string
  containerId?: number
}

/**
 * Resolve container by container ID
 */
export async function resolveContainerByContainerId(database: Database, containerId: number): Promise<ContainerInfo | null> {
  const micronix = await database.select().from(micronixTube).where(eq(micronixTube.id, containerId)).get()
  if (micronix) return {
    containerId: micronix.id,
    containerType: 'micronix_tube',
    currentCollectionId: micronix.collectionId,
    currentCollectionName: (await database.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, micronix.collectionId)).get())?.name || null,
    currentCollectionType: 'micronix_plate',
    currentPosition: micronix.position,
    barcode: micronix.barcode,
  }

  const cryovial = await database.select().from(cryovialTube).where(eq(cryovialTube.id, containerId)).get()
  if (cryovial) return {
    containerId: cryovial.id,
    containerType: 'cryovial_tube',
    currentCollectionId: cryovial.collectionId,
    currentCollectionName: (await database.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.collectionId)).get())?.name || null,
    currentCollectionType: 'cryovial_box',
    currentPosition: cryovial.position,
    barcode: cryovial.barcode,
  }

  const well = await database.select().from(staticWell).where(eq(staticWell.id, containerId)).get()
  if (well) return {
    containerId: well.id,
    containerType: 'static_well',
    currentCollectionId: well.collectionId,
    currentCollectionName: (await database.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, well.collectionId)).get())?.name || null,
    currentCollectionType: 'micronix_plate',
    currentPosition: well.position,
    barcode: null,
  }

  const paperRec = await database.select().from(paper).where(eq(paper.id, containerId)).get()
  if (paperRec) return {
    containerId: paperRec.id,
    containerType: 'paper',
    currentCollectionId: paperRec.sheetId,
    currentCollectionName: (await database.select({ name: sheet.name }).from(sheet).where(eq(sheet.id, paperRec.sheetId)).get())?.name || null,
    currentCollectionType: 'sheet',
    currentPosition: null,
    barcode: paperRec.sublabel,
  }

  return null
}

/**
 * Resolve container by identifier. Throws `AmbiguousBarcodeError` when a barcode matches
 * more than one Container.
 */
export async function resolveContainerByIdentifier(database: Database, identifier: ContainerIdentifier): Promise<ContainerInfo | null> {
  if (identifier.type === 'barcode' && identifier.barcode) {
    return resolveContainerByBarcode(database, identifier.barcode)
  } else if (identifier.type === 'position' && identifier.sourceCollectionName && identifier.sourcePosition) {
    const types: GridCollectionType[] = ['cryovial_box', 'micronix_plate']
    for (const type of types) {
      const result = await resolveContainerByPosition(database, identifier.sourceCollectionName, type, identifier.sourcePosition)
      if (result) return result
    }
  } else if (identifier.type === 'container_id' && identifier.containerId) {
    return resolveContainerByContainerId(database, identifier.containerId)
  }
  return null
}

export function containerIdentifierKey(identifier: ContainerIdentifier): string {
  return identifier.type === 'barcode' ? identifier.barcode! : identifier.type === 'position' ? `${identifier.sourceCollectionName}:${identifier.sourcePosition}` : `container_${identifier.containerId}`
}

/** What each identifier resolved to, by `containerIdentifierKey`; identifiers that match nothing are absent. */
export async function resolveContainersByIdentifiers(
  database: Database,
  identifiers: ContainerIdentifier[],
): Promise<Map<string, { container: ContainerInfo } | { ambiguous: AmbiguousBarcodeError }>> {
  const results = new Map<string, { container: ContainerInfo } | { ambiguous: AmbiguousBarcodeError }>()
  for (const identifier of identifiers) {
    try {
      const container = await resolveContainerByIdentifier(database, identifier)
      if (container) results.set(containerIdentifierKey(identifier), { container })
    } catch (error) {
      if (!(error instanceof AmbiguousBarcodeError)) throw error
      results.set(containerIdentifierKey(identifier), { ambiguous: error })
    }
  }
  return results
}

export function inferCollectionTypeFromContainers(containers: ContainerInfo[]): { valid: boolean; collectionType: CollectionType | null; error?: string } {
  if (containers.length === 0) return { valid: false, collectionType: null, error: 'No containers provided' }
  const collectionTypes = new Set<CollectionType>()
  for (const container of containers) {
    if (container.currentCollectionType) collectionTypes.add(container.currentCollectionType)
  }
  if (collectionTypes.size === 0) return { valid: false, collectionType: null, error: 'No containers have collection types' }
  if (collectionTypes.size > 1) return { valid: false, collectionType: null, error: `Mixed collection types: ${Array.from(collectionTypes).join(', ')}` }
  return { valid: true, collectionType: Array.from(collectionTypes)[0] }
}

export async function executeMoves(
  database: Database,
  request: BatchMoveRequest,
  actor: MoveActor = { userId: null },
): Promise<MoveResult> {
  try {
    const { mappings, moves, atomicMode = 'all_or_nothing' } = request
    const errors: ValidationError[] = []

    const resolvedMoves = await Promise.all(moves.map(async (move, index) => {
      try {
        return { row: index + 1, move, info: await resolveContainerByIdentifier(database, move.identifier), error: 'Container not found' }
      } catch (error) {
        // A barcode on several Containers fails its row instead of moving whichever comes first.
        if (!(error instanceof AmbiguousBarcodeError)) throw error
        return { row: index + 1, move, info: null, error: error.message }
      }
    }))

    const validResolvedMoves: Array<{
      row: number
      move: MoveOperation
      info: ContainerInfo
      targetCollectionId?: number
    }> = []

    for (const resolved of resolvedMoves) {
      if (!resolved.info) {
        errors.push({ row: resolved.row, error: resolved.error })
        continue
      }
      validResolvedMoves.push({
        row: resolved.row,
        move: resolved.move,
        info: resolved.info,
      })
    }

    if (validResolvedMoves.length === 0) {
      return { success: false, moved: 0, errors: errors.length > 0 ? errors : [{ row: 0, error: 'No valid containers provided' }] }
    }

    const collectionTypeRes = inferCollectionTypeFromContainers(validResolvedMoves.map(m => m.info))
    if (!collectionTypeRes.valid || !collectionTypeRes.collectionType) {
      errors.push({ row: 0, error: collectionTypeRes.error || 'Unable to determine collection type from containers' })
      return { success: false, moved: 0, errors }
    }
    const collectionType = collectionTypeRes.collectionType

    for (const m of validResolvedMoves) {
      const requiresPosition = m.info.containerType === 'micronix_tube' || m.info.containerType === 'cryovial_tube' || m.info.containerType === 'static_well'
      if (!requiresPosition) continue
      if (!m.move.targetPosition || typeof m.move.targetPosition !== 'string' || m.move.targetPosition.trim() === '') {
        errors.push({ row: m.row, error: `target_position is required for ${m.info.containerType}` })
        continue
      }
      if (collectionType !== 'micronix_plate' && collectionType !== 'cryovial_box') continue
      // Grid position rule: store "b1" as "B01" so writes, conflict keys, and occupancy checks
      // agree, and reject a position the plate or box does not have.
      const parsed = parseGridPosition(m.move.targetPosition, collectionType)
      if (parsed.ok) m.move = { ...m.move, targetPosition: parsed.position }
      else errors.push({ row: m.row, error: parsed.error })
    }

    if (atomicMode === 'all_or_nothing' && errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    const mappingMap = new Map<number, number>()
    const mappingErrors: string[] = []
    for (const m of mappings) {
      if (collectionType === 'sheet') {
        // A sheet name alone resolves only when exactly one sheet has it; otherwise the
        // mapping must name the box or bag. Every source sheet in the named parent maps to
        // the one target sheet (legacy bags can hold several with the same name).
        const fromIds = await resolveSheetsByName(database, m.fromCollectionName, m.fromParentName)
        const toIds = await resolveSheetsByName(database, m.toCollectionName, m.toParentName)
        if (fromIds.length === 0) mappingErrors.push(`Source collection "${m.fromCollectionName}" not found`)
        if (toIds.length === 0) mappingErrors.push(`Target collection "${m.toCollectionName}" not found`)
        const ambiguousSource = fromIds.length > 1 && m.fromParentName === undefined
        if (ambiguousSource) {
          mappingErrors.push(
            `Source sheet "${m.fromCollectionName}" matches ${fromIds.length} sheets; set fromParentName to the box or bag that holds it`,
          )
        }
        if (toIds.length > 1) {
          mappingErrors.push(
            m.toParentName === undefined
              ? `Target sheet "${m.toCollectionName}" matches ${toIds.length} sheets; set toParentName to the box or bag that holds it`
              : `Target sheet "${m.toCollectionName}" matches ${toIds.length} sheets in "${m.toParentName}"`,
          )
        }
        if (fromIds.length > 0 && !ambiguousSource && toIds.length === 1) {
          for (const fromId of fromIds) mappingMap.set(fromId, toIds[0])
        }
        continue
      }
      const fromId = await resolveCollection(m.fromCollectionName, collectionType, database)
      const toId = await resolveCollection(m.toCollectionName, collectionType, database)
      if (fromId && toId) {
        mappingMap.set(fromId, toId)
      } else {
        if (!fromId) mappingErrors.push(`Source collection "${m.fromCollectionName}" not found`)
        if (!toId) mappingErrors.push(`Target collection "${m.toCollectionName}" not found`)
      }
    }

    if (mappingErrors.length > 0) {
      errors.push({ row: 0, error: `Invalid collection mappings: ${mappingErrors.join('; ')}` })
    }

    for (const m of validResolvedMoves) {
      const sourceId = m.info.currentCollectionId
      if (!sourceId || !mappingMap.has(sourceId)) {
        errors.push({
          row: m.row,
          error: `No target collection mapping found for source collection "${m.info.currentCollectionName || 'unknown'}"`,
        })
        continue
      }
      m.targetCollectionId = mappingMap.get(sourceId)
    }

    if (atomicMode === 'all_or_nothing' && errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    const erroredRows = new Set(errors.map(e => e.row).filter(r => r > 0))
    const executableMoves = validResolvedMoves.filter(m => !erroredRows.has(m.row) && !!m.targetCollectionId)

    if (executableMoves.length === 0) {
      return { success: false, moved: 0, errors: errors.length > 0 ? errors : [{ row: 0, error: 'No valid moves to execute' }] }
    }

    const positionConflicts = new Map<string, { row: number; containerId: number; barcode?: string }[]>()

    for (const { row, move, info, targetCollectionId } of executableMoves) {
      const requiresPosition = info.containerType === 'micronix_tube' || info.containerType === 'cryovial_tube' || info.containerType === 'static_well'
      if (requiresPosition && move.targetPosition && targetCollectionId) {
        const positionKey = `${targetCollectionId}:${move.targetPosition}`
        if (!positionConflicts.has(positionKey)) {
          positionConflicts.set(positionKey, [])
        }
        positionConflicts.get(positionKey)!.push({
          row,
          containerId: info.containerId,
          barcode: info.barcode || undefined,
        })
      }
    }

    const singleTargetMoves: typeof executableMoves = []
    for (const [positionKey, containers] of positionConflicts.entries()) {
      if (containers.length > 1) {
        const [, position] = positionKey.split(':')
        const containerList = containers.map(c => c.barcode || `ID ${c.containerId}`).join(', ')
        for (const container of containers) {
          errors.push({
            row: container.row,
            error: `Multiple containers (${containerList}) are trying to move to position ${position}. Only one container can occupy each position.`,
          })
        }
      } else {
        const moveRec = executableMoves.find(m => m.info.containerId === containers[0].containerId)
        if (moveRec?.targetCollectionId) singleTargetMoves.push(moveRec)
      }
    }

    // A container's current cell only counts as free if that container really moves.
    // Rejecting one move can block another, so re-check until the moving set is stable.
    const blockedRows = new Set(errors.map(e => e.row).filter(r => r > 0))
    let changed = true
    while (changed) {
      changed = false
      const movingIds = executableMoves.filter(m => !blockedRows.has(m.row)).map(m => m.info.containerId)
      for (const moveRec of singleTargetMoves) {
        if (blockedRows.has(moveRec.row) || !moveRec.targetCollectionId) continue
        const availability = await checkPositionAvailability(database, moveRec.targetCollectionId, collectionType, moveRec.move.targetPosition || null, movingIds)
        if (availability.occupied && availability.containerId) {
          errors.push({
            row: moveRec.row,
            error: `Target position ${moveRec.move.targetPosition} is already occupied by another container (ID: ${availability.containerId})`,
          })
          blockedRows.add(moveRec.row)
          changed = true
        }
      }
    }

    if (atomicMode === 'all_or_nothing' && errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    const finalErroredRows = new Set(errors.map(e => e.row).filter(r => r > 0))
    const finalMoves = executableMoves.filter(m => !finalErroredRows.has(m.row))

    if (finalMoves.length === 0) {
      return { success: false, moved: 0, errors }
    }

    database.transaction((tx) => {
      for (const { info, targetCollectionId } of finalMoves) {
        if (!targetCollectionId) continue
        switch (info.containerType) {
          case 'micronix_tube':
            tx.update(micronixTube).set({ position: stagingPositionForContainer(info.containerId) }).where(eq(micronixTube.id, info.containerId)).run()
            break
          case 'cryovial_tube':
            tx.update(cryovialTube).set({ position: stagingPositionForContainer(info.containerId) }).where(eq(cryovialTube.id, info.containerId)).run()
            break
          case 'static_well':
            tx.update(staticWell).set({ position: stagingPositionForContainer(info.containerId) }).where(eq(staticWell.id, info.containerId)).run()
            break
        }
      }

      for (const { move, info, targetCollectionId } of finalMoves) {
        if (!targetCollectionId) continue

        switch (info.containerType) {
          case 'micronix_tube':
            tx.update(micronixTube).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(micronixTube.id, info.containerId)).run()
            break
          case 'cryovial_tube':
            tx.update(cryovialTube).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(cryovialTube.id, info.containerId)).run()
            break
          case 'paper':
            tx.update(paper).set({ sheetId: targetCollectionId }).where(eq(paper.id, info.containerId)).run()
            break
          case 'static_well':
            tx.update(staticWell).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(staticWell.id, info.containerId)).run()
            break
        }
      }

      // A move changes the Container's placement, so record when and by whom.
      const now = utcNow()
      for (const { info } of finalMoves) {
        tx.update(storageContainer)
          .set({ lastUpdated: now, updatedBy: actor.userId })
          .where(eq(storageContainer.id, info.containerId))
          .run()
      }
    })

    if (errors.length > 0) {
      return { success: false, moved: finalMoves.length, errors }
    }

    return { success: true, moved: finalMoves.length }
  } catch (error) {
    throw error
  }
}
