import type { Database } from '../../db/client'
import {
  controlBatch,
  controlDefinition,
  strain,
  unit,
  specimen,
  specimenType,
  storageContainer,
} from '../../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { parseControlProperties } from '../control-properties'
import {
  buildSpecimenSummaryData,
  emptySpecimenCollectionSummary,
  type SpecimenSummaryInput,
  type StorageContainerSummaryRow,
} from '../container-enrichment'
import { NotFoundError } from '../error-handler'

export type BloodControlBatchSummaryResult = {
  batch: Record<string, unknown>
  specimens: Awaited<ReturnType<typeof buildSpecimenSummaryData>>['enrichedSpecimens']
  summary: Awaited<ReturnType<typeof buildSpecimenSummaryData>>['summary']
}

async function loadBloodControlBatchWithDefinition(database: Database, batchId: number) {
  const batchWithDefinition = await database
    .select({
      batch: controlBatch,
      definition: controlDefinition,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .where(and(eq(controlBatch.id, batchId), eq(controlDefinition.controlType, 'blood')))
    .get()

  if (!batchWithDefinition) {
    throw new NotFoundError('Blood control batch', batchId)
  }

  const { batch: batchDataRaw, definition: definitionData } = batchWithDefinition
  const allStrains = await database.select().from(strain)
  const strainMap = new Map(allStrains.map((s) => [s.id, { name: s.name }]))
  const parsedProps = definitionData ? parseControlProperties(definitionData.properties, strainMap) : null

  let unitSymbol = parsedProps?.unitSymbol
  if (parsedProps?.targetDensityUnitId && !unitSymbol) {
    const unitRecord = await database
      .select({ symbol: unit.symbol })
      .from(unit)
      .where(eq(unit.id, parsedProps.targetDensityUnitId))
      .get()
    if (unitRecord) {
      unitSymbol = unitRecord.symbol
    }
  }

  const batchData = {
    ...batchDataRaw,
    definition: definitionData
      ? {
          id: definitionData.id,
          name: definitionData.name,
          controlType: definitionData.controlType,
          targetDensity: parsedProps?.targetDensity,
          targetDensityUnitId: parsedProps?.targetDensityUnitId,
          unitSymbol,
        }
      : undefined,
  }

  const batch = {
    ...batchData,
    composition: parsedProps && parsedProps.strains.length > 0 ? { strains: parsedProps.strains } : null,
  }

  return batch
}

/** Load enriched specimen summary for a blood control batch. */
export async function getBloodControlBatchSummary(
  database: Database,
  batchId: number,
): Promise<BloodControlBatchSummaryResult> {
  const batch = await loadBloodControlBatchWithDefinition(database, batchId)

  const specimensList = await database
    .select({
      id: specimen.id,
      specimenTypeId: specimen.specimenTypeId,
      collectionDate: specimen.collectionDate,
      created: specimen.created,
      lastUpdated: specimen.lastUpdated,
    })
    .from(specimen)
    .where(eq(specimen.controlBatchId, batchId))

  if (specimensList.length === 0) {
    return {
      batch,
      specimens: [],
      summary: emptySpecimenCollectionSummary(),
    }
  }

  const specimenIds = specimensList.map((s) => s.id)
  const specimenTypeIds = [...new Set(specimensList.map((s) => s.specimenTypeId))]
  const specimenTypes = await database
    .select()
    .from(specimenType)
    .where(inArray(specimenType.id, specimenTypeIds))
  const specimenTypeMap = new Map(specimenTypes.map((st) => [st.id, st.name]))

  const containers = await database
    .select({
      id: storageContainer.id,
      specimenId: storageContainer.specimenId,
      totalQuantity: storageContainer.totalQuantity,
      remainingQuantity: storageContainer.remainingQuantity,
      unitSymbol: unit.symbol,
    })
    .from(storageContainer)
    .leftJoin(unit, eq(storageContainer.unitId, unit.id))
    .where(inArray(storageContainer.specimenId, specimenIds))

  const { enrichedSpecimens, summary } = await buildSpecimenSummaryData(
    database,
    specimensList as SpecimenSummaryInput[],
    containers as StorageContainerSummaryRow[],
    specimenTypeMap,
    { defaultUnit: 'units', includeInventory: true },
  )

  return { batch, specimens: enrichedSpecimens, summary }
}
