import type { Database } from '../../db/client'
import type { StorageContainer } from '../../db/schema'
import {
  projectContainerIdentity,
  projectContainerPlacementFields,
} from '../container-projection'
import { loadContainerReadViews } from '../container-read-view'
import type { ContainerExportData } from './types'

/**
 * Container export rows for the selected Containers. Study fields come from each
 * Specimen's Source (ADR 0007); a control row has none.
 */
export async function enrichContainerData(
  database: Database,
  containers: StorageContainer[]
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
    const subjectStudy = source?.type === 'subject' ? source.study : undefined
    const subjectName = source?.name

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
      study_id: subjectStudy?.id,
      study_title: subjectStudy?.title,
      study_code: subjectStudy?.code,
      study_lead_person: subjectStudy?.leadPerson,
      location_path: view.placement.locationPath,
      location_id: view.placement.location?.id,
      location_name: view.placement.location?.name,
      created: container.created,
      last_updated: container.lastUpdated,
    })
  }

  return enriched
}
