import { db } from '../db/client'
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
  collectionName: string,
  collectionType: CollectionType,
  position: string
): Promise<ContainerInfo | null> {
  const collectionId = await resolveCollection(collectionName, collectionType)
  if (!collectionId) return null

  switch (collectionType) {
    case 'cryovial_box': {
      const cryovial = await db
        .select()
        .from(cryovialTube)
        .where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, position)))
        .get()

      if (cryovial) {
        const boxRec = await db.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.collectionId)).get()
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
      const tubeRec = await db
        .select()
        .from(micronixTube)
        .where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, position)))
        .get()

      if (tubeRec) {
        const plate = await db.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, tubeRec.collectionId)).get()
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

      const well = await db
        .select()
        .from(staticWell)
        .where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, position)))
        .get()

      if (well) {
        const plate = await db.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, well.collectionId)).get()
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
export async function resolveContainerByBarcode(barcode: string): Promise<ContainerInfo | null> {
  const micronix = await db.select().from(micronixTube).where(eq(micronixTube.barcode, barcode)).get()
  if (micronix) {
    const plate = await db.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, micronix.collectionId)).get()
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

  const cryovial = await db.select().from(cryovialTube).where(eq(cryovialTube.barcode, barcode)).get()
  if (cryovial) {
    const boxRec = await db.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.collectionId)).get()
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

  const paperRec = await db.select().from(paper).where(eq(paper.barcode, barcode)).get()
  if (paperRec) {
    const sheetRec = await db.select({ name: sheet.name }).from(sheet).where(eq(sheet.id, paperRec.sheetId)).get()
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
  collectionId: number,
  collectionType: CollectionType,
  position: string | null,
  excludeContainerIds: number[] = []
): Promise<{ occupied: boolean; containerId: number | null; containerType: ContainerType | null }> {
  if (!position) return { occupied: false, containerId: null, containerType: null }

  switch (collectionType) {
    case 'micronix_plate': {
      const tubeRec = await db.select({ id: micronixTube.id }).from(micronixTube).where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, position))).get()
      if (tubeRec && !excludeContainerIds.includes(tubeRec.id)) return { occupied: true, containerId: tubeRec.id, containerType: 'micronix_tube' }

      const well = await db.select({ id: staticWell.id }).from(staticWell).where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, position))).get()
      if (well && !excludeContainerIds.includes(well.id)) return { occupied: true, containerId: well.id, containerType: 'static_well' }
      break
    }
    case 'cryovial_box': {
      const cryovial = await db.select({ id: cryovialTube.id }).from(cryovialTube).where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, position))).get()
      if (cryovial && !excludeContainerIds.includes(cryovial.id)) return { occupied: true, containerId: cryovial.id, containerType: 'cryovial_tube' }
      break
    }
    case 'sheet': {
      const paperRec = await db.select({ id: paper.id }).from(paper).where(and(eq(paper.sheetId, collectionId), eq(paper.position, position))).get()
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
export async function resolveContainerByContainerId(containerId: number): Promise<ContainerInfo | null> {
  const micronix = await db.select().from(micronixTube).where(eq(micronixTube.id, containerId)).get()
  if (micronix) return resolveContainerByBarcode(micronix.barcode)

  const cryovial = await db.select().from(cryovialTube).where(eq(cryovialTube.id, containerId)).get()
  if (cryovial) return {
    containerId: cryovial.id,
    containerType: 'cryovial_tube',
    currentCollectionId: cryovial.collectionId,
    currentCollectionName: (await db.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.collectionId)).get())?.name || null,
    currentCollectionType: 'cryovial_box',
    currentPosition: cryovial.position,
    barcode: cryovial.barcode,
  }

  const paperRec = await db.select().from(paper).where(eq(paper.id, containerId)).get()
  if (paperRec) return {
    containerId: paperRec.id,
    containerType: 'paper',
    currentCollectionId: paperRec.sheetId,
    currentCollectionName: (await db.select({ name: sheet.name }).from(sheet).where(eq(sheet.id, paperRec.sheetId)).get())?.name || null,
    currentCollectionType: 'sheet',
    currentPosition: paperRec.position,
    barcode: paperRec.barcode,
  }

  return null
}

/**
 * Resolve container by identifier
 */
export async function resolveContainerByIdentifier(identifier: ContainerIdentifier): Promise<ContainerInfo | null> {
  if (identifier.type === 'barcode' && identifier.barcode) {
    return resolveContainerByBarcode(identifier.barcode)
  } else if (identifier.type === 'position' && identifier.sourceCollectionName && identifier.sourcePosition) {
    const types: CollectionType[] = ['cryovial_box', 'micronix_plate', 'box', 'sheet']
    for (const type of types) {
      const result = await resolveContainerByPosition(identifier.sourceCollectionName, type, identifier.sourcePosition)
      if (result) return result
    }
  } else if (identifier.type === 'container_id' && identifier.containerId) {
    return resolveContainerByContainerId(identifier.containerId)
  }
  return null
}

export async function resolveContainersByIdentifiers(identifiers: ContainerIdentifier[]): Promise<Map<string, ContainerInfo>> {
  const results = new Map<string, ContainerInfo>()
  for (const identifier of identifiers) {
    const container = await resolveContainerByIdentifier(identifier)
    if (container) {
      const key = identifier.type === 'barcode' ? identifier.barcode! : identifier.type === 'position' ? `${identifier.sourceCollectionName}:${identifier.sourcePosition}` : `container_${identifier.containerId}`
      results.set(key, container)
    }
  }
  return results
}

export async function resolveContainersByBarcodes(barcodes: string[]): Promise<Map<string, ContainerInfo>> {
    const identifiers: ContainerIdentifier[] = barcodes.map(b => ({ type: 'barcode', barcode: b }))
    return resolveContainersByIdentifiers(identifiers)
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

export async function executeMoves(request: BatchMoveRequest): Promise<MoveResult> {
  // Simple implementation for brevity, following the transaction pattern
  try {
    const { moves, mappings } = request
    const containersWithInfo = await Promise.all(moves.map(async m => ({ move: m, info: await resolveContainerByIdentifier(m.identifier) })))
    const validMoves = containersWithInfo.filter(m => m.info !== null)
    
    const collectionTypeRes = inferCollectionTypeFromContainers(validMoves.map(m => m.info!))
    if (!collectionTypeRes.valid) return { success: false, moved: 0, errors: [{ row: 0, error: collectionTypeRes.error! }] }
    const collectionType = collectionTypeRes.collectionType!

    // Validate that targetPosition is provided for containers that require it
    const errors: ValidationError[] = []
    for (let i = 0; i < validMoves.length; i++) {
      const { move, info } = validMoves[i]
      const requiresPosition = info!.containerType === 'micronix_tube' || info!.containerType === 'cryovial_tube' || info!.containerType === 'static_well'
      if (requiresPosition && (!move.targetPosition || typeof move.targetPosition !== 'string' || move.targetPosition.trim() === '')) {
        errors.push({ row: i + 1, error: `target_position is required for ${info!.containerType}` })
      }
    }
    if (errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    // Validate mappings
    const mappingMap = new Map<number, number>()
    const missingMappings: string[] = []
    for (const m of mappings) {
      const fromId = await resolveCollection(m.fromCollectionName, collectionType)
      const toId = await resolveCollection(m.toCollectionName, collectionType)
      if (fromId && toId) {
        mappingMap.set(fromId, toId)
      } else {
        if (!fromId) missingMappings.push(`Source collection "${m.fromCollectionName}" not found`)
        if (!toId) missingMappings.push(`Target collection "${m.toCollectionName}" not found`)
      }
    }
    
    // Check if all source collections have mappings
    const sourceCollectionIds = new Set(validMoves.map(m => m.info!.currentCollectionId).filter(Boolean))
    for (const sourceId of sourceCollectionIds) {
      if (!mappingMap.has(sourceId!)) {
        const sourceCollection = validMoves.find(m => m.info!.currentCollectionId === sourceId)
        if (sourceCollection) {
          missingMappings.push(`No mapping configured for source collection "${sourceCollection.info!.currentCollectionName}"`)
        }
      }
    }
    
    if (missingMappings.length > 0) {
      return { success: false, moved: 0, errors: [{ row: 0, error: `Missing collection mappings: ${missingMappings.join('; ')}` }] }
    }

    // Validate position conflicts before executing
    // Build a map of target positions to check for conflicts
    const positionConflicts = new Map<string, { row: number; containerId: number; barcode?: string }[]>()
    
    for (let i = 0; i < validMoves.length; i++) {
      const { move, info } = validMoves[i]
      const targetCollectionId = mappingMap.get(info!.currentCollectionId!)
      if (!targetCollectionId) {
        errors.push({ row: i + 1, error: `No target collection mapping found for container ${info!.barcode || info!.containerId}` })
        continue
      }

      // Check if target position is already occupied (excluding the container being moved if it's a same-position move)
      const requiresPosition = info!.containerType === 'micronix_tube' || info!.containerType === 'cryovial_tube' || info!.containerType === 'static_well'
      if (requiresPosition && move.targetPosition) {
        const positionKey = `${targetCollectionId}:${move.targetPosition}`
        if (!positionConflicts.has(positionKey)) {
          positionConflicts.set(positionKey, [])
        }
        positionConflicts.get(positionKey)!.push({
          row: i + 1,
          containerId: info!.containerId,
          barcode: info!.barcode || undefined,
        })
      }
    }
    
    // Check for multiple containers trying to move to the same position
    for (const [positionKey, containers] of positionConflicts.entries()) {
      if (containers.length > 1) {
        const [, position] = positionKey.split(':')
        const containerList = containers.map(c => c.barcode || `ID ${c.containerId}`).join(', ')
        for (const container of containers) {
          errors.push({ 
            row: container.row, 
            error: `Multiple containers (${containerList}) are trying to move to position ${position}. Only one container can occupy each position.` 
          })
        }
      } else {
        // Check if position is occupied by another container (not being moved)
        const container = containers[0]
        const moveIndex = validMoves.findIndex(m => m.info!.containerId === container.containerId)
        if (moveIndex >= 0) {
          const { move, info } = validMoves[moveIndex]
          const targetCollectionId = mappingMap.get(info!.currentCollectionId!)
          if (targetCollectionId) {
            const excludeIds = validMoves.map(m => m.info!.containerId)
            const availability = await checkPositionAvailability(targetCollectionId, collectionType, move.targetPosition, excludeIds)
            
            if (availability.occupied && availability.containerId && !excludeIds.includes(availability.containerId)) {
              errors.push({ 
                row: container.row, 
                error: `Target position ${move.targetPosition} is already occupied by another container (ID: ${availability.containerId})` 
              })
            }
          }
        }
      }
    }
    
    if (errors.length > 0) {
      return { success: false, moved: 0, errors }
    }

    // All validation passed, execute the moves
    db.transaction((tx) => {
      for (const { move, info } of validMoves) {
        const targetCollectionId = mappingMap.get(info!.currentCollectionId!)
        if (!targetCollectionId) continue

        switch (info!.containerType) {
          case 'micronix_tube':
            tx.update(micronixTube).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(micronixTube.id, info!.containerId)).run()
            break
          case 'cryovial_tube':
            tx.update(cryovialTube).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(cryovialTube.id, info!.containerId)).run()
            break
          case 'paper':
            tx.update(paper).set({ sheetId: targetCollectionId, position: move.targetPosition }).where(eq(paper.id, info!.containerId)).run()
            break
          case 'static_well':
            tx.update(staticWell).set({ collectionId: targetCollectionId, position: move.targetPosition }).where(eq(staticWell.id, info!.containerId)).run()
            break
        }
      }
    })

    return { success: true, moved: validMoves.length }
  } catch (error: any) {
    return { success: false, moved: 0, errors: [{ row: 0, error: error.message }] }
  }
}
