import type { Database } from '../../db/client'
import {
  controlBatch,
  controlDefinition,
  strain,
  unit,
  specimen,
  storageContainer,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  sheet,
  paper,
  location,
} from '../../db/schema'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { parseControlProperties } from '../control-properties'
import { NotFoundError } from '../error-handler'
import {
  buildControlInventoryCountSubqueries,
  controlInventoryCountSelectFields,
} from './control-inventory-counts'

export type BloodControlDefinitionSummaryResult = {
  control: Record<string, unknown>
  composition: { strains: unknown[] } | null
  batches: Array<Record<string, unknown>>
  stats: {
    totalBatches: number
    totalContainers: number
    totalSpots: number
    totalMicronix: number
    totalCryovial: number
    totalStaticWells: number
    totalTubes: number
    totalSpecimens: number
    inStockBatchesCount: number
    latestBatchDate: string | null
    activeLocationsCount: number
  }
}

/** Load blood control definition summary with batch stock levels and aggregate stats. */
export async function getBloodControlDefinitionSummary(
  database: Database,
  definitionId: number,
): Promise<BloodControlDefinitionSummaryResult> {
  const control = await database
    .select({
      id: controlDefinition.id,
      name: controlDefinition.name,
      controlType: controlDefinition.controlType,
      properties: controlDefinition.properties,
      created: controlDefinition.created,
    })
    .from(controlDefinition)
    .where(and(eq(controlDefinition.id, definitionId), eq(controlDefinition.controlType, 'blood')))
    .get()

  if (!control) {
    throw new NotFoundError('Blood control', definitionId)
  }

  const allStrains = await database.select().from(strain)
  const strainMap = new Map(allStrains.map((s) => [s.id, { name: s.name }]))
  const parsed = parseControlProperties(control.properties, strainMap)

  let unitSymbol = parsed.unitSymbol
  if (parsed.targetDensityUnitId && !unitSymbol) {
    const unitRecord = await database
      .select({ symbol: unit.symbol })
      .from(unit)
      .where(eq(unit.id, parsed.targetDensityUnitId))
      .get()
    if (unitRecord) {
      unitSymbol = unitRecord.symbol
    }
  }

  const controlWithParsed = {
    ...control,
    targetDensity: parsed.targetDensity,
    unitSymbol,
  }
  const compositionDetails = parsed.strains.length > 0 ? { strains: parsed.strains } : null

  const inventoryCounts = buildControlInventoryCountSubqueries(database, {
    groupBy: 'batch',
    countScope: 'in_stock',
  })
  const {
    spotCount,
    micronixCount,
    cryovialCount,
    staticWellCount,
    tubeCount,
    inventoryTotal,
  } = controlInventoryCountSelectFields(inventoryCounts)

  const batchesList = await database
    .select({
      id: controlBatch.id,
      name: controlBatch.name,
      productionDate: controlBatch.productionDate,
      created: controlBatch.created,
      spotCount,
      micronixCount,
      cryovialCount,
      staticWellCount,
      tubeCount,
      inventoryTotal,
    })
    .from(controlBatch)
    .leftJoin(inventoryCounts.spotCounts, eq(controlBatch.id, inventoryCounts.spotCounts.batchId))
    .leftJoin(inventoryCounts.micronixCounts, eq(controlBatch.id, inventoryCounts.micronixCounts.batchId))
    .leftJoin(inventoryCounts.cryovialCounts, eq(controlBatch.id, inventoryCounts.cryovialCounts.batchId))
    .leftJoin(inventoryCounts.staticWellCounts, eq(controlBatch.id, inventoryCounts.staticWellCounts.batchId))
    .leftJoin(inventoryCounts.tubeCounts, eq(controlBatch.id, inventoryCounts.tubeCounts.batchId))
    .where(eq(controlBatch.controlDefinitionId, definitionId))
    .orderBy(desc(controlBatch.productionDate))

  const enrichedBatches = await Promise.all(
    batchesList.map(async (batch) => {
      const specimensCount = await database
        .select({ count: sql<number>`count(*)` })
        .from(specimen)
        .where(eq(specimen.controlBatchId, batch.id))
        .get()

      if (!specimensCount) {
        throw new Error('Failed to get specimen count for batch')
      }

      const inventory = await database
        .select({
          totalRemaining: sql<number>`sum(${storageContainer.remainingQuantity})`,
          unitSymbol: unit.symbol,
        })
        .from(storageContainer)
        .leftJoin(specimen, eq(storageContainer.specimenId, specimen.id))
        .leftJoin(unit, eq(storageContainer.unitId, unit.id))
        .where(eq(specimen.controlBatchId, batch.id))
        .groupBy(unit.id)

      return {
        ...batch,
        specimenCount: specimensCount.count,
        inventory,
      }
    }),
  )

  const totalSpots = enrichedBatches.reduce((sum, b) => sum + (b.spotCount || 0), 0)
  const totalMicronix = enrichedBatches.reduce((sum, b) => sum + (b.micronixCount || 0), 0)
  const totalCryovial = enrichedBatches.reduce((sum, b) => sum + (b.cryovialCount || 0), 0)
  const totalStaticWells = enrichedBatches.reduce((sum, b) => sum + (b.staticWellCount || 0), 0)
  const totalTubes = enrichedBatches.reduce((sum, b) => sum + (b.tubeCount || 0), 0)
  const totalSpecimens = enrichedBatches.reduce((sum, b) => sum + (b.specimenCount || 0), 0)
  const inStockBatchesCount = enrichedBatches.filter((b) => (b.inventoryTotal || 0) > 0).length

  const latestBatch =
    enrichedBatches.length > 0
      ? enrichedBatches.reduce((latest, current) => {
          if (!latest.productionDate) return current
          if (!current.productionDate) return latest
          return new Date(current.productionDate) > new Date(latest.productionDate) ? current : latest
        })
      : null

  const batchIds = enrichedBatches.map((b) => b.id)
  let activeLocationsCount = 0
  if (batchIds.length > 0) {
    const locationResults = await database
      .select({ locationId: location.id })
      .from(location)
      .innerJoin(micronixPlate, eq(location.id, micronixPlate.locationId))
      .innerJoin(micronixTube, eq(micronixPlate.id, micronixTube.collectionId))
      .innerJoin(storageContainer, eq(micronixTube.id, storageContainer.id))
      .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
      .where(inArray(specimen.controlBatchId, batchIds))
      .union(
        database
          .select({ locationId: location.id })
          .from(location)
          .innerJoin(cryovialBox, eq(location.id, cryovialBox.locationId))
          .innerJoin(cryovialTube, eq(cryovialBox.id, cryovialTube.collectionId))
          .innerJoin(storageContainer, eq(cryovialTube.id, storageContainer.id))
          .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
          .where(inArray(specimen.controlBatchId, batchIds)),
      )
      .union(
        database
          .select({ locationId: location.id })
          .from(location)
          .innerJoin(box, eq(location.id, box.locationId))
          .innerJoin(sheet, eq(box.id, sheet.boxId))
          .innerJoin(paper, eq(sheet.id, paper.sheetId))
          .innerJoin(storageContainer, eq(paper.id, storageContainer.id))
          .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
          .where(inArray(specimen.controlBatchId, batchIds)),
      )
      .union(
        database
          .select({ locationId: location.id })
          .from(location)
          .innerJoin(bag, eq(location.id, bag.locationId))
          .innerJoin(sheet, eq(bag.id, sheet.bagId))
          .innerJoin(paper, eq(sheet.id, paper.sheetId))
          .innerJoin(storageContainer, eq(paper.id, storageContainer.id))
          .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
          .where(inArray(specimen.controlBatchId, batchIds)),
      )

    activeLocationsCount = locationResults.length
  }

  return {
    control: controlWithParsed,
    composition: compositionDetails,
    batches: enrichedBatches,
    stats: {
      totalBatches: enrichedBatches.length,
      totalContainers: totalSpots + totalTubes,
      totalSpots,
      totalMicronix,
      totalCryovial,
      totalStaticWells,
      totalTubes,
      totalSpecimens,
      inStockBatchesCount,
      latestBatchDate: latestBatch?.productionDate || null,
      activeLocationsCount,
    },
  }
}
