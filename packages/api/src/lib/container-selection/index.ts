/**
 * Container selection (CONTEXT.md, ADR 0011): the Containers, with their Specimens, that a
 * selection and its filters match. Every filter is defined once, here. The module selects
 * only; callers enrich with `loadContainerReadViews` (ADR 0009).
 */
import { and, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { specimen, storageContainer, studySubject } from '../../db/schema'
import type { ContainerSubtype } from '../container-placement'
import {
  containerFilterConditions,
  containerTypeSql,
  dateRangeConditions,
  sourceTypeCondition,
  specimenFilterConditions,
} from './conditions'
import { micronixBarcodeScopes, subjectListScopes, type SelectionScope } from './scopes'
import type { ContainerSelection, ContainerSelectionResult, SelectedContainer, SelectedSpecimen } from './types'

export * from './types'
export { containerHasAllTags, hasContainerLevelFilter } from './conditions'
export { CONTAINER_TYPES, containerTypesFilter, specimenSourceType } from './filters'

/** Select the Containers and Specimens a selection matches, with each Container's type. */
export async function selectContainers(
  database: Database,
  selection: ContainerSelection,
): Promise<ContainerSelectionResult> {
  if (selection.kind === 'micronixBarcodes') {
    return runScopes(database, micronixBarcodeScopes(database, selection.barcodes), [])
  }

  const filters = selection.filters ?? {}
  const collectionDate = dateRangeConditions(specimen.collectionDate, filters.collectionDate)
  let scopes: SelectionScope[]
  switch (selection.kind) {
    case 'study': {
      const studySubjectIds = database
        .select({ id: studySubject.id })
        .from(studySubject)
        .where(eq(studySubject.studyId, selection.studyId))
      scopes = [{ specimens: and(inArray(specimen.studySubjectId, studySubjectIds), ...collectionDate) }]
      break
    }
    case 'subjects':
      scopes = await subjectListScopes(database, selection.subjects, {
        collectionDate,
        dateTolerance: selection.dateTolerance ?? 0,
      })
      break
    case 'database':
      scopes = [{ specimens: and(sourceTypeCondition(selection.sourceType), ...collectionDate) }]
      break
  }
  const specimenConditions = specimenFilterConditions(filters)
  return runScopes(
    database,
    scopes.map((scope) => ({ ...scope, specimens: and(scope.specimens, ...specimenConditions) })),
    containerFilterConditions(filters),
  )
}

/**
 * Run each scope (one per chunk of a listed selection) and collect its Specimens and the
 * Containers that also pass the Container-level conditions. Scopes may overlap, so rows are
 * collected by id. With any Container-level
 * condition, only Specimens with a matching Container are kept.
 */
async function runScopes(
  database: Database,
  scopes: SelectionScope[],
  containerConditions: SQL[],
): Promise<ContainerSelectionResult> {
  const specimensById = new Map<number, SelectedSpecimen>()
  const containersById = new Map<number, SelectedContainer>()
  const containerTypes = new Map<number, ContainerSubtype>()
  for (const scope of scopes) {
    for (const row of await database.select().from(specimen).where(scope.specimens)) specimensById.set(row.id, row)
    const rows = await database
      .select({ container: getTableColumns(storageContainer), containerType: containerTypeSql })
      .from(storageContainer)
      .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
      .where(and(scope.specimens, scope.containers, ...containerConditions))
    for (const row of rows) {
      containersById.set(row.container.id, row.container)
      containerTypes.set(row.container.id, row.containerType)
    }
  }
  const containers = [...containersById.values()]
  let specimens = [...specimensById.values()]
  if (containerConditions.length > 0) {
    const stored = new Set(containers.map((container) => container.specimenId))
    specimens = specimens.filter((row) => stored.has(row.id))
  }
  const byId = (a: { id: number }, b: { id: number }) => a.id - b.id
  return { containers: containers.sort(byId), specimens: specimens.sort(byId), containerTypes }
}
