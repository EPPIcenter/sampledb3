import { db } from '../db/client'
import {
  storageContainer,
  micronixTube,
  cryovialTube,
  tube,
  paper,
  staticWell,
  sheet,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from './defaults'
import {
  resolveCollection,
} from './collection-resolution'

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'tube' | 'paper' | 'static_well'

export interface ContainerData {
  mode: 'create' | 'link' | 'skip'
  containerType: ContainerType
  // For linking existing
  containerBarcode?: string
  containerId?: number
  // For creating new
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  label?: string
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
  comment?: string
}

/**
 * Validate container data based on container type
 */
export async function validateContainerData(
  containerType: ContainerType,
  data: ContainerData
): Promise<{ valid: boolean; error?: string }> {
  if (data.mode === 'skip') {
    return { valid: true }
  }

  if (data.mode === 'link') {
    if (containerType === 'micronix_tube') {
      if (!data.containerBarcode) {
        return { valid: false, error: 'Container barcode is required for linking micronix tubes' }
      }
    } else if (!data.containerId) {
      return { valid: false, error: 'Container ID is required for linking' }
    }
    return { valid: true }
  }

  // Mode is 'create'
  if (containerType === 'micronix_tube') {
    if (!data.barcode) {
      return { valid: false, error: 'Barcode is required for micronix tubes' }
    }
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    // Validate barcode uniqueness
    const existing = await db
      .select({ id: micronixTube.id })
      .from(micronixTube)
      .where(eq(micronixTube.barcode, data.barcode))
      .get()
    if (existing) {
      return { valid: false, error: `Barcode '${data.barcode}' already exists` }
    }
  } else if (containerType === 'cryovial_tube') {
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    // Validate barcode uniqueness if provided
    if (data.barcode) {
      const existing = await db
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(eq(cryovialTube.barcode, data.barcode))
        .get()
      if (existing) {
        return { valid: false, error: `Barcode '${data.barcode}' already exists` }
      }
    }
  } else if (containerType === 'tube') {
    if (!data.collectionName) {
      return { valid: false, error: 'Collection name is required for generic tubes' }
    }
    if (!data.label) {
      return { valid: false, error: 'Label is required for generic tubes' }
    }
    if (!data.position) {
      return { valid: false, error: 'Box position is required for generic tubes' }
    }
  } else if (containerType === 'paper') {
    if (!data.collectionName) {
      return { valid: false, error: 'Collection name is required for papers' }
    }
    if (!data.label) {
      return { valid: false, error: 'Label is required for papers' }
    }
  } else if (containerType === 'static_well') {
    if (!data.collectionName && !data.collectionBarcode) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
  }

  return { valid: true }
}

/**
 * Link existing container to specimen
 */
export async function linkExistingContainer(
  specimenId: number,
  containerId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if container exists and is not already linked
    const container = await db
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, containerId))
      .get()

    if (!container) {
      return { success: false, error: 'Container not found' }
    }

    if (container.specimenId && container.specimenId !== specimenId) {
      return { success: false, error: 'Container is already linked to another specimen' }
    }

    // Update container to link to specimen
    await db
      .update(storageContainer)
      .set({
        specimenId,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(storageContainer.id, containerId))

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to link container' }
  }
}

/**
 * Create micronix tube container
 */
async function createMicronixTube(
  specimenId: number,
  data: ContainerData
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const collectionId = await resolveCollection(data.collectionName || data.collectionBarcode!, 'micronix_plate')
    if (!collectionId) return { success: false, error: 'Micronix plate not found' }

    const defaultUnitId = await getDefaultUnit('micronix_tube')

    const defaultTotalQty = await getDefaultTotalQuantity('micronix_tube')
    const defaultRemainingQty = await getDefaultRemainingQuantity('micronix_tube')

    const now = new Date().toISOString()
    const [container] = await db.insert(storageContainer).values({
      specimenId,
      unitId: data.unitId || defaultUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
    }).returning()

    await db.insert(micronixTube).values({
      id: container.id,
      collectionId: collectionId,
      barcode: data.barcode!,
      position: data.position || null,
    })

    return { success: true, containerId: container.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create micronix tube' }
  }
}

/**
 * Create cryovial tube container
 */
async function createCryovialTube(
  specimenId: number,
  data: ContainerData
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const collectionId = await resolveCollection(data.collectionName || data.collectionBarcode!, 'cryovial_box')
    if (!collectionId) return { success: false, error: 'Cryovial box not found' }

    const defaultUnitId = await getDefaultUnit('cryovial_tube')

    const defaultTotalQty = await getDefaultTotalQuantity('cryovial_tube')
    const defaultRemainingQty = await getDefaultRemainingQuantity('cryovial_tube')

    const now = new Date().toISOString()
    const [container] = await db.insert(storageContainer).values({
      specimenId,
      unitId: data.unitId || defaultUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
    }).returning()

    await db.insert(cryovialTube).values({
      id: container.id,
      collectionId: collectionId,
      barcode: data.barcode || null,
      position: data.position || null,
    })

    return { success: true, containerId: container.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create cryovial tube' }
  }
}

/**
 * Create generic tube container
 */
async function createGenericTube(
  specimenId: number,
  data: ContainerData
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const collectionId = await resolveCollection(data.collectionName!, 'box')
    if (!collectionId) return { success: false, error: 'Box not found' }

    const defaultUnitId = await getDefaultUnit('tube')

    const defaultTotalQty = await getDefaultTotalQuantity('tube')
    const defaultRemainingQty = await getDefaultRemainingQuantity('tube')

    const now = new Date().toISOString()
    const [container] = await db.insert(storageContainer).values({
      specimenId,
      unitId: data.unitId || defaultUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
    }).returning()

    await db.insert(tube).values({
      id: container.id,
      boxId: collectionId,
      boxPosition: data.position!,
      label: data.label!,
    })

    return { success: true, containerId: container.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create generic tube' }
  }
}

/**
 * Create paper container
 */
async function createPaper(
  specimenId: number,
  data: ContainerData
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    // Resolve sheet
    const sheetRecord = await db.select({ id: sheet.id }).from(sheet).where(eq(sheet.name, data.collectionName!)).get()
    if (!sheetRecord) return { success: false, error: 'Sheet not found' }

    const defaultUnitId = await getDefaultUnit('paper')

    const defaultTotalQty = await getDefaultTotalQuantity('paper')
    const defaultRemainingQty = await getDefaultRemainingQuantity('paper')

    const now = new Date().toISOString()
    const [container] = await db.insert(storageContainer).values({
      specimenId,
      unitId: data.unitId || defaultUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
    }).returning()

    await db.insert(paper).values({
      id: container.id,
      sheetId: sheetRecord.id,
      barcode: data.barcode || null,
      position: data.position || null,
    })

    return { success: true, containerId: container.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create paper' }
  }
}

/**
 * Create static well container
 */
async function createStaticWell(
  specimenId: number,
  data: ContainerData
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  try {
    const collectionId = await resolveCollection(data.collectionName || data.collectionBarcode!, 'micronix_plate')
    if (!collectionId) return { success: false, error: 'Micronix plate not found' }

    const defaultUnitId = await getDefaultUnit('static_well')

    const defaultTotalQty = await getDefaultTotalQuantity('static_well')
    const defaultRemainingQty = await getDefaultRemainingQuantity('static_well')

    const now = new Date().toISOString()
    const [container] = await db.insert(storageContainer).values({
      specimenId,
      unitId: data.unitId || defaultUnitId,
      totalQuantity: data.totalQuantity ?? defaultTotalQty,
      remainingQuantity: data.remainingQuantity ?? data.totalQuantity ?? defaultRemainingQty,
      comment: data.comment,
      created: now,
      lastUpdated: now,
    }).returning()

    await db.insert(staticWell).values({
      id: container.id,
      collectionId: collectionId,
      position: data.position || null,
    })

    return { success: true, containerId: container.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create static well' }
  }
}

/**
 * Main function to create container for specimen
 */
export async function createContainerForSpecimen(
  specimenId: number,
  data: ContainerData
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  const validation = await validateContainerData(data.containerType, data)
  if (!validation.valid) return { success: false, error: validation.error }

  if (data.mode === 'skip') return { success: true }

  if (data.mode === 'link') {
    if (data.containerType === 'micronix_tube' && data.containerBarcode) {
      const container = await db.select({ id: micronixTube.id }).from(micronixTube).where(eq(micronixTube.barcode, data.containerBarcode)).get()
      if (!container) return { success: false, error: `Container with barcode '${data.containerBarcode}' not found` }
      return linkExistingContainer(specimenId, container.id)
    } else if (data.containerId) {
      return linkExistingContainer(specimenId, data.containerId)
    } else {
      return { success: false, error: 'Container identifier required for linking' }
    }
  }

  switch (data.containerType) {
    case 'micronix_tube': return createMicronixTube(specimenId, data)
    case 'cryovial_tube': return createCryovialTube(specimenId, data)
    case 'tube': return createGenericTube(specimenId, data)
    case 'paper': return createPaper(specimenId, data)
    case 'static_well': return createStaticWell(specimenId, data)
    default: return { success: false, error: `Unsupported container type: ${data.containerType}` }
  }
}
