/**
 * Container selection (CONTEXT.md, ADR 0011): the Containers, with their Specimens, that a
 * selection and its filters match. Every filter is defined once, here. The module selects
 * only; callers enrich with `loadContainerReadViews` (ADR 0009).
 */
import { and, eq, getTableColumns, inArray, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { specimen, storageContainer, studySubject } from '../../db/schema'
import { CONTAINER_SUBTYPES, type ContainerSubtype } from '../container-placement'
import {
  containerFilterConditions,
  containerTypeSql,
  dateRangeConditions,
  sourceTypeCondition,
  specimenFilterConditions,
} from './conditions'
import { micronixBarcodeScopes, subjectListScopes, type SelectionScope } from './scopes'
import type {
  ContainerSelection,
  ContainerSelectionResult,
  ContainerSelectionTypes,
  SelectedContainer,
  SelectedSpecimen,
} from './types'

export * from './types'
export { containerHasAllTags } from './conditions'
export { containerTypesFilter, specimenSourceType } from './filters'

/** Select the Containers and Specimens a selection matches, with each Container's type. */
export async function selectContainers(
  database: Database,
  selection: ContainerSelection,
): Promise<ContainerSelectionResult> {
  const { scopes, containerConditions } = await selectionScopes(database, selection)
  return runScopes(database, scopes, containerConditions)
}

/**
 * The specimen types and container types a selection matches, without loading its rows.
 * Specimen types follow the same rule as `selectContainers`' Specimens: with a Container-level
 * filter, only Specimens with a matching Container count.
 */
export async function selectContainerSelectionTypes(
  database: Database,
  selection: ContainerSelection,
): Promise<ContainerSelectionTypes> {
  const { scopes, containerConditions } = await selectionScopes(database, selection)
  const specimenTypeIds = new Set<number>()
  const containerTypes = new Set<ContainerSubtype>()
  for (const scope of scopes) {
    const rows = await database
      .selectDistinct({ specimenTypeId: specimen.specimenTypeId, containerType: containerTypeSql })
      .from(storageContainer)
      .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
      .where(and(scope.specimens, scope.containers, ...containerConditions))
    for (const row of rows) {
      containerTypes.add(row.containerType)
      if (containerConditions.length > 0) specimenTypeIds.add(row.specimenTypeId)
    }
    if (containerConditions.length === 0) {
      const specimenRows = await database
        .selectDistinct({ specimenTypeId: specimen.specimenTypeId })
        .from(specimen)
        .where(scope.specimens)
      for (const row of specimenRows) specimenTypeIds.add(row.specimenTypeId)
    }
  }
  return {
    specimenTypeIds: [...specimenTypeIds].sort((a, b) => a - b),
    containerTypes: CONTAINER_SUBTYPES.filter((type) => containerTypes.has(type)),
  }
}

/** The bounded scopes a selection runs, and the Container-level conditions every scope shares. */
async function selectionScopes(
  database: Database,
  selection: ContainerSelection,
): Promise<{ scopes: SelectionScope[]; containerConditions: SQL[] }> {
  if (selection.kind === 'micronixBarcodes') {
    return { scopes: micronixBarcodeScopes(database, selection.barcodes), containerConditions: [] }
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
  return {
    scopes: scopes.map((scope) => ({ ...scope, specimens: and(scope.specimens, ...specimenConditions) })),
    containerConditions: containerFilterConditions(filters),
  }
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
  return {
    containers: containers.sort(byId),
    specimens: specimens.sort(byId),
    containerTypes,
    hasContainerLevelFilter: containerConditions.length > 0,
  }
}
