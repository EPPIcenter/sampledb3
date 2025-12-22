import { db } from '../db/client'
import {
  micronixTube,
  cryovialTube,
  staticWell,
  tube,
  paper,
  micronixPlate,
  cryovialBox,
  box,
  bag,
  sheet,
} from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { resolveCollection, type CollectionType } from './collection-resolution'

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'static_well' | 'tube' | 'paper'

export interface AliquotInfo {
  containerId: number
  containerType: ContainerType
  currentCollectionId: number | null
  currentCollectionName: string | null
  currentCollectionType: CollectionType | null
  currentPosition: string | null
  barcode?: string | null
}

export interface MoveOperation {
  identifier: AliquotIdentifier
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
 * Resolve aliquot by position and collection
 */
export async function resolveAliquotByPosition(
  collectionName: string,
  collectionType: CollectionType,
  position: string
): Promise<AliquotInfo | null> {
  const collectionId = await resolveCollection(collectionName, collectionType)
  if (!collectionId) return null

  switch (collectionType) {
    case 'cryovial_box': {
      const cryovial = await db
        .select()
        .from(cryovialTube)
        .where(and(eq(cryovialTube.manifestId, collectionId), eq(cryovialTube.position, position)))
        .get()

      if (cryovial) {
        const boxRec = await db.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.manifestId)).get()
        return {
          containerId: cryovial.id,
          containerType: 'cryovial_tube',
          currentCollectionId: cryovial.manifestId,
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
        .where(and(eq(micronixTube.manifestId, collectionId), eq(micronixTube.position, position)))
        .get()

      if (tubeRec) {
        const plate = await db.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, tubeRec.manifestId)).get()
        return {
          containerId: tubeRec.id,
          containerType: 'micronix_tube',
          currentCollectionId: tubeRec.manifestId,
          currentCollectionName: plate?.name || null,
          currentCollectionType: 'micronix_plate',
          currentPosition: tubeRec.position || null,
          barcode: tubeRec.barcode,
        }
      }

      const well = await db
        .select()
        .from(staticWell)
        .where(and(eq(staticWell.manifestId, collectionId), eq(staticWell.position, position)))
        .get()

      if (well) {
        const plate = await db.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, well.manifestId)).get()
        return {
          containerId: well.id,
          containerType: 'static_well',
          currentCollectionId: well.manifestId,
          currentCollectionName: plate?.name || null,
          currentCollectionType: 'micronix_plate',
          currentPosition: well.position || null,
          barcode: null,
        }
      }
      break
    }

    case 'box': {
      const tubeRecord = await db
        .select()
        .from(tube)
        .where(and(eq(tube.boxId, collectionId), eq(tube.boxPosition, position)))
        .get()

      if (tubeRecord) {
        const boxRecord = await db.select({ name: box.name }).from(box).where(eq(box.id, tubeRecord.boxId)).get()
        return {
          containerId: tubeRecord.id,
          containerType: 'tube',
          currentCollectionId: tubeRecord.boxId,
          currentCollectionName: boxRecord?.name || null,
          currentCollectionType: 'box',
          currentPosition: tubeRecord.boxPosition,
          barcode: null,
        }
      }
      break
    }
  }

  return null
}

/**
 * Resolve aliquot by barcode
 */
export async function resolveAliquotByBarcode(barcode: string): Promise<AliquotInfo | null> {
  const micronix = await db.select().from(micronixTube).where(eq(micronixTube.barcode, barcode)).get()
  if (micronix) {
    const plate = await db.select({ name: micronixPlate.name }).from(micronixPlate).where(eq(micronixPlate.id, micronix.manifestId)).get()
    return {
      containerId: micronix.id,
      containerType: 'micronix_tube',
      currentCollectionId: micronix.manifestId,
      currentCollectionName: plate?.name || null,
      currentCollectionType: 'micronix_plate',
      currentPosition: micronix.position || null,
      barcode: micronix.barcode,
    }
  }

  const cryovial = await db.select().from(cryovialTube).where(eq(cryovialTube.barcode, barcode)).get()
  if (cryovial) {
    const boxRec = await db.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.manifestId)).get()
    return {
      containerId: cryovial.id,
      containerType: 'cryovial_tube',
      currentCollectionId: cryovial.manifestId,
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
      const tubeRec = await db.select({ id: micronixTube.id }).from(micronixTube).where(and(eq(micronixTube.manifestId, collectionId), eq(micronixTube.position, position))).get()
      if (tubeRec && !excludeContainerIds.includes(tubeRec.id)) return { occupied: true, containerId: tubeRec.id, containerType: 'micronix_tube' }

      const well = await db.select({ id: staticWell.id }).from(staticWell).where(and(eq(staticWell.manifestId, collectionId), eq(staticWell.position, position))).get()
      if (well && !excludeContainerIds.includes(well.id)) return { occupied: true, containerId: well.id, containerType: 'static_well' }
      break
    }
    case 'cryovial_box': {
      const cryovial = await db.select({ id: cryovialTube.id }).from(cryovialTube).where(and(eq(cryovialTube.manifestId, collectionId), eq(cryovialTube.position, position))).get()
      if (cryovial && !excludeContainerIds.includes(cryovial.id)) return { occupied: true, containerId: cryovial.id, containerType: 'cryovial_tube' }
      break
    }
    case 'box': {
      const tubeRecord = await db.select({ id: tube.id }).from(tube).where(and(eq(tube.boxId, collectionId), eq(tube.boxPosition, position))).get()
      if (tubeRecord && !excludeContainerIds.includes(tubeRecord.id)) return { occupied: true, containerId: tubeRecord.id, containerType: 'tube' }
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

export interface AliquotIdentifier {
  type: 'barcode' | 'position' | 'container_id'
  barcode?: string
  sourceCollectionName?: string
  sourcePosition?: string
  containerId?: number
}

/**
 * Resolve aliquot by container ID
 */
export async function resolveAliquotByContainerId(containerId: number): Promise<AliquotInfo | null> {
  const micronix = await db.select().from(micronixTube).where(eq(micronixTube.id, containerId)).get()
  if (micronix) return resolveAliquotByBarcode(micronix.barcode)

  const cryovial = await db.select().from(cryovialTube).where(eq(cryovialTube.id, containerId)).get()
  if (cryovial) return {
    containerId: cryovial.id,
    containerType: 'cryovial_tube',
    currentCollectionId: cryovial.manifestId,
    currentCollectionName: (await db.select({ name: cryovialBox.name }).from(cryovialBox).where(eq(cryovialBox.id, cryovial.manifestId)).get())?.name || null,
    currentCollectionType: 'cryovial_box',
    currentPosition: cryovial.position,
    barcode: cryovial.barcode,
  }

  const tubeRec = await db.select().from(tube).where(eq(tube.id, containerId)).get()
  if (tubeRec) return {
    containerId: tubeRec.id,
    containerType: 'tube',
    currentCollectionId: tubeRec.boxId,
    currentCollectionName: (await db.select({ name: box.name }).from(box).where(eq(box.id, tubeRec.boxId)).get())?.name || null,
    currentCollectionType: 'box',
    currentPosition: tubeRec.boxPosition,
    barcode: null,
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
 * Resolve aliquot by identifier
 */
export async function resolveAliquotByIdentifier(identifier: AliquotIdentifier): Promise<AliquotInfo | null> {
  if (identifier.type === 'barcode' && identifier.barcode) {
    return resolveAliquotByBarcode(identifier.barcode)
  } else if (identifier.type === 'position' && identifier.sourceCollectionName && identifier.sourcePosition) {
    const types: CollectionType[] = ['cryovial_box', 'micronix_plate', 'box', 'sheet']
    for (const type of types) {
      const result = await resolveAliquotByPosition(identifier.sourceCollectionName, type, identifier.sourcePosition)
      if (result) return result
    }
  } else if (identifier.type === 'container_id' && identifier.containerId) {
    return resolveAliquotByContainerId(identifier.containerId)
  }
  return null
}

export async function resolveAliquotsByIdentifiers(identifiers: AliquotIdentifier[]): Promise<Map<string, AliquotInfo>> {
  const results = new Map<string, AliquotInfo>()
  for (const identifier of identifiers) {
    const aliquot = await resolveAliquotByIdentifier(identifier)
    if (aliquot) {
      const key = identifier.type === 'barcode' ? identifier.barcode! : identifier.type === 'position' ? `${identifier.sourceCollectionName}:${identifier.sourcePosition}` : `container_${identifier.containerId}`
      results.set(key, aliquot)
    }
  }
  return results
}

export async function resolveAliquotsByBarcodes(barcodes: string[]): Promise<Map<string, AliquotInfo>> {
  const identifiers: AliquotIdentifier[] = barcodes.map(b => ({ type: 'barcode', barcode: b }))
  return resolveAliquotsByIdentifiers(identifiers)
}

export function inferCollectionTypeFromAliquots(aliquots: AliquotInfo[]): { valid: boolean; collectionType: CollectionType | null; error?: string } {
  if (aliquots.length === 0) return { valid: false, collectionType: null, error: 'No aliquots provided' }
  const collectionTypes = new Set<CollectionType>()
  for (const aliquot of aliquots) {
    if (aliquot.currentCollectionType) collectionTypes.add(aliquot.currentCollectionType)
  }
  if (collectionTypes.size === 0) return { valid: false, collectionType: null, error: 'No aliquots have collection types' }
  if (collectionTypes.size > 1) return { valid: false, collectionType: null, error: `Mixed collection types: ${Array.from(collectionTypes).join(', ')}` }
  return { valid: true, collectionType: Array.from(collectionTypes)[0] }
}

export async function executeMoves(request: BatchMoveRequest): Promise<MoveResult> {
  // Simple implementation for brevity, following the transaction pattern
  try {
    const { moves, mappings } = request
    const aliquotsWithInfo = await Promise.all(moves.map(async m => ({ move: m, info: await resolveAliquotByIdentifier(m.identifier) })))
    const validMoves = aliquotsWithInfo.filter(m => m.info !== null)
    
    const collectionTypeRes = inferCollectionTypeFromAliquots(validMoves.map(m => m.info!))
    if (!collectionTypeRes.valid) return { success: false, moved: 0, errors: [{ row: 0, error: collectionTypeRes.error! }] }
    const collectionType = collectionTypeRes.collectionType!

    const mappingMap = new Map<number, number>()
    for (const m of mappings) {
      const fromId = await resolveCollection(m.fromCollectionName, collectionType)
      const toId = await resolveCollection(m.toCollectionName, collectionType)
      if (fromId && toId) mappingMap.set(fromId, toId)
    }

    db.transaction((tx) => {
      for (const { move, info } of validMoves) {
        const targetCollectionId = mappingMap.get(info!.currentCollectionId!)
        if (!targetCollectionId) continue

        switch (info!.containerType) {
          case 'micronix_tube':
            tx.update(micronixTube).set({ manifestId: targetCollectionId, position: move.targetPosition }).where(eq(micronixTube.id, info!.containerId)).run()
            break
          case 'cryovial_tube':
            tx.update(cryovialTube).set({ manifestId: targetCollectionId, position: move.targetPosition }).where(eq(cryovialTube.id, info!.containerId)).run()
            break
          case 'tube':
            tx.update(tube).set({ boxId: targetCollectionId, boxPosition: move.targetPosition }).where(eq(tube.id, info!.containerId)).run()
            break
          case 'paper':
            tx.update(paper).set({ sheetId: targetCollectionId, position: move.targetPosition }).where(eq(paper.id, info!.containerId)).run()
            break
          case 'static_well':
            tx.update(staticWell).set({ manifestId: targetCollectionId, position: move.targetPosition }).where(eq(staticWell.id, info!.containerId)).run()
            break
        }
      }
    })

    return { success: true, moved: validMoves.length }
  } catch (error: any) {
    return { success: false, moved: 0, errors: [{ row: 0, error: error.message }] }
  }
}
