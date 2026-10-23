import { count, gte, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import {
  bag,
  box,
  cryovialBox,
  cryovialTube,
  location,
  micronixPlate,
  micronixTube,
  paper,
  sheet,
  specimen,
  staticWell,
  storageContainer,
  storageContainerTag,
} from '../../db/schema'
import type { ContainerSubtype } from '../container-placement'
import { dateToUpperBound } from '../sql-helpers'
import type { ContainerSelectionFilters, DateRange, SpecimenSourceType } from './types'

/**
 * A Container's type, from the subtype table holding it, in the precedence
 * `resolveContainerPlacements` uses. 'unknown' when no subtype table holds it.
 */
export const containerTypeSql = sql<ContainerSubtype>`CASE
  WHEN EXISTS (SELECT 1 FROM ${micronixTube} WHERE ${micronixTube.id} = ${storageContainer.id}) THEN 'micronix_tube'
  WHEN EXISTS (SELECT 1 FROM ${cryovialTube} WHERE ${cryovialTube.id} = ${storageContainer.id}) THEN 'cryovial_tube'
  WHEN EXISTS (SELECT 1 FROM ${paper} WHERE ${paper.id} = ${storageContainer.id}) THEN 'paper'
  WHEN EXISTS (SELECT 1 FROM ${staticWell} WHERE ${staticWell.id} = ${storageContainer.id}) THEN 'static_well'
  ELSE 'unknown'
END`

/** Conditions for an inclusive date range on a date or timestamp column. */
export function dateRangeConditions(column: SQLiteColumn, range: DateRange | undefined): SQL[] {
  return [
    ...(range?.from ? [gte(column, range.from)] : []),
    ...(range?.to ? [dateToUpperBound(column, range.to)] : []),
  ]
}

/** Specimens of the given source type; undefined, every Specimen. */
export function sourceTypeCondition(sourceType: SpecimenSourceType | undefined): SQL | undefined {
  if (sourceType === undefined) return undefined
  const sources: Record<SpecimenSourceType, SQL> = {
    subject: isNotNull(specimen.studySubjectId),
    control: isNotNull(specimen.controlBatchId),
  }
  return sources[sourceType]
}

/**
 * Conditions on the Specimen row other than its collection date, which depends on the
 * selection: specimen types and Specimen created.
 */
export function specimenFilterConditions(filters: ContainerSelectionFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.specimenTypeIds && filters.specimenTypeIds.length > 0) {
    conditions.push(inArray(specimen.specimenTypeId, [...new Set(filters.specimenTypeIds)]))
  }
  conditions.push(...dateRangeConditions(specimen.created, filters.specimenCreated))
  return conditions
}

/**
 * Container-level filters: Container created, container types, Tags and Location. With any
 * of them set, only Specimens with a matching Container are selected.
 */
export function containerFilterConditions(filters: ContainerSelectionFilters): SQL[] {
  const conditions = [...dateRangeConditions(storageContainer.created, filters.containerCreated)]
  if (filters.containerTypes) {
    conditions.push(
      filters.containerTypes.length > 0 ? inArray(containerTypeSql, [...new Set(filters.containerTypes)]) : sql`0`,
    )
  }
  const tags = containerHasAllTags(filters.tagIds ?? [])
  if (tags) conditions.push(tags)
  if (filters.locationId !== undefined) conditions.push(containerAtLocation(filters.locationId))
  return conditions
}

/**
 * Whether any Container-level filter is set: Container created, container types, Tags or
 * Location. With one set, the selection keeps only Specimens with a matching Container.
 */
export function hasContainerLevelFilter(filters: ContainerSelectionFilters): boolean {
  return containerFilterConditions(filters).length > 0
}

/**
 * Containers stored in a Location or any Location under it: tubes and static wells on
 * micronix plates, tubes in cryovial boxes, and papers on sheets in boxes or bags there.
 */
function containerAtLocation(locationId: number): SQL {
  const here = sql`SELECT id FROM selected_location`
  return sql`${storageContainer.id} IN (
    WITH RECURSIVE selected_location(id) AS (
      SELECT ${location.id} FROM ${location} WHERE ${location.id} = ${locationId}
      UNION
      SELECT child.id FROM ${location} AS child JOIN selected_location ON child.parent_id = selected_location.id
    )
    SELECT ${micronixTube.id} FROM ${micronixTube}
      JOIN ${micronixPlate} ON ${micronixPlate.id} = ${micronixTube.collectionId}
      WHERE ${micronixPlate.locationId} IN (${here})
    UNION ALL
    SELECT ${staticWell.id} FROM ${staticWell}
      JOIN ${micronixPlate} ON ${micronixPlate.id} = ${staticWell.collectionId}
      WHERE ${micronixPlate.locationId} IN (${here})
    UNION ALL
    SELECT ${cryovialTube.id} FROM ${cryovialTube}
      JOIN ${cryovialBox} ON ${cryovialBox.id} = ${cryovialTube.collectionId}
      WHERE ${cryovialBox.locationId} IN (${here})
    UNION ALL
    SELECT ${paper.id} FROM ${paper}
      JOIN ${sheet} ON ${sheet.id} = ${paper.sheetId}
      LEFT JOIN ${box} ON ${box.id} = ${sheet.boxId}
      LEFT JOIN ${bag} ON ${bag.id} = ${sheet.bagId}
      WHERE coalesce(${box.locationId}, ${bag.locationId}) IN (${here})
  )`
}

/**
 * The Tag rule (ADR 0011): a Container matches when it carries every selected Tag. A
 * condition on `storage_container`, so a caller can page and count in SQL. Undefined when no
 * Tag is selected; an unknown Tag id matches nothing.
 */
export function containerHasAllTags(tagIds: readonly number[]): SQL | undefined {
  const unique = [...new Set(tagIds)]
  if (unique.length === 0) return undefined
  return sql`${storageContainer.id} IN (
    SELECT ${storageContainerTag.storageContainerId} FROM ${storageContainerTag}
    WHERE ${inArray(storageContainerTag.tagId, unique)}
    GROUP BY ${storageContainerTag.storageContainerId}
    HAVING ${count()} = ${unique.length}
  )`
}
