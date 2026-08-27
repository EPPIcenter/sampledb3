import type { Database } from '../../db/client'
import type { StorageContainer } from '../../db/schema'
import {
  projectContainerIdentity,
  projectContainerPlacementFields,
} from '../container-projection'
import { loadContainerReadViews } from '../container-read-view'
import type { ContainerExportData, StudyRecord } from './types'

export async function enrichContainerData(
  database: Database,
  containers: StorageContainer[],
  _specimens: Array<{ id: number; studySubjectId: number | null; controlBatchId: number | null; specimenTypeId: number; collectionDate: string | null; created: string }>,
  study: StudyRecord,
  containerTypeFilter?: string[],
  subjectToStudyMap?: Map<number, StudyRecord>
): Promise<ContainerExportData[]> {
  const views = await loadContainerReadViews(database, containers)
  const enriched: ContainerExportData[] = []

  for (const view of views) {
    const container = view.container
    const spec = view.specimen
    if (!spec) continue

    const containerType = view.containerType
    const { position, collectionName } = projectContainerPlacementFields(view.placement)
    const identity = projectContainerIdentity(containerType, {
      micronix: view.micronixTube,
      cryovial: view.cryovialTube,
      paper: view.paper,
    })
    const barcode = containerType === 'paper' ? undefined : identity.barcode
    const sublabel = containerType === 'paper' ? identity.sublabel : undefined
    const sheet_name = containerType === 'paper' ? identity.sheetName : undefined

    const subjectId = spec.studySubjectId || undefined
    const controlBatchId = spec.controlBatchId || undefined
    const source = view.source
    const controlSource = source?.type === 'control' ? source : undefined
    const subjectName = source?.name

    if (containerTypeFilter && containerTypeFilter.length > 0 && !containerTypeFilter.includes(containerType)) {
      continue
    }

    let containerStudy = study
    if (subjectToStudyMap && subjectId) {
      const subjectStudy = subjectToStudyMap.get(subjectId)
      if (subjectStudy) {
        containerStudy = subjectStudy
      }
    } else if (controlBatchId) {
      containerStudy = study
    }

    const studyId = controlBatchId ? undefined : containerStudy.id
    const studyTitle = controlBatchId ? undefined : containerStudy.title
    const studyCode = controlBatchId ? undefined : containerStudy.shortCode
    const studyLeadPerson = controlBatchId ? undefined : containerStudy.leadPerson

    const tagNames = [...view.tags.map((t) => t.name)].sort((a, b) => a.localeCompare(b))

    enriched.push({
      container_id: container.id,
      container_type: containerType,
      barcode,
      sublabel,
      sheet_name,
      position,
      collection_name: collectionName,
      tags: tagNames.join(', '),
      status:
        container.remainingQuantity == null
          ? 'Unknown'
          : container.remainingQuantity > 0
            ? 'In Use'
            : 'Exhausted',
      comment: container.comment || undefined,
      specimen_id: spec.id,
      specimen_type: view.specimen?.specimenType?.name || '',
      collection_date: spec.collectionDate || undefined,
      subject_id: subjectId,
      subject_name: subjectName,
      control_batch_id: controlBatchId,
      control_batch_name: controlSource?.name,
      control_definition_name: controlSource?.definitionName ?? undefined,
      control_type: controlSource?.controlType,
      target_density: controlSource?.targetDensity ?? undefined,
      target_density_unit: controlSource?.targetDensityUnit ?? undefined,
      strain_composition: controlSource?.strainComposition ?? undefined,
      study_id: studyId,
      study_title: studyTitle,
      study_code: studyCode,
      study_lead_person: studyLeadPerson,
      location_path: view.placement.locationPath,
      location_id: view.placement.location?.id,
      location_name: view.placement.location?.name,
      created: container.created,
      last_updated: container.lastUpdated,
    })
  }

  return enriched
}
