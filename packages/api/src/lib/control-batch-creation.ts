import { db } from '../db/client'
import {
  controlBatch,
  controlDefinition,
  specimen,
  specimenType,
  storageContainer,
  unit,
  micronixTube,
  cryovialTube,
  paper,
  sheet,
  box,
  bag,
  micronixPlate,
  cryovialBox,
  location,
} from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getDefaultUnit } from './defaults'
import { validateContainerTypeForSpecimenType, validateUnitForContainerType, validateControlBatchName, generateUniqueBatchName } from './validation'
import type { ContainerType } from './container-creation'

export interface CreateBatchWithSpecimensRequest {
  batch: {
    controlDefinitionId: number
    name: string
    productionDate?: string
    properties?: Record<string, any>
  }
  specimens: Array<{
    specimenTypeName: string
    collectionDate?: string
      containers: Array<{
        type: 'paper' | 'cryovial_tube' | 'micronix_tube'
        collectionId?: number
        collectionName?: string
        collectionLocationId?: number
        collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
        containerBarcode?: string
        position?: string
        quantity?: number
        unitSymbol?: string
        sheetName?: string
      }>
  }>
  createCollections?: Array<{
    type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
    name: string
    locationId: number
    barcode?: string
  }>
}

export interface CreatedCollection {
  type: string
  id: number
  name: string
}

export interface CreatedSpecimen {
  id: number
  specimenTypeName: string
  containerCount: number
  containerIds: number[]
}

/**
 * Create or get collection by name and location
 */
async function getOrCreateCollection(
  type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box',
  name: string,
  locationId: number,
  barcode: string | undefined,
  tx: any
): Promise<number> {
  // Check if collection exists
  if (type === 'box') {
    const existing = await tx.select().from(box).where(eq(box.name, name)).get()
    if (existing) return existing.id
  } else if (type === 'bag') {
    const existing = await tx.select().from(bag).where(eq(bag.name, name)).get()
    if (existing) return existing.id
  } else if (type === 'micronix_plate') {
    const existing = await tx.select().from(micronixPlate).where(eq(micronixPlate.name, name)).get()
    if (existing) return existing.id
  } else if (type === 'cryovial_box') {
    const existing = await tx.select().from(cryovialBox).where(eq(cryovialBox.name, name)).get()
    if (existing) return existing.id
  }

  // Create new collection
  const now = new Date().toISOString()
  if (type === 'box') {
    const [newBox] = await tx.insert(box).values({
      name,
      locationId,
      created: now,
      lastUpdated: now,
    }).returning()
    return newBox.id
  } else if (type === 'bag') {
    const [newBag] = await tx.insert(bag).values({
      name,
      locationId,
      created: now,
      lastUpdated: now,
    }).returning()
    return newBag.id
  } else if (type === 'micronix_plate') {
    const [newPlate] = await tx.insert(micronixPlate).values({
      name,
      locationId,
      barcode: barcode || null,
      created: now,
      lastUpdated: now,
    }).returning()
    return newPlate.id
  } else {
    const [newBox] = await tx.insert(cryovialBox).values({
      name,
      locationId,
      barcode: barcode || null,
      created: now,
      lastUpdated: now,
    }).returning()
    return newBox.id
  }
  
  throw new Error('Invalid collection type')
}

/**
 * Normalize position string to match frontend format (e.g., "B1" -> "B01")
 */
function normalizePosition(position: string | null | undefined): string | null {
  if (!position || !position.trim()) return null
  
  const trimmed = position.trim()
  const match = trimmed.match(/^([A-Z]+)(\d+)$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = match[2]
    return `${row}${col.padStart(2, '0')}`
  }
  
  // If it doesn't match the pattern, return as-is
  return trimmed
}

/**
 * Get unit ID by symbol
 */
async function getUnitIdBySymbol(symbol: string, containerType: ContainerType): Promise<number> {
  const unitRecord = await db.select().from(unit).where(eq(unit.symbol, symbol)).get()
  if (unitRecord) return unitRecord.id as number
  
  // Fallback to default unit
  return await getDefaultUnit(containerType)
}

/**
 * Create container for specimen
 */
async function createContainer(
  specimenId: number,
  specimenTypeId: number,
  containerData: {
    type: 'paper' | 'cryovial_tube' | 'micronix_tube'
    collectionId?: number
    collectionName?: string
    collectionLocationId?: number
    collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
    containerBarcode?: string
    position?: string
    quantity?: number
    unitSymbol?: string
    sheetName?: string
  },
  collectionMap: Map<string, number>,
  tx: any
): Promise<number> {
  // Validate container type is allowed for specimen type
  const containerTypeValidation = await validateContainerTypeForSpecimenType(specimenTypeId, containerData.type)
  if (!containerTypeValidation.valid) {
    throw new Error(containerTypeValidation.error || 'Container type validation failed')
  }

  // Get unit
  const unitId = containerData.unitSymbol
    ? await getUnitIdBySymbol(containerData.unitSymbol, containerData.type)
    : await getDefaultUnit(containerData.type)

  // Validate unit is allowed for container type
  const unitValidation = await validateUnitForContainerType(containerData.type, unitId)
  if (!unitValidation.valid) {
    throw new Error(unitValidation.error || 'Unit validation failed')
  }

  // Create storage container
  const [container] = await tx.insert(storageContainer).values({
    specimenId,
    totalQuantity: containerData.quantity ?? 1.0,
    remainingQuantity: containerData.quantity ?? 1.0,
    unitId,
  }).returning()

  const containerId = container.id

  // Create specific container type
  if (containerData.type === 'paper') {
    // Need to get or create sheet
    let sheetId: number
    let boxId: number | null = null
    let bagId: number | null = null

    if (containerData.collectionId) {
      // Check if it's a box or bag
      const boxRecord = await tx.select().from(box).where(eq(box.id, containerData.collectionId)).get()
      const bagRecord = await tx.select().from(bag).where(eq(bag.id, containerData.collectionId)).get()
      
      if (boxRecord) {
        boxId = containerData.collectionId
      } else if (bagRecord) {
        bagId = containerData.collectionId
      } else {
        throw new Error(`Collection ${containerData.collectionId} is not a box or bag`)
      }
    } else if (containerData.collectionName && containerData.collectionLocationId) {
      // Determine if box or bag based on collectionType or default to box
      const isBag = containerData.collectionType === 'bag'
      const key = isBag 
        ? `bag-${containerData.collectionName}-${containerData.collectionLocationId}`
        : `box-${containerData.collectionName}-${containerData.collectionLocationId}`
      
      if (collectionMap.has(key)) {
        if (isBag) {
          bagId = collectionMap.get(key)!
        } else {
          boxId = collectionMap.get(key)!
        }
      } else {
        // Try to find existing
        const existingBox = await tx.select().from(box).where(eq(box.name, containerData.collectionName)).get()
        const existingBag = await tx.select().from(bag).where(eq(bag.name, containerData.collectionName)).get()
        
        if (existingBox && !isBag) {
          boxId = existingBox.id
          if (boxId !== null) {
            collectionMap.set(key, boxId)
          }
        } else if (existingBag && isBag) {
          bagId = existingBag.id
          if (bagId !== null) {
            collectionMap.set(key, bagId)
          }
        } else if (!existingBox && !existingBag) {
          // Create new collection
          const collectionId = await getOrCreateCollection(
            isBag ? 'bag' : 'box',
            containerData.collectionName,
            containerData.collectionLocationId,
            undefined,
            tx
          )
          collectionMap.set(key, collectionId)
          if (isBag) {
            bagId = collectionId
          } else {
            boxId = collectionId
          }
        } else {
          throw new Error(`Collection ${containerData.collectionName} exists but is wrong type (expected ${isBag ? 'bag' : 'box'})`)
        }
      }
    } else {
      throw new Error('Collection information required for paper containers')
    }

    // Find or create sheet
    if (containerData.sheetName) {
      // Look for sheet by name within the box/bag
      const existingSheet = await tx
        .select()
        .from(sheet)
        .where(
          and(
            eq(sheet.name, containerData.sheetName),
            boxId ? eq(sheet.boxId, boxId) : eq(sheet.bagId, bagId!)
          )
        )
        .get()

      if (existingSheet) {
        sheetId = existingSheet.id
      } else {
        // Create new sheet with specified name
        const [newSheet] = await tx.insert(sheet).values({
          name: containerData.sheetName,
          boxId,
          bagId,
          created: sql`current_timestamp`,
          lastUpdated: sql`current_timestamp`,
        }).returning()
        sheetId = newSheet.id
      }
    } else {
      // Fallback to old behavior: find any sheet or create with auto-generated name
      const existingSheet = await tx
        .select()
        .from(sheet)
        .where(
          boxId
            ? eq(sheet.boxId, boxId)
            : bagId
            ? eq(sheet.bagId, bagId)
            : sql`1=0`
        )
        .get()

      if (existingSheet) {
        sheetId = existingSheet.id
      } else {
        const [newSheet] = await tx.insert(sheet).values({
          name: `${containerData.collectionName || 'Sheet'}-Sheet-1`,
          boxId,
          bagId,
          created: sql`current_timestamp`,
          lastUpdated: sql`current_timestamp`,
        }).returning()
        sheetId = newSheet.id
      }
    }

    await tx.insert(paper).values({
      id: containerId,
      sheetId,
      barcode: containerData.containerBarcode || null,
      position: normalizePosition(containerData.position),
    })
  } else if (containerData.type === 'cryovial_tube') {
    let collectionId: number
    if (containerData.collectionId) {
      collectionId = containerData.collectionId
    } else if (containerData.collectionName && containerData.collectionLocationId) {
      const key = `cryovial_box-${containerData.collectionName}-${containerData.collectionLocationId}`
      if (collectionMap.has(key)) {
        collectionId = collectionMap.get(key)!
      } else {
        collectionId = await getOrCreateCollection('cryovial_box', containerData.collectionName, containerData.collectionLocationId, undefined, tx)
        collectionMap.set(key, collectionId)
      }
    } else {
      throw new Error('Collection information required for cryovial tubes')
    }

    await tx.insert(cryovialTube).values({
      id: containerId,
      collectionId,
      barcode: containerData.containerBarcode || null,
      position: normalizePosition(containerData.position),
    })
  } else if (containerData.type === 'micronix_tube') {
    let collectionId: number
    if (containerData.collectionId) {
      collectionId = containerData.collectionId
    } else if (containerData.collectionName && containerData.collectionLocationId) {
      const key = `micronix_plate-${containerData.collectionName}-${containerData.collectionLocationId}`
      if (collectionMap.has(key)) {
        collectionId = collectionMap.get(key)!
      } else {
        collectionId = await getOrCreateCollection('micronix_plate', containerData.collectionName, containerData.collectionLocationId, undefined, tx)
        collectionMap.set(key, collectionId)
      }
    } else {
      throw new Error('Collection information required for micronix tubes')
    }

    await tx.insert(micronixTube).values({
      id: containerId,
      collectionId,
      barcode: containerData.containerBarcode || null,
      position: normalizePosition(containerData.position),
    })
  }

  return containerId
}

/**
 * Prepare container data - does all async validation and queries outside transaction
 */
async function prepareContainerData(
  specimenTypeId: number,
  containerData: {
    type: 'paper' | 'cryovial_tube' | 'micronix_tube'
    collectionId?: number
    collectionName?: string
    collectionLocationId?: number
    collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
    containerBarcode?: string
    position?: string
    quantity?: number
    unitSymbol?: string
    sheetName?: string
  },
  collectionMap: Map<string, number>
): Promise<{
  unitId: number
  collectionId?: number
  sheetId?: number
  boxId?: number | null
  bagId?: number | null
  sheetName?: string
}> {
  // Validate container type is allowed for specimen type
  const containerTypeValidation = await validateContainerTypeForSpecimenType(specimenTypeId, containerData.type)
  if (!containerTypeValidation.valid) {
    throw new Error(containerTypeValidation.error || 'Container type validation failed')
  }

  // Get unit
  const unitId = containerData.unitSymbol
    ? await getUnitIdBySymbol(containerData.unitSymbol, containerData.type)
    : await getDefaultUnit(containerData.type)

  // Validate unit is allowed for container type
  const unitValidation = await validateUnitForContainerType(containerData.type, unitId)
  if (!unitValidation.valid) {
    throw new Error(unitValidation.error || 'Unit validation failed')
  }

  // Prepare collection data based on container type
  let collectionId: number | undefined
  let sheetId: number | undefined
  let boxId: number | null = null
  let bagId: number | null = null

  if (containerData.type === 'paper') {
    if (containerData.collectionId) {
      const boxRecord = await db.select().from(box).where(eq(box.id, containerData.collectionId)).get()
      const bagRecord = await db.select().from(bag).where(eq(bag.id, containerData.collectionId)).get()
      if (boxRecord) {
        boxId = containerData.collectionId
      } else if (bagRecord) {
        bagId = containerData.collectionId
      } else {
        throw new Error(`Collection ${containerData.collectionId} is not a box or bag`)
      }
    } else if (containerData.collectionName && containerData.collectionLocationId) {
      const isBag = containerData.collectionType === 'bag'
      const key = isBag 
        ? `bag-${containerData.collectionName}-${containerData.collectionLocationId}`
        : `box-${containerData.collectionName}-${containerData.collectionLocationId}`
      
      if (collectionMap.has(key)) {
        const id = collectionMap.get(key)!
        if (isBag) {
          bagId = id
        } else {
          boxId = id
        }
      } else {
        const existingBox = await db.select().from(box).where(eq(box.name, containerData.collectionName)).get()
        const existingBag = await db.select().from(bag).where(eq(bag.name, containerData.collectionName)).get()
        
        if (existingBox && !isBag) {
          boxId = existingBox.id
          if (boxId !== null) {
            collectionMap.set(key, boxId)
          }
        } else if (existingBag && isBag) {
          bagId = existingBag.id
          if (bagId !== null) {
            collectionMap.set(key, bagId)
          }
        } else if (!existingBox && !existingBag) {
          // Will create in transaction
          collectionMap.set(key, -1) // Placeholder
        } else {
          throw new Error(`Collection ${containerData.collectionName} exists but is wrong type`)
        }
      }
    } else {
      throw new Error('Collection information required for paper containers')
    }

    // Find or determine sheet
    if (boxId || bagId) {
      if (containerData.sheetName) {
        // Look for sheet by name within the box/bag
        const existingSheet = await db
          .select()
          .from(sheet)
          .where(
            and(
              eq(sheet.name, containerData.sheetName),
              boxId ? eq(sheet.boxId, boxId) : eq(sheet.bagId, bagId!)
            )
          )
          .get()
        
        if (existingSheet) {
          sheetId = existingSheet.id
        }
        // Otherwise will create in transaction with the specified name
      } else {
        // Fallback to old behavior: find any sheet in box/bag
        const existingSheet = await db
          .select()
          .from(sheet)
          .where(
            boxId
              ? eq(sheet.boxId, boxId)
              : bagId
              ? eq(sheet.bagId, bagId)
              : sql`1=0`
          )
          .get()
        
        if (existingSheet) {
          sheetId = existingSheet.id
        }
        // Otherwise will create in transaction with auto-generated name
      }
    }
  } else if (containerData.type === 'cryovial_tube') {
    if (containerData.collectionId) {
      collectionId = containerData.collectionId
    } else if (containerData.collectionName && containerData.collectionLocationId) {
      const key = `cryovial_box-${containerData.collectionName}-${containerData.collectionLocationId}`
      if (collectionMap.has(key)) {
        collectionId = collectionMap.get(key)!
      } else {
        const existing = await db.select().from(cryovialBox).where(eq(cryovialBox.name, containerData.collectionName)).get()
        if (existing) {
          collectionId = existing.id
          collectionMap.set(key, collectionId)
        } else {
          collectionMap.set(key, -1) // Placeholder
        }
      }
    } else {
      throw new Error('Collection information required for cryovial tubes')
    }
  } else if (containerData.type === 'micronix_tube') {
    if (containerData.collectionId) {
      collectionId = containerData.collectionId
    } else if (containerData.collectionName && containerData.collectionLocationId) {
      const key = `micronix_plate-${containerData.collectionName}-${containerData.collectionLocationId}`
      if (collectionMap.has(key)) {
        collectionId = collectionMap.get(key)!
      } else {
        const existing = await db.select().from(micronixPlate).where(eq(micronixPlate.name, containerData.collectionName)).get()
        if (existing) {
          collectionId = existing.id
          collectionMap.set(key, collectionId)
        } else {
          collectionMap.set(key, -1) // Placeholder
        }
      }
    } else {
      throw new Error('Collection information required for micronix tubes')
    }
  }

  return {
    unitId,
    collectionId,
    sheetId,
    boxId,
    bagId,
    sheetName: containerData.sheetName,
  }
}

/**
 * Create container synchronously within a transaction
 */
function createContainerSync(
  tx: any,
  specimenId: number,
  containerData: {
    type: 'paper' | 'cryovial_tube' | 'micronix_tube'
    containerBarcode?: string
    position?: string
    quantity?: number
  },
  prepared: {
    unitId: number
    collectionId?: number
    sheetId?: number
    boxId?: number | null
    bagId?: number | null
    sheetName?: string
  },
  collectionMap: Map<string, number>,
  collectionName?: string,
  collectionLocationId?: number,
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
): number {
  // Create storage container
  const containerResult = tx.insert(storageContainer).values({
    specimenId,
    totalQuantity: containerData.quantity ?? 1.0,
    remainingQuantity: containerData.quantity ?? 1.0,
    unitId: prepared.unitId,
  }).returning().get()
  
  const containerRecord = Array.isArray(containerResult) ? containerResult[0] : containerResult
  
  if (!containerRecord) {
    throw new Error('Failed to create storage container - no record returned')
  }
  
  // Extract plain id value
  let containerId: number
  if (typeof containerRecord.id === 'number') {
    containerId = containerRecord.id
  } else if (typeof containerRecord.id === 'object' && containerRecord.id !== null) {
    containerId = (containerRecord.id as any).value ?? containerRecord.id
  } else {
    containerId = containerRecord.id as any
  }
  
  if (typeof containerId !== 'number' || isNaN(containerId)) {
    console.error('Container ID extraction failed:', { containerRecord, containerId })
    throw new Error(`Failed to extract container ID: got ${typeof containerId} ${containerId}`)
  }

  // Create specific container type
  if (containerData.type === 'paper') {
    let finalBoxId = prepared.boxId
    let finalBagId = prepared.bagId
    let finalSheetId = prepared.sheetId

    // Resolve collection if needed
    if (!finalBoxId && !finalBagId && collectionName && collectionLocationId) {
      const isBag = collectionType === 'bag'
      const key = isBag 
        ? `bag-${collectionName}-${collectionLocationId}`
        : `box-${collectionName}-${collectionLocationId}`
      
      if (collectionMap.has(key) && collectionMap.get(key)! !== -1) {
        const id = collectionMap.get(key)!
        if (isBag) {
          finalBagId = id
        } else {
          finalBoxId = id
        }
      } else {
        // Create collection
        const now = new Date().toISOString()
        let newCollectionId: number
        if (isBag) {
          const bagResult = tx.insert(bag).values({
            name: collectionName,
            locationId: collectionLocationId,
            created: now,
            lastUpdated: now,
          }).returning().get()
          const newBag = Array.isArray(bagResult) ? bagResult[0] : bagResult
          newCollectionId = newBag.id
          finalBagId = newCollectionId
        } else {
          const boxResult = tx.insert(box).values({
            name: collectionName,
            locationId: collectionLocationId,
            created: now,
            lastUpdated: now,
          }).returning().get()
          const newBox = Array.isArray(boxResult) ? boxResult[0] : boxResult
          newCollectionId = newBox.id
          finalBoxId = newCollectionId
        }
        collectionMap.set(key, newCollectionId)
      }
    }

    // Create or get sheet
    if (!finalSheetId && (finalBoxId || finalBagId)) {
      if (prepared.sheetName) {
        // Look for sheet by name within the box/bag
        const existingSheet = tx
          .select()
          .from(sheet)
          .where(
            and(
              eq(sheet.name, prepared.sheetName),
              finalBoxId ? eq(sheet.boxId, finalBoxId) : eq(sheet.bagId, finalBagId!)
            )
          )
          .get()

        if (existingSheet) {
          finalSheetId = existingSheet.id
        } else {
          // Create new sheet with specified name
          const sheetResult = tx.insert(sheet).values({
            name: prepared.sheetName,
            boxId: finalBoxId,
            bagId: finalBagId,
            created: sql`current_timestamp`,
            lastUpdated: sql`current_timestamp`,
          }).returning().get()
          const newSheet = Array.isArray(sheetResult) ? sheetResult[0] : sheetResult
          finalSheetId = newSheet.id
        }
      } else {
        // Fallback to old behavior: find any sheet or create with auto-generated name
        const existingSheet = tx
          .select()
          .from(sheet)
          .where(
            finalBoxId
              ? eq(sheet.boxId, finalBoxId)
              : finalBagId
              ? eq(sheet.bagId, finalBagId)
              : sql`1=0`
          )
          .get()

        if (existingSheet) {
          finalSheetId = existingSheet.id
        } else {
          const sheetResult = tx.insert(sheet).values({
            name: `${collectionName || 'Sheet'}-Sheet-1`,
            boxId: finalBoxId,
            bagId: finalBagId,
            created: sql`current_timestamp`,
            lastUpdated: sql`current_timestamp`,
          }).returning().get()
          const newSheet = Array.isArray(sheetResult) ? sheetResult[0] : sheetResult
          finalSheetId = newSheet.id
        }
      }
    }

    tx.insert(paper).values({
      id: containerId,
      sheetId: finalSheetId!,
      barcode: containerData.containerBarcode || null,
      position: normalizePosition(containerData.position),
    }).run()
  } else if (containerData.type === 'cryovial_tube') {
    let finalCollectionId = prepared.collectionId
    if (!finalCollectionId && collectionName && collectionLocationId) {
      const key = `cryovial_box-${collectionName}-${collectionLocationId}`
      if (collectionMap.has(key) && collectionMap.get(key)! !== -1) {
        finalCollectionId = collectionMap.get(key)!
      } else {
        const now = new Date().toISOString()
        const boxResult = tx.insert(cryovialBox).values({
          name: collectionName,
          locationId: collectionLocationId,
          barcode: null,
          created: now,
          lastUpdated: now,
        }).returning().get()
        const newBox = Array.isArray(boxResult) ? boxResult[0] : boxResult
        finalCollectionId = newBox.id
        if (finalCollectionId !== undefined) {
          collectionMap.set(key, finalCollectionId)
        }
      }
    }

    tx.insert(cryovialTube).values({
      id: containerId,
      collectionId: finalCollectionId!,
      barcode: containerData.containerBarcode || null,
      position: normalizePosition(containerData.position),
    }).run()
  } else if (containerData.type === 'micronix_tube') {
    let finalCollectionId = prepared.collectionId
    if (!finalCollectionId && collectionName && collectionLocationId) {
      const key = `micronix_plate-${collectionName}-${collectionLocationId}`
      if (collectionMap.has(key) && collectionMap.get(key)! !== -1) {
        finalCollectionId = collectionMap.get(key)!
      } else {
        const now = new Date().toISOString()
        const plateResult = tx.insert(micronixPlate).values({
          name: collectionName,
          locationId: collectionLocationId,
          barcode: null,
          created: now,
          lastUpdated: now,
        }).returning().get()
        const newPlate = Array.isArray(plateResult) ? plateResult[0] : plateResult
        finalCollectionId = newPlate.id
        if (finalCollectionId !== undefined) {
          collectionMap.set(key, finalCollectionId)
        }
      }
    }

    tx.insert(micronixTube).values({
      id: containerId,
      collectionId: finalCollectionId!,
      barcode: containerData.containerBarcode || null,
      position: normalizePosition(containerData.position),
    }).run()
  }

  return containerId
}

/**
 * Create batch with specimens and containers
 */
export async function createBatchWithSpecimens(
  data: CreateBatchWithSpecimensRequest
): Promise<{
  batch: any
  specimens: CreatedSpecimen[]
  createdCollections: CreatedCollection[]
}> {
  // Do all async work outside transaction
  const collectionMap = new Map<string, number>()
  const createdCollections: CreatedCollection[] = []

  // Validate and generate unique batch name before transaction
  const definition = await db
    .select()
    .from(controlDefinition)
    .where(eq(controlDefinition.id, data.batch.controlDefinitionId))
    .get()

  if (!definition) {
    throw new Error(`Control definition with ID ${data.batch.controlDefinitionId} not found`)
  }

  let batchName: string
  if (data.batch.name) {
    // Validate provided name
    const nameValidation = await validateControlBatchName(data.batch.name)
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error || 'Batch name must be unique')
    }
    batchName = data.batch.name
  } else {
    // Auto-generate unique name using definition name + production date
    batchName = await generateUniqueBatchName(definition.name, data.batch.productionDate)
  }

  // Prepare collections
  if (data.createCollections) {
    for (const coll of data.createCollections) {
      const key = `${coll.type}-${coll.name}-${coll.locationId}`
      // Check if exists
      let collectionId: number | undefined
      if (coll.type === 'box') {
        const existing = await db.select().from(box).where(eq(box.name, coll.name)).get()
        if (existing) collectionId = existing.id
      } else if (coll.type === 'bag') {
        const existing = await db.select().from(bag).where(eq(bag.name, coll.name)).get()
        if (existing) collectionId = existing.id
      } else if (coll.type === 'micronix_plate') {
        const existing = await db.select().from(micronixPlate).where(eq(micronixPlate.name, coll.name)).get()
        if (existing) collectionId = existing.id
      } else if (coll.type === 'cryovial_box') {
        const existing = await db.select().from(cryovialBox).where(eq(cryovialBox.name, coll.name)).get()
        if (existing) collectionId = existing.id
      }

      if (!collectionId) {
        collectionMap.set(key, -1) // Will create in transaction
      } else {
        collectionMap.set(key, collectionId)
      }
      createdCollections.push({
        type: coll.type,
        id: collectionId || -1, // Will be updated in transaction
        name: coll.name,
      })
    }
  }

  // Prepare specimen types and container data
  const preparedSpecimens: Array<{
    specType: any
    specData: any
    preparedContainers: Array<{
      containerData: any
      prepared: any
    }>
  }> = []

  for (const specData of data.specimens) {
    const specType = await db
      .select()
      .from(specimenType)
      .where(eq(specimenType.name, specData.specimenTypeName))
      .get()

    if (!specType) {
      throw new Error(`Specimen type not found: ${specData.specimenTypeName}`)
    }

    // Extract plain values from specType to avoid circular references
    const plainSpecType = {
      id: specType.id,
      name: specType.name,
      created: specType.created,
      lastUpdated: specType.lastUpdated,
    }

    const preparedContainers = []
    for (const containerData of specData.containers) {
      try {
        const prepared = await prepareContainerData(plainSpecType.id, containerData, collectionMap)
        preparedContainers.push({ containerData, prepared })
      } catch (error: any) {
        console.error('Error preparing container:', error)
        throw new Error(`Failed to prepare container: ${error.message}`)
      }
    }

    preparedSpecimens.push({ specType: plainSpecType, specData, preparedContainers })
  }

  // Now do all writes in a synchronous transaction
  return db.transaction((tx) => {
    // Create collections that don't exist yet
    if (data.createCollections) {
      for (let i = 0; i < data.createCollections.length; i++) {
        const coll = data.createCollections[i]
        const key = `${coll.type}-${coll.name}-${coll.locationId}`
        if (collectionMap.get(key) === -1) {
          const now = new Date().toISOString()
          let collectionId: number
          if (coll.type === 'box') {
            const boxResult = tx.insert(box).values({
              name: coll.name,
              locationId: coll.locationId,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newBox = Array.isArray(boxResult) ? boxResult[0] : boxResult
            collectionId = newBox.id
          } else if (coll.type === 'bag') {
            const bagResult = tx.insert(bag).values({
              name: coll.name,
              locationId: coll.locationId,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newBag = Array.isArray(bagResult) ? bagResult[0] : bagResult
            collectionId = newBag.id
          } else if (coll.type === 'micronix_plate') {
            const plateResult = tx.insert(micronixPlate).values({
              name: coll.name,
              locationId: coll.locationId,
              barcode: coll.barcode || null,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newPlate = Array.isArray(plateResult) ? plateResult[0] : plateResult
            collectionId = newPlate.id
          } else {
            const boxResult = tx.insert(cryovialBox).values({
              name: coll.name,
              locationId: coll.locationId,
              barcode: coll.barcode || null,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newBox = Array.isArray(boxResult) ? boxResult[0] : boxResult
            collectionId = newBox.id
          }
          collectionMap.set(key, collectionId)
          createdCollections[i].id = collectionId
        }
      }
    }

    // Create batch with validated unique name
    const batchResult = tx.insert(controlBatch).values({
      controlDefinitionId: data.batch.controlDefinitionId,
      name: batchName,
      productionDate: data.batch.productionDate || null,
      properties: data.batch.properties ? JSON.stringify(data.batch.properties) : null,
    }).returning().get()
    
    // Handle both array and single object returns
    const batchRecord = Array.isArray(batchResult) ? batchResult[0] : batchResult
    
    if (!batchRecord) {
      throw new Error('Failed to create batch - no record returned')
    }
    
    // Extract plain id value (might be a Drizzle column object)
    let batchId: number
    if (typeof batchRecord.id === 'number') {
      batchId = batchRecord.id
    } else if (typeof batchRecord.id === 'object' && batchRecord.id !== null) {
      batchId = (batchRecord.id as any).value ?? batchRecord.id
    } else {
      // Fallback: try to get id from the record directly
      batchId = batchRecord.id as any
    }
    
    if (typeof batchId !== 'number' || isNaN(batchId)) {
      console.error('Batch ID extraction failed:', { batchRecord, batchId })
      throw new Error(`Failed to extract batch ID: got ${typeof batchId} ${batchId}`)
    }

    // Create specimens with containers
    const createdSpecimens: CreatedSpecimen[] = []

    for (const { specType, specData, preparedContainers } of preparedSpecimens) {
      // Create specimen
      const specimenResult = tx.insert(specimen).values({
        controlBatchId: batchId,
        specimenTypeId: specType.id,
        collectionDate: specData.collectionDate || null,
      }).returning().get()
      
      const specimenRecord = Array.isArray(specimenResult) ? specimenResult[0] : specimenResult
      
      if (!specimenRecord) {
        throw new Error('Failed to create specimen - no record returned')
      }
      
      // Extract plain id value
      let specimenId: number
      if (typeof specimenRecord.id === 'number') {
        specimenId = specimenRecord.id
      } else if (typeof specimenRecord.id === 'object' && specimenRecord.id !== null) {
        specimenId = (specimenRecord.id as any).value ?? specimenRecord.id
      } else {
        specimenId = specimenRecord.id as any
      }
      
      if (typeof specimenId !== 'number' || isNaN(specimenId)) {
        console.error('Specimen ID extraction failed:', { specimenRecord, specimenId })
        throw new Error(`Failed to extract specimen ID: got ${typeof specimenId} ${specimenId}`)
      }

      // Create containers for this specimen
      const containerIds: number[] = []
      for (const { containerData, prepared } of preparedContainers) {
        try {
          const containerId = createContainerSync(
            tx,
            specimenId,
            containerData,
            prepared,
            collectionMap,
            containerData.collectionName,
            containerData.collectionLocationId,
            containerData.collectionType
          )
          containerIds.push(containerId)
        } catch (error: any) {
          console.error('Error creating container:', error)
          throw new Error(`Failed to create container: ${error.message}`)
        }
      }

      createdSpecimens.push({
        id: specimenId,
        specimenTypeName: specData.specimenTypeName,
        containerCount: containerIds.length,
        containerIds,
      })
    }

    // Return plain objects to avoid circular references from Drizzle schema
    return {
      batch: {
        id: batchId,
        controlDefinitionId: batchRecord.controlDefinitionId,
        name: batchRecord.name,
        productionDate: batchRecord.productionDate,
        properties: batchRecord.properties,
        created: batchRecord.created,
        lastUpdated: batchRecord.lastUpdated,
      },
      specimens: createdSpecimens,
      createdCollections,
    }
  })
}

/**
 * Add specimens to existing batch
 */
export async function addSpecimensToBatch(
  batchId: number,
  data: Omit<CreateBatchWithSpecimensRequest, 'batch'>
): Promise<{
  specimens: CreatedSpecimen[]
  createdCollections: CreatedCollection[]
}> {
  // Verify batch exists (async, outside transaction)
  const existingBatch = await db
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.id, batchId))
    .get()

  if (!existingBatch) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  // Do all async work outside transaction
  const collectionMap = new Map<string, number>()
  const createdCollections: CreatedCollection[] = []

  // Prepare collections
  if (data.createCollections) {
    for (const coll of data.createCollections) {
      const key = `${coll.type}-${coll.name}-${coll.locationId}`
      // Check if exists
      let collectionId: number | undefined
      if (coll.type === 'box') {
        const existing = await db.select().from(box).where(eq(box.name, coll.name)).get()
        if (existing) collectionId = existing.id
      } else if (coll.type === 'bag') {
        const existing = await db.select().from(bag).where(eq(bag.name, coll.name)).get()
        if (existing) collectionId = existing.id
      } else if (coll.type === 'micronix_plate') {
        const existing = await db.select().from(micronixPlate).where(eq(micronixPlate.name, coll.name)).get()
        if (existing) collectionId = existing.id
      } else if (coll.type === 'cryovial_box') {
        const existing = await db.select().from(cryovialBox).where(eq(cryovialBox.name, coll.name)).get()
        if (existing) collectionId = existing.id
      }

      if (!collectionId) {
        collectionMap.set(key, -1) // Will create in transaction
      } else {
        collectionMap.set(key, collectionId)
      }
      createdCollections.push({
        type: coll.type,
        id: collectionId || -1, // Will be updated in transaction
        name: coll.name,
      })
    }
  }

  // Prepare specimen types and container data
  const preparedSpecimens: Array<{
    specType: any
    specData: any
    preparedContainers: Array<{
      containerData: any
      prepared: any
    }>
  }> = []

  for (const specData of data.specimens) {
    const specType = await db
      .select()
      .from(specimenType)
      .where(eq(specimenType.name, specData.specimenTypeName))
      .get()

    if (!specType) {
      throw new Error(`Specimen type not found: ${specData.specimenTypeName}`)
    }

    // Extract plain values from specType to avoid circular references
    const plainSpecType = {
      id: specType.id,
      name: specType.name,
      created: specType.created,
      lastUpdated: specType.lastUpdated,
    }

    const preparedContainers = []
    for (const containerData of specData.containers) {
      try {
        const prepared = await prepareContainerData(plainSpecType.id, containerData, collectionMap)
        preparedContainers.push({ containerData, prepared })
      } catch (error: any) {
        console.error('Error preparing container:', error)
        throw new Error(`Failed to prepare container: ${error.message}`)
      }
    }

    preparedSpecimens.push({ specType: plainSpecType, specData, preparedContainers })
  }

  // Now do all writes in a synchronous transaction
  return db.transaction((tx) => {
    // Create collections that don't exist yet
    if (data.createCollections) {
      for (let i = 0; i < data.createCollections.length; i++) {
        const coll = data.createCollections[i]
        const key = `${coll.type}-${coll.name}-${coll.locationId}`
        if (collectionMap.get(key) === -1) {
          const now = new Date().toISOString()
          let collectionId: number
          if (coll.type === 'box') {
            const boxResult = tx.insert(box).values({
              name: coll.name,
              locationId: coll.locationId,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newBox = Array.isArray(boxResult) ? boxResult[0] : boxResult
            collectionId = newBox.id
          } else if (coll.type === 'bag') {
            const bagResult = tx.insert(bag).values({
              name: coll.name,
              locationId: coll.locationId,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newBag = Array.isArray(bagResult) ? bagResult[0] : bagResult
            collectionId = newBag.id
          } else if (coll.type === 'micronix_plate') {
            const plateResult = tx.insert(micronixPlate).values({
              name: coll.name,
              locationId: coll.locationId,
              barcode: coll.barcode || null,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newPlate = Array.isArray(plateResult) ? plateResult[0] : plateResult
            collectionId = newPlate.id
          } else {
            const boxResult = tx.insert(cryovialBox).values({
              name: coll.name,
              locationId: coll.locationId,
              barcode: coll.barcode || null,
              created: now,
              lastUpdated: now,
            }).returning().get()
            const newBox = Array.isArray(boxResult) ? boxResult[0] : boxResult
            collectionId = newBox.id
          }
          collectionMap.set(key, collectionId)
          createdCollections[i].id = collectionId
        }
      }
    }

    // Create specimens with containers
    const createdSpecimens: CreatedSpecimen[] = []

    for (const { specType, specData, preparedContainers } of preparedSpecimens) {
      // Create specimen
      const specimenResult = tx.insert(specimen).values({
        controlBatchId: batchId,
        specimenTypeId: specType.id,
        collectionDate: specData.collectionDate || null,
      }).returning().get()
      
      const specimenRecord = Array.isArray(specimenResult) ? specimenResult[0] : specimenResult
      
      if (!specimenRecord) {
        throw new Error('Failed to create specimen - no record returned')
      }
      
      // Extract plain id value
      let specimenId: number
      if (typeof specimenRecord.id === 'number') {
        specimenId = specimenRecord.id
      } else if (typeof specimenRecord.id === 'object' && specimenRecord.id !== null) {
        specimenId = (specimenRecord.id as any).value ?? specimenRecord.id
      } else {
        specimenId = specimenRecord.id as any
      }
      
      if (typeof specimenId !== 'number' || isNaN(specimenId)) {
        console.error('Specimen ID extraction failed:', { specimenRecord, specimenId })
        throw new Error(`Failed to extract specimen ID: got ${typeof specimenId} ${specimenId}`)
      }

      // Create containers for this specimen
      const containerIds: number[] = []
      for (const { containerData, prepared } of preparedContainers) {
        try {
          const containerId = createContainerSync(
            tx,
            specimenId,
            containerData,
            prepared,
            collectionMap,
            containerData.collectionName,
            containerData.collectionLocationId,
            containerData.collectionType
          )
          containerIds.push(containerId)
        } catch (error: any) {
          console.error('Error creating container:', error)
          throw new Error(`Failed to create container: ${error.message}`)
        }
      }

      createdSpecimens.push({
        id: specimenId,
        specimenTypeName: specData.specimenTypeName,
        containerCount: containerIds.length,
        containerIds,
      })
    }

    return {
      specimens: createdSpecimens,
      createdCollections,
    }
  })
}

