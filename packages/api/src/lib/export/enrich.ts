import type { Database } from '../../db/client'
import {
  storageContainer,
  specimenType,
  studySubject,
  storageContainerTag,
  tag,
} from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { resolveContainerPlacementBundle } from '../container-placement'
import {
  projectContainerIdentity,
  projectContainerPlacementFields,
} from '../container-projection'
import { resolveSpecimenSources } from '../specimens/provenance'
import type { ContainerExportData, StudyRecord } from './types'

export async function enrichContainerData(
  database: Database,
  containers: Array<typeof storageContainer.$inferSelect>,
  specimens: Array<{ id: number; studySubjectId: number | null; controlBatchId: number | null; specimenTypeId: number; collectionDate: string | null; created: string }>,
  study: StudyRecord,
  containerTypeFilter?: string[],
  subjectToStudyMap?: Map<number, StudyRecord>
): Promise<ContainerExportData[]> {
  // Create specimen lookup
  const specimenMap = new Map(specimens.map(s => [s.id, s]))
  
  // Get all unique IDs we need to look up
  const containerIds = containers.map(c => c.id)
  const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]

  // Batch fetch lookups
  const specimenTypes = await database.select().from(specimenType).where(inArray(specimenType.id, specimenTypeIds))

  // Create lookup maps
  const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

  // Get subject information for all specimens
  const subjectIds = [...new Set(specimens.filter(s => s.studySubjectId !== null).map(s => s.studySubjectId!))]
  const subjects = subjectIds.length > 0
    ? await database
        .select({
          id: studySubject.id,
          name: studySubject.name,
        })
        .from(studySubject)
        .where(inArray(studySubject.id, subjectIds))
    : []
  const subjectMap = new Map(subjects.map(s => [s.id, s.name]))

  // Control-batch provenance (definition, density, strain composition) comes
  // from the shared Specimen Source resolver — one source of truth across
  // container reads, derivations, qPCR, and export.
  const sourceMap = await resolveSpecimenSources(database, specimens.map(s => s.id))

  const { placements: placementMap, subtypes } = await resolveContainerPlacementBundle(database, containerIds)

  const tagRows =
    containerIds.length > 0
      ? await database
          .select({
            containerId: storageContainerTag.storageContainerId,
            name: tag.name,
          })
          .from(storageContainerTag)
          .innerJoin(tag, eq(storageContainerTag.tagId, tag.id))
          .where(inArray(storageContainerTag.storageContainerId, containerIds))
      : []

  const tagsByContainerId = new Map<number, string[]>()
  for (const row of tagRows) {
    const list = tagsByContainerId.get(row.containerId) ?? []
    list.push(row.name)
    tagsByContainerId.set(row.containerId, list)
  }

  function formatTagsForContainer(containerId: number): string {
    const names = tagsByContainerId.get(containerId) ?? []
    return [...names].sort((a, b) => a.localeCompare(b)).join(', ')
  }

  // Build enriched data
  const enriched: ContainerExportData[] = []

  for (const container of containers) {
    const spec = specimenMap.get(container.specimenId)
    if (!spec) continue

    const placement = placementMap.get(container.id)!
    const containerType = placement.containerType
    const { position, collectionName } = projectContainerPlacementFields(placement)
    const identity = projectContainerIdentity(containerType, {
      micronix: subtypes.micronixById.get(container.id),
      cryovial: subtypes.cryovialById.get(container.id),
      paper: subtypes.paperById.get(container.id),
    })
    const barcode = containerType === 'paper' ? undefined : identity.barcode
    const sublabel = containerType === 'paper' ? identity.sublabel : undefined
    const sheet_name = containerType === 'paper' ? identity.sheetName : undefined
    const locationPath = placement.locationPath

    const subjectId = spec.studySubjectId || undefined
    const controlBatchId = spec.controlBatchId || undefined
    const source = sourceMap.get(spec.id)
    const controlSource = source?.type === 'control' ? source : undefined
    // For control batches, use control batch name as subject_name; otherwise use actual subject name
    const subjectName = subjectId
      ? subjectMap.get(subjectId)
      : controlSource?.name

    // Get control batch details if this is a control batch
    const controlBatchName = controlSource?.name
    const controlDefinitionName = controlSource?.definitionName ?? undefined
    const controlType = controlSource?.controlType
    const targetDensity = controlSource?.targetDensity ?? undefined
    const targetDensityUnit = controlSource?.targetDensityUnit ?? undefined
    const strainComposition = controlSource?.strainComposition ?? undefined

    // Filter by container type if specified
    if (containerTypeFilter && containerTypeFilter.length > 0 && !containerTypeFilter.includes(containerType)) {
      continue
    }

    // Get study information - use subjectToStudyMap if provided (for multi-study), otherwise use the passed study
    // For control batches, we don't have a study, so use a placeholder or the passed study
    let containerStudy = study
    if (subjectToStudyMap && subjectId) {
      const subjectStudy = subjectToStudyMap.get(subjectId)
      if (subjectStudy) {
        containerStudy = subjectStudy
      }
    } else if (controlBatchId) {
      containerStudy = study
    }

    // Study columns: blank for control-batch specimens (provenance is via control columns)
    const studyId = controlBatchId ? undefined : containerStudy.id
    const studyTitle = controlBatchId ? undefined : containerStudy.title
    const studyCode = controlBatchId ? undefined : containerStudy.shortCode
    const studyLeadPerson = controlBatchId ? undefined : containerStudy.leadPerson

    enriched.push({
      container_id: container.id,
      container_type: containerType,
      barcode,
      sublabel,
      sheet_name,
      position,
      collection_name: collectionName,
      tags: formatTagsForContainer(container.id),
      status:
        container.remainingQuantity == null
          ? 'Unknown'
          : container.remainingQuantity > 0
            ? 'In Use'
            : 'Exhausted',
      comment: container.comment || undefined,
      specimen_id: spec.id,
      specimen_type: specimenTypeMap.get(spec.specimenTypeId) || '',
      collection_date: spec.collectionDate || undefined,
      subject_id: subjectId,
      subject_name: subjectName,
      control_batch_id: controlBatchId,
      control_batch_name: controlBatchName,
      control_definition_name: controlDefinitionName,
      control_type: controlType,
      target_density: targetDensity,
      target_density_unit: targetDensityUnit,
      strain_composition: strainComposition,
      study_id: studyId,
      study_title: studyTitle,
      study_code: studyCode,
      study_lead_person: studyLeadPerson,
      location_path: locationPath,
      location_id: placement.location?.id,
      location_name: placement.location?.name,
      created: container.created,
      last_updated: container.lastUpdated,
    })
  }

  return enriched
}
