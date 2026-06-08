import type { ContainerWriteInput } from '@sampledb/contract'
import type { Database } from '../../db/client'
import {
  controlBatch,
  controlDefinition,
  specimen,
  specimenType,
  unit,
} from '../../db/schema'
import { eq } from 'drizzle-orm'
import { getDefaultUnit } from '../defaults'
import {
  validateContainerTypeForSpecimenType,
  validateUnitForContainerType,
  validateControlBatchName,
  generateUniqueBatchName,
} from '../validation'
import { findExistingControlSpecimen } from '../specimen-helpers'
import { utcNow } from '../datetime'
import {
  createContainerForSpecimen,
  type ContainerData,
  type ContainerType,
} from '../container-creation'
import { resolveContainerPlacement } from '../container-write-placement'
import type { BatchContainerInput } from './batch-schemas'

export interface CreateBatchWithSpecimensRequest {
  batch: {
    controlDefinitionId: number
    name: string
    productionDate?: string
    properties?: Record<string, unknown>
  }
  specimens: Array<{
    specimenTypeName: string
    collectionDate?: string
    containers: BatchContainerInput[]
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

async function getUnitIdBySymbol(
  database: Database,
  symbol: string,
  containerType: ContainerType
): Promise<number> {
  const unitRecord = await database.select().from(unit).where(eq(unit.symbol, symbol)).get()
  if (unitRecord) return unitRecord.id as number
  return getDefaultUnit(database, containerType)
}

async function prepareBatchContainer(
  database: Database,
  specimenTypeId: number,
  input: BatchContainerInput,
  collectionMap: Map<string, number>
): Promise<ContainerData> {
  const containerTypeValidation = await validateContainerTypeForSpecimenType(
    database,
    specimenTypeId,
    input.containerType
  )
  if (!containerTypeValidation.valid) {
    throw new Error(containerTypeValidation.error || 'Container type validation failed')
  }

  const { quantity, unitSymbol, ...writeInput } = input
  const placement = await resolveContainerPlacement(
    database,
    writeInput as ContainerWriteInput,
    collectionMap
  )

  let unitId: number | undefined
  if (unitSymbol) {
    unitId = await getUnitIdBySymbol(database, unitSymbol, placement.containerType)
    const unitValidation = await validateUnitForContainerType(database, placement.containerType, unitId)
    if (!unitValidation.valid) {
      throw new Error(unitValidation.error || 'Unit validation failed')
    }
  }

  return {
    ...placement,
    ...(unitId != null ? { unitId } : {}),
    ...(quantity != null ? { totalQuantity: quantity, remainingQuantity: quantity } : {}),
  }
}

function extractId(record: { id: unknown }): number {
  if (typeof record.id === 'number') return record.id
  if (typeof record.id === 'object' && record.id !== null) {
    const idObj = record.id as { value?: number }
    if (typeof idObj.value === 'number') return idObj.value
  }
  throw new Error(`Failed to extract numeric id from record: ${String(record.id)}`)
}

function mergeSpecimensByTypeAndDate<T extends { specimenTypeName: string; collectionDate?: string; containers: BatchContainerInput[] }>(
  specimens: T[]
): T[] {
  const specKey = (s: { specimenTypeName: string; collectionDate?: string }) =>
    `${s.specimenTypeName}:${s.collectionDate ?? ''}`
  const merged = new Map<string, T>()
  for (const s of specimens) {
    const key = specKey(s)
    const existing = merged.get(key)
    if (existing) {
      existing.containers.push(...s.containers)
    } else {
      merged.set(key, { ...s, containers: [...s.containers] })
    }
  }
  return Array.from(merged.values())
}

async function prepareSpecimensForBatch(
  database: Database,
  specimens: CreateBatchWithSpecimensRequest['specimens'],
  collectionMap: Map<string, number>
) {
  const specimensToCreate = mergeSpecimensByTypeAndDate(specimens)
  const preparedSpecimens: Array<{
    specType: { id: number; name: string }
    specData: (typeof specimensToCreate)[number]
    preparedContainers: ContainerData[]
  }> = []

  for (const specData of specimensToCreate) {
    const specType = await database
      .select()
      .from(specimenType)
      .where(eq(specimenType.name, specData.specimenTypeName))
      .get()

    if (!specType) {
      throw new Error(`Specimen type not found: ${specData.specimenTypeName}`)
    }

    const preparedContainers: ContainerData[] = []
    for (const containerInput of specData.containers) {
      try {
        preparedContainers.push(
          await prepareBatchContainer(database, specType.id, containerInput, collectionMap)
        )
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to prepare container: ${message}`)
      }
    }

    preparedSpecimens.push({
      specType: { id: specType.id, name: specType.name },
      specData,
      preparedContainers,
    })
  }

  return preparedSpecimens
}

/**
 * Create batch with specimens and containers
 */
export async function createBatchWithSpecimens(
  database: Database,
  data: CreateBatchWithSpecimensRequest
): Promise<{
  batch: {
    id: number
    controlDefinitionId: number
    name: string
    productionDate: string | null
    properties: string | null
    created: string
    lastUpdated: string
  }
  specimens: CreatedSpecimen[]
  createdCollections: CreatedCollection[]
}> {
  const collectionMap = new Map<string, number>()

  const definition = await database
    .select()
    .from(controlDefinition)
    .where(eq(controlDefinition.id, data.batch.controlDefinitionId))
    .get()

  if (!definition) {
    throw new Error(`Control definition with ID ${data.batch.controlDefinitionId} not found`)
  }

  let batchName: string
  if (data.batch.name) {
    const nameValidation = await validateControlBatchName(database, data.batch.name)
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error || 'Batch name must be unique')
    }
    batchName = data.batch.name
  } else {
    batchName = await generateUniqueBatchName(database, definition.name, data.batch.productionDate)
  }

  const preparedSpecimens = await prepareSpecimensForBatch(database, data.specimens, collectionMap)

  return database.transaction(async (tx) => {
    const batchResult = await tx
      .insert(controlBatch)
      .values({
        controlDefinitionId: data.batch.controlDefinitionId,
        name: batchName,
        productionDate: data.batch.productionDate || null,
        properties: data.batch.properties ? JSON.stringify(data.batch.properties) : null,
      })
      .returning()

    const batchRecord = batchResult[0]
    if (!batchRecord) {
      throw new Error('Failed to create batch - no record returned')
    }
    const batchId = extractId(batchRecord)

    const createdSpecimens: CreatedSpecimen[] = []

    for (const { specType, specData, preparedContainers } of preparedSpecimens) {
      const specimenResult = await tx
        .insert(specimen)
        .values({
          controlBatchId: batchId,
          specimenTypeId: specType.id,
          collectionDate: specData.collectionDate || null,
        })
        .returning()

      const specimenRecord = specimenResult[0]
      if (!specimenRecord) {
        throw new Error('Failed to create specimen - no record returned')
      }
      const specimenId = extractId(specimenRecord)

      const containerIds: number[] = []
      for (const containerData of preparedContainers) {
        const containerResult = await createContainerForSpecimen(specimenId, containerData, tx, {
          collectionMap,
          skipValidation: true,
        })
        if (!containerResult.success || containerResult.containerId == null) {
          throw new Error(containerResult.error || 'Failed to create container')
        }
        containerIds.push(containerResult.containerId)
      }

      createdSpecimens.push({
        id: specimenId,
        specimenTypeName: specData.specimenTypeName,
        containerCount: containerIds.length,
        containerIds,
      })
    }

    return {
      batch: {
        id: batchId,
        controlDefinitionId: batchRecord.controlDefinitionId,
        name: batchRecord.name,
        productionDate: batchRecord.productionDate,
        properties: (batchRecord.properties as string | null) ?? null,
        created: batchRecord.created,
        lastUpdated: batchRecord.lastUpdated,
      },
      specimens: createdSpecimens,
      createdCollections: [],
    }
  })
}

/**
 * Add specimens to existing batch
 */
export async function addSpecimensToBatch(
  database: Database,
  batchId: number,
  data: Omit<CreateBatchWithSpecimensRequest, 'batch'>
): Promise<{
  specimens: CreatedSpecimen[]
  createdCollections: CreatedCollection[]
}> {
  const existingBatch = await database
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.id, batchId))
    .get()

  if (!existingBatch) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const collectionMap = new Map<string, number>()
  const preparedSpecimens = await prepareSpecimensForBatch(database, data.specimens, collectionMap)

  return database.transaction(async (tx) => {
    const createdSpecimens: CreatedSpecimen[] = []

    for (const { specType, specData, preparedContainers } of preparedSpecimens) {
      const existingSpecimen = findExistingControlSpecimen(
        tx as unknown as Database,
        batchId,
        specType.id,
        specData.collectionDate
      )

      let specimenId: number
      if (existingSpecimen) {
        specimenId = existingSpecimen.id
      } else {
        const specimenResult = await tx
          .insert(specimen)
          .values({
            controlBatchId: batchId,
            specimenTypeId: specType.id,
            collectionDate: specData.collectionDate || null,
          })
          .returning()

        const specimenRecord = specimenResult[0]
        if (!specimenRecord) {
          throw new Error('Failed to create specimen - no record returned')
        }
        specimenId = extractId(specimenRecord)
      }

      const containerIds: number[] = []
      for (const containerData of preparedContainers) {
        const containerResult = await createContainerForSpecimen(specimenId, containerData, tx, {
          collectionMap,
          skipValidation: true,
        })
        if (!containerResult.success || containerResult.containerId == null) {
          throw new Error(containerResult.error || 'Failed to create container')
        }
        containerIds.push(containerResult.containerId)
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
      createdCollections: [],
    }
  })
}
