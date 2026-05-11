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
} from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { resolveCollection, type CollectionType } from './collection-resolution'

/** Staging prefix for position updates so swaps on one plate do not violate UNIQUE(collection_id, position) mid-transaction. */
const MOVE_STAGING_PREFIX = '__mv_'

function stagingPositionForContainer(containerId: number): string {
  return `${MOVE_STAGING_PREFIX}${containerId}`
}

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'static_well' | 'paper'

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

export interface MoveResult {
  success: boolean
  moved: number
  errors?: ValidationError[]
}

/**
 * Resolve container by position and collection
 */
export async function resolveContainerByPosition(
  database: Database,
  collectionName: string,
  collectionType: CollectionType,
  position: string
): Promise<ContainerInfo | null> {
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
 * Resolve container by barcode
 */
export async function resolveContainerByBarcode(database: Database, barcode: string): Promise<ContainerInfo | null> {
  const micronix = await database.select().from(micronixTube).where(eq(micronixTube.barcode, barcode)).get()
  if (micronix) {
    const plate = await database.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, micronix.collectionId)).get()
    return {
      containerId: micronix.id,
      containerType: 'micronix_tube',
      currentCollectionId: micronix.collectionId,
      currentCollectionName: plate?.name || null,
      currentCollectionType: 'micronix_plate',
      currentPosition: micronix.position || null,
      barcode: micronix.barcode,
    }
  }

  const cryovial = await database.select().from(cryovialTube).where(eq(cryovialTube.barcode, barcode)).get()
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

  const paperRec = await database.select().from(paper).where(eq(paper.barcode, barcode)).get()
  if (paperRec) {
    const sheetRec = await database.select({ name: sheet.name }).from(sheet).where(eq(sheet.id, paperRec.sheetId)).get()
    return {
      containerId: paperRec.id,
      containerType: 'paper',
      currentCollectionId: paperRec.sheetId,
      currentCollectionName: sheetRec?.name || null,
      currentCollectionType: 'sheet',
      currentPosition: paperRec.position || null,
      barcode: paperRec.barcode || null,
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
  if (!position) return { occupied: false, containerId: null, containerType: null }

  switch (collectionType) {
    case 'micronix_plate': {
      const tubeRec = await database.select({ id: micronixTube.id }).from(micronixTube).where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, position))).get()
      if (tubeRec && !excludeContainerIds.includes(tubeRec.id)) return { occupied: true, containerId: tubeRec.id, containerType: 'micronix_tube' }

      const well = await database.select({ id: staticWell.id }).from(staticWell).where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, position))).get()
      if (well && !excludeContainerIds.includes(well.id)) return { occupied: true, containerId: well.id, containerType: 'static_well' }
      break
    }
    case 'cryovial_box': {
      const cryovial = await database.select({ id: cryovialTube.id }).from(cryovialTube).where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, position))).get()
      if (cryovial && !excludeContainerIds.includes(cryovial.id)) return { occupied: true, containerId: cryovial.id, containerType: 'cryovial_tube' }
      break
    }
    case 'sheet': {
      const paperRec = await database.select({ id: paper.id }).from(paper).where(and(eq(paper.sheetId, collectionId), eq(paper.position, position))).get()
      if (paperRec && !excludeContainerIds.includes(paperRec.id)) return { occupied: true, containerId: paperRec.id, containerType: 'paper' }
      break
    }
  }

  return { occupied: false, containerId: null, containerType: null }
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
  if (micronix) return resolveContainerByBarcode(database, micronix.barcode)

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

  const paperRec = await database.select().from(paper).where(eq(paper.id, containerId)).get()
  if (paperRec) return {
    containerId: paperRec.id,
    containerType: 'paper',
    currentCollectionId: paperRec.sheetId,
    currentCollectionName: (await database.select({ name: sheet.name }).from(sheet).where(eq(sheet.id, paperRec.sheetId)).get())?.name || null,
    currentCollectionType: 'sheet',
    currentPosition: paperRec.position,
    barcode: paperRec.barcode,
  }

  return null
}

/**
 * Resolve container by identifier
 */
export async function resolveContainerByIdentifier(database: Database, identifier: ContainerIdentifier): Promise<ContainerInfo | null> {
  if (identifier.type === 'barcode' && identifier.barcode) {
    return resolveContainerByBarcode(database, identifier.barcode)
  } else if (identifier.type === 'position' && identifier.sourceCollectionName && identifier.sourcePosition) {
    const types: CollectionType[] = ['cryovial_box', 'micronix_plate', 'box', 'sheet']
    for (const type of types) {
      const result = await resolveContainerByPosition(database, identifier.sourceCollectionName, type, identifier.sourcePosition)
      if (result) return result
    }
  } else if (identifier.type === 'container_id' && identifier.containerId) {
    return resolveContainerByContainerId(database, identifier.containerId)
  }
  return null
}

export async function resolveContainersByIdentifiers(database: Database, identifiers: ContainerIdentifier[]): Promise<Map<string, ContainerInfo>> {
  const results = new Map<string, ContainerInfo>()
  for (const identifier of identifiers) {
    const container = await resolveContainerByIdentifier(database, identifier)
    if (container) {
      const key = identifier.type === 'barcode' ? identifier.barcode! : identifier.type === 'position' ? `${identifier.sourceCollectionName}:${identifier.sourcePosition}` : `container_${identifier.containerId}`
      results.set(key, container)
    }
  }
  return results
}

export async function resolveContainersByBarcodes(database: Database, barcodes: string[]): Promise<Map<string, ContainerInfo>> {
    const identifiers: ContainerIdentifier[] = barcodes.map(b => ({ type: 'barcode', barcode: b }))
    return resolveContainersByIdentifiers(database, identifiers)
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

export async function executeMoves(database: Database, request: BatchMoveRequest): Promise<MoveResult> {
  try {
    const { moves, mappings, atomicMode = 'all_or_nothing' } = request
    const errors: ValidationError[] = []

    const resolvedMoves = await Promise.all(moves.map(async (move, index) => ({
      row: index + 1,
      move,
      info: await resolveContainerByIdentifier(database, move.identifier),
    })))

    const validResolvedMoves: Array<{
      row: number
      move: MoveOperation
      info: ContainerInfo
      targetCollectionId?: number
    }> = []

    for (const resolved of resolvedMoves) {
      if (!resolved.info) {
        errors.push({ row: resolved.row, error: 'Container not found' })
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
      if (requiresPosition && (!m.move.targetPosition || typeof m.move.targetPosition !== 'string' || m.move.targetPosition.trim() === '')) {
        errors.push({ row: m.row, error: `target_position is required for ${m.info.containerType}` })
      }
    }

    if (atomicMode === 'all_or_nothing' && errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    const mappingMap = new Map<number, number>()
    const mappingErrors: string[] = []
    for (const m of mappings) {
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
        const container = containers[0]
        const moveRec = executableMoves.find(m => m.info.containerId === container.containerId)
        if (moveRec?.targetCollectionId) {
          const excludeIds = executableMoves.map(m => m.info.containerId)
          const availability = await checkPositionAvailability(database, moveRec.targetCollectionId, collectionType, moveRec.move.targetPosition || null, excludeIds)

          if (availability.occupied && availability.containerId && !excludeIds.includes(availability.containerId)) {
            errors.push({
              row: container.row,
              error: `Target position ${moveRec.move.targetPosition} is already occupied by another container (ID: ${availability.containerId})`,
            })
          }
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

    await database.transaction(async (tx) => {
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
            tx.update(paper).set({ sheetId: targetCollectionId, position: move.targetPosition }).where(eq(paper.id, info.containerId)).run()
            break
          case 'static_well':
            tx.update(staticWell).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(staticWell.id, info.containerId)).run()
            break
        }
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
