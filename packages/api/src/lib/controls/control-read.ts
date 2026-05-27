import type { Database } from '../../db/client'
import {
  controlBatch,
  controlDefinition,
  strain,
  specimen,
} from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { parseControlProperties } from '../control-properties'
import { NotFoundError } from '../error-handler'
import {
  buildControlInventoryCountSubqueries,
  controlInventoryCountSelectFields,
  type BatchGroupedSubqueries,
  type DefinitionGroupedSubqueries,
} from './control-inventory-counts'

const BLOOD_CONTROL_TYPE = 'blood' as const
const LIST_COUNT_SCOPE = 'all' as const

function joinBatchInventoryCounts(
  query: { leftJoin: (...args: any[]) => any },
  inventoryCounts: BatchGroupedSubqueries,
) {
  return query
    .leftJoin(inventoryCounts.specimenCounts, eq(controlBatch.id, inventoryCounts.specimenCounts.batchId))
    .leftJoin(inventoryCounts.spotCounts, eq(controlBatch.id, inventoryCounts.spotCounts.batchId))
    .leftJoin(inventoryCounts.micronixCounts, eq(controlBatch.id, inventoryCounts.micronixCounts.batchId))
    .leftJoin(inventoryCounts.cryovialCounts, eq(controlBatch.id, inventoryCounts.cryovialCounts.batchId))
    .leftJoin(inventoryCounts.staticWellCounts, eq(controlBatch.id, inventoryCounts.staticWellCounts.batchId))
    .leftJoin(inventoryCounts.tubeCounts, eq(controlBatch.id, inventoryCounts.tubeCounts.batchId))
}

function joinDefinitionInventoryCounts(
  query: { leftJoin: (...args: any[]) => any },
  inventoryCounts: DefinitionGroupedSubqueries,
) {
  return query
    .leftJoin(
      inventoryCounts.specimenCounts,
      eq(controlDefinition.id, inventoryCounts.specimenCounts.definitionId),
    )
    .leftJoin(inventoryCounts.spotCounts, eq(controlDefinition.id, inventoryCounts.spotCounts.definitionId))
    .leftJoin(
      inventoryCounts.micronixCounts,
      eq(controlDefinition.id, inventoryCounts.micronixCounts.definitionId),
    )
    .leftJoin(
      inventoryCounts.cryovialCounts,
      eq(controlDefinition.id, inventoryCounts.cryovialCounts.definitionId),
    )
    .leftJoin(
      inventoryCounts.staticWellCounts,
      eq(controlDefinition.id, inventoryCounts.staticWellCounts.definitionId),
    )
    .leftJoin(inventoryCounts.tubeCounts, eq(controlDefinition.id, inventoryCounts.tubeCounts.definitionId))
}

/** List blood control batches with inventory counts. */
export async function listBloodControlBatches(database: Database) {
  const inventoryCounts = buildControlInventoryCountSubqueries(database, {
    groupBy: 'batch',
    countScope: LIST_COUNT_SCOPE,
  }) as BatchGroupedSubqueries
  const countFields = controlInventoryCountSelectFields(inventoryCounts)

  const batchesResults = await joinBatchInventoryCounts(
    database
      .select({
        id: controlBatch.id,
        controlDefinitionId: controlBatch.controlDefinitionId,
        name: controlBatch.name,
        productionDate: controlBatch.productionDate,
        created: controlBatch.created,
        lastUpdated: controlBatch.lastUpdated,
        definitionName: controlDefinition.name,
        controlType: controlDefinition.controlType,
        properties: controlDefinition.properties,
        ...countFields,
      })
      .from(controlBatch)
      .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id)),
    inventoryCounts,
  )
    .where(eq(controlDefinition.controlType, BLOOD_CONTROL_TYPE))
    .orderBy(desc(controlBatch.created))

  const batches = batchesResults.map((row: (typeof batchesResults)[number]) => {
    const props = row.properties as Record<string, unknown> | null
    const strains = (props?.strains as unknown[]) || []
    return {
      ...row,
      strains: strains.map((s) => (typeof s === 'number' ? { id: s } : s)),
      targetDensity: props?.targetDensity,
      unitSymbol:
        (props?.targetDensityUnit as { symbol?: string } | undefined)?.symbol ||
        props?.targetDensityUnitSymbol,
    }
  })

  return { batches }
}

/** List blood control definitions with inventory counts. */
export async function listBloodControlDefinitions(database: Database) {
  const batchCountSubquery = database
    .select({
      definitionId: controlBatch.controlDefinitionId,
      count: sql<number>`count(*)`.as('batch_count'),
    })
    .from(controlBatch)
    .groupBy(controlBatch.controlDefinitionId)
    .as('batch_counts')

  const inventoryCounts = buildControlInventoryCountSubqueries(database, {
    groupBy: 'definition',
    countScope: LIST_COUNT_SCOPE,
  }) as DefinitionGroupedSubqueries
  const countFields = controlInventoryCountSelectFields(inventoryCounts)

  const allStrains = await database.select().from(strain)
  const strainMap = new Map(allStrains.map((s) => [s.id, { name: s.name }]))

  const results = await joinDefinitionInventoryCounts(
    database
      .select({
        id: controlDefinition.id,
        name: controlDefinition.name,
        controlType: controlDefinition.controlType,
        properties: controlDefinition.properties,
        created: controlDefinition.created,
        lastUpdated: controlDefinition.lastUpdated,
        batchCount: sql<number>`COALESCE(${batchCountSubquery.count}, 0)`,
        ...countFields,
      })
      .from(controlDefinition)
      .leftJoin(batchCountSubquery, eq(controlDefinition.id, batchCountSubquery.definitionId)),
    inventoryCounts,
  ).where(eq(controlDefinition.controlType, BLOOD_CONTROL_TYPE))

  const controls = results.map((row: (typeof results)[number]) => {
    const parsed = parseControlProperties(row.properties, strainMap)
    return {
      ...row,
      strains: parsed.strains,
      targetDensity: parsed.targetDensity,
      targetDensityUnitId: parsed.targetDensityUnitId,
      unitSymbol: parsed.unitSymbol,
    }
  })

  return { controls }
}

/** Load a single blood control batch by id. */
export async function getBloodControlBatch(database: Database, batchId: number) {
  const result = await database
    .select({
      batch: controlBatch,
      definition: controlDefinition,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .where(and(eq(controlBatch.id, batchId), eq(controlDefinition.controlType, BLOOD_CONTROL_TYPE)))
    .get()

  if (!result) {
    throw new NotFoundError('Blood control batch', batchId)
  }

  return { batch: result.batch }
}

/** Load a single blood control definition by id. */
export async function getBloodControlDefinition(database: Database, definitionId: number) {
  const control = await database
    .select()
    .from(controlDefinition)
    .where(and(eq(controlDefinition.id, definitionId), eq(controlDefinition.controlType, BLOOD_CONTROL_TYPE)))
    .get()

  if (!control) {
    throw new NotFoundError('Blood control', definitionId)
  }

  return { control }
}

/** List batches for a blood control definition. */
export async function listBatchesForBloodControlDefinition(
  database: Database,
  definitionId: number,
) {
  const definition = await database
    .select()
    .from(controlDefinition)
    .where(and(eq(controlDefinition.id, definitionId), eq(controlDefinition.controlType, BLOOD_CONTROL_TYPE)))
    .get()

  if (!definition) {
    throw new NotFoundError('Blood control definition', definitionId)
  }

  const batches = await database
    .select()
    .from(controlBatch)
    .where(eq(controlBatch.controlDefinitionId, definitionId))
    .orderBy(desc(controlBatch.productionDate))

  return { batches }
}
