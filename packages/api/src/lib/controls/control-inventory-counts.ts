import type { Database } from '../../db/client'
import {
  controlBatch,
  specimen,
  storageContainer,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../../db/schema'
import { eq, sql, type SQL } from 'drizzle-orm'

export type ControlInventoryCountGroupBy = 'batch' | 'definition'
export type ControlInventoryCountScope = 'all' | 'in_stock'

export type BuildControlInventoryCountSubqueriesOptions = {
  groupBy: ControlInventoryCountGroupBy
  countScope: ControlInventoryCountScope
}

const TUBE_TYPE_EXISTS = sql`EXISTS (SELECT 1 FROM micronix_tube WHERE micronix_tube.id = ${storageContainer.id}) OR 
    EXISTS (SELECT 1 FROM cryovial_tube WHERE cryovial_tube.id = ${storageContainer.id}) OR
    EXISTS (SELECT 1 FROM static_well WHERE static_well.id = ${storageContainer.id})`

function tubeStockFilter(countScope: ControlInventoryCountScope): SQL | undefined {
  if (countScope === 'in_stock') {
    return sql`${storageContainer.remainingQuantity} > 0`
  }
  return undefined
}

function tubeCountWhere(countScope: ControlInventoryCountScope): SQL {
  if (countScope === 'in_stock') {
    return sql`(${TUBE_TYPE_EXISTS}) AND ${storageContainer.remainingQuantity} > 0`
  }
  return TUBE_TYPE_EXISTS
}

export type BatchGroupedSubqueries = {
  groupBy: 'batch'
  groupKey: 'batchId'
  spotCounts: ReturnType<typeof buildBatchSpotCountSubquery>
  micronixCounts: ReturnType<typeof buildBatchMicronixCountSubquery>
  cryovialCounts: ReturnType<typeof buildBatchCryovialCountSubquery>
  staticWellCounts: ReturnType<typeof buildBatchStaticWellCountSubquery>
  tubeCounts: ReturnType<typeof buildBatchTubeCountSubquery>
  specimenCounts: ReturnType<typeof buildBatchSpecimenCountSubquery>
}

export type DefinitionGroupedSubqueries = {
  groupBy: 'definition'
  groupKey: 'definitionId'
  spotCounts: ReturnType<typeof buildDefinitionSpotCountSubquery>
  micronixCounts: ReturnType<typeof buildDefinitionMicronixCountSubquery>
  cryovialCounts: ReturnType<typeof buildDefinitionCryovialCountSubquery>
  staticWellCounts: ReturnType<typeof buildDefinitionStaticWellCountSubquery>
  tubeCounts: ReturnType<typeof buildDefinitionTubeCountSubquery>
  specimenCounts: ReturnType<typeof buildDefinitionSpecimenCountSubquery>
}

export type ControlInventoryCountSubqueries = BatchGroupedSubqueries | DefinitionGroupedSubqueries

function buildBatchSpotCountSubquery(database: Database) {
  return database
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`SUM(${storageContainer.remainingQuantity})`.as('spot_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(paper, eq(storageContainer.id, paper.id))
    .groupBy(specimen.controlBatchId)
    .as('control_spot_counts')
}

function buildBatchMicronixCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  const stockFilter = tubeStockFilter(countScope)
  return database
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('micronix_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(micronixTube, eq(storageContainer.id, micronixTube.id))
    .where(stockFilter)
    .groupBy(specimen.controlBatchId)
    .as('control_micronix_counts')
}

function buildBatchCryovialCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  const stockFilter = tubeStockFilter(countScope)
  return database
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('cryovial_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(cryovialTube, eq(storageContainer.id, cryovialTube.id))
    .where(stockFilter)
    .groupBy(specimen.controlBatchId)
    .as('control_cryovial_counts')
}

function buildBatchStaticWellCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  const stockFilter = tubeStockFilter(countScope)
  return database
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('static_well_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(staticWell, eq(storageContainer.id, staticWell.id))
    .where(stockFilter)
    .groupBy(specimen.controlBatchId)
    .as('control_static_well_counts')
}

function buildBatchTubeCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  return database
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('tube_count'),
    })
    .from(specimen)
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .where(tubeCountWhere(countScope))
    .groupBy(specimen.controlBatchId)
    .as('control_tube_counts')
}

function buildBatchSpecimenCountSubquery(database: Database) {
  return database
    .select({
      batchId: specimen.controlBatchId,
      count: sql<number>`count(*)`.as('specimen_count'),
    })
    .from(specimen)
    .groupBy(specimen.controlBatchId)
    .as('control_specimen_counts')
}

function buildDefinitionSpotCountSubquery(database: Database) {
  return database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`SUM(${storageContainer.remainingQuantity})`.as('spot_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(paper, eq(storageContainer.id, paper.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('control_spot_counts')
}

function buildDefinitionMicronixCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  const stockFilter = tubeStockFilter(countScope)
  return database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('micronix_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(micronixTube, eq(storageContainer.id, micronixTube.id))
    .where(stockFilter)
    .groupBy(controlBatch.controlDefinitionId)
    .as('control_micronix_counts')
}

function buildDefinitionCryovialCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  const stockFilter = tubeStockFilter(countScope)
  return database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('cryovial_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(cryovialTube, eq(storageContainer.id, cryovialTube.id))
    .where(stockFilter)
    .groupBy(controlBatch.controlDefinitionId)
    .as('control_cryovial_counts')
}

function buildDefinitionStaticWellCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  const stockFilter = tubeStockFilter(countScope)
  return database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('static_well_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .innerJoin(staticWell, eq(storageContainer.id, staticWell.id))
    .where(stockFilter)
    .groupBy(controlBatch.controlDefinitionId)
    .as('control_static_well_counts')
}

function buildDefinitionTubeCountSubquery(database: Database, countScope: ControlInventoryCountScope) {
  return database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('tube_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .innerJoin(storageContainer, eq(specimen.id, storageContainer.specimenId))
    .where(tubeCountWhere(countScope))
    .groupBy(controlBatch.controlDefinitionId)
    .as('control_tube_counts')
}

function buildDefinitionSpecimenCountSubquery(database: Database) {
  return database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('specimen_count'),
    })
    .from(specimen)
    .innerJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    .groupBy(controlBatch.controlDefinitionId)
    .as('control_specimen_counts')
}

/** Build grouped container-count subqueries for control inventory reads. */
export function buildControlInventoryCountSubqueries(
  database: Database,
  options: BuildControlInventoryCountSubqueriesOptions,
): ControlInventoryCountSubqueries {
  const { groupBy, countScope } = options

  if (groupBy === 'batch') {
    return {
      groupBy: 'batch',
      groupKey: 'batchId',
      spotCounts: buildBatchSpotCountSubquery(database),
      micronixCounts: buildBatchMicronixCountSubquery(database, countScope),
      cryovialCounts: buildBatchCryovialCountSubquery(database, countScope),
      staticWellCounts: buildBatchStaticWellCountSubquery(database, countScope),
      tubeCounts: buildBatchTubeCountSubquery(database, countScope),
      specimenCounts: buildBatchSpecimenCountSubquery(database),
    }
  }

  return {
    groupBy: 'definition',
    groupKey: 'definitionId',
    spotCounts: buildDefinitionSpotCountSubquery(database),
    micronixCounts: buildDefinitionMicronixCountSubquery(database, countScope),
    cryovialCounts: buildDefinitionCryovialCountSubquery(database, countScope),
    staticWellCounts: buildDefinitionStaticWellCountSubquery(database, countScope),
    tubeCounts: buildDefinitionTubeCountSubquery(database, countScope),
    specimenCounts: buildDefinitionSpecimenCountSubquery(database),
  }
}

/** COALESCE-wrapped count columns for joining inventory subqueries onto a list query. */
export function controlInventoryCountSelectFields(subqueries: ControlInventoryCountSubqueries) {
  return {
    specimenCount: sql<number>`COALESCE(${subqueries.specimenCounts.count}, 0)`,
    spotCount: sql<number>`COALESCE(${subqueries.spotCounts.count}, 0)`,
    micronixCount: sql<number>`COALESCE(${subqueries.micronixCounts.count}, 0)`,
    cryovialCount: sql<number>`COALESCE(${subqueries.cryovialCounts.count}, 0)`,
    staticWellCount: sql<number>`COALESCE(${subqueries.staticWellCounts.count}, 0)`,
    tubeCount: sql<number>`COALESCE(${subqueries.tubeCounts.count}, 0)`,
    inventoryTotal: sql<number>`COALESCE(${subqueries.spotCounts.count}, 0) + COALESCE(${subqueries.tubeCounts.count}, 0)`,
  }
}
