import type { Database } from '../../db/client'
import {
  storageContainer,
  specimen,
  specimenType,
  studySubject,
  controlBatch,
  controlDefinition,
  unit,
  strain,
  storageContainerTag,
  tag,
} from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { resolveContainerPlacementBundle } from '../container-placement'
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

  // Get control batch information for all specimens
  const controlBatchIds = [...new Set(specimens.filter(s => s.controlBatchId !== null).map(s => s.controlBatchId!))]
  const controlBatches = controlBatchIds.length > 0
    ? await database
        .select({
          id: controlBatch.id,
          name: controlBatch.name,
          controlDefinitionId: controlBatch.controlDefinitionId,
        })
        .from(controlBatch)
        .where(inArray(controlBatch.id, controlBatchIds))
    : []
  const controlBatchMap = new Map(controlBatches.map(cb => [cb.id, cb.name]))
  const controlBatchToDefinitionMap = new Map(controlBatches.map(cb => [cb.id, cb.controlDefinitionId]))

  // Get control definitions for these batches
  const controlDefinitionIds = [...new Set(Array.from(controlBatchToDefinitionMap.values()))]
  const controlDefinitions = controlDefinitionIds.length > 0
    ? await database
        .select({
          id: controlDefinition.id,
          name: controlDefinition.name,
          controlType: controlDefinition.controlType,
          properties: controlDefinition.properties,
          created: controlDefinition.created,
          lastUpdated: controlDefinition.lastUpdated,
        })
        .from(controlDefinition)
        .where(inArray(controlDefinition.id, controlDefinitionIds))
    : []
  const controlDefinitionMap = new Map(controlDefinitions.map(cd => [cd.id, cd]))

  // Get units for target density (extract from properties)
  const unitIds = new Set<number>()
  for (const cd of controlDefinitions) {
    const props = cd.properties as any
    if (props?.targetDensityUnitId) {
      unitIds.add(props.targetDensityUnitId)
    }
  }
  const unitsResult = unitIds.size > 0
    ? await database
        .select({
          id: unit.id,
          symbol: unit.symbol,
        })
        .from(unit)
        .where(inArray(unit.id, Array.from(unitIds)))
    : []
  const units = unitsResult as Array<{ id: number; symbol: string }>
  const unitMap = new Map<number, string>(units.map(u => [u.id, u.symbol]))

  // Get all strains for name lookup
  const allStrains = await database.select().from(strain)
  const strainNameMap = new Map(allStrains.map(s => [s.id, s.name]))
  
  // Build strain map from properties JSON: controlDefinitionId -> array of {name, percentage}
  const strainMap = new Map<number, Array<{ name: string; percentage: number }>>()
  for (const cd of controlDefinitions) {
    const props = cd.properties as any
    if (props?.strains && Array.isArray(props.strains)) {
      const strains = props.strains.map((s: any) => {
        if (typeof s === 'number') {
          return { name: strainNameMap.get(s) || `Strain ${s}`, percentage: 0 }
        }
        return {
          name: s.name || strainNameMap.get(s.id) || `Strain ${s.id}`,
          percentage: s.percentage || 0,
        }
      })
      if (strains.length > 0) {
        strainMap.set(cd.id, strains)
      }
    }
  }

  // Build control batch to definition map for quick lookup
  const batchToDefinitionMap = new Map<number, {
    id: number
    name: string
    controlType: string
    targetDensity: number | null
    targetDensityUnitId: number | null
    properties: unknown
    created: string
    lastUpdated: string
    unitSymbol?: string
    strainComposition?: string
  }>()
  for (const cb of controlBatches) {
    const def = controlDefinitionMap.get(cb.controlDefinitionId)
    if (def) {
      const props = def.properties as any
      const targetDensity = props?.targetDensity
      const targetDensityUnitId = props?.targetDensityUnitId
      const unitSymbol: string | undefined = targetDensityUnitId ? unitMap.get(targetDensityUnitId) : props?.targetDensityUnitSymbol
      const strains = strainMap.get(def.id)
      const strainComposition: string | undefined = strains && strains.length > 0
        ? strains.map(s => `${s.name} (${s.percentage}%)`).join('; ')
        : undefined
      
      batchToDefinitionMap.set(cb.id, {
        id: def.id,
        name: def.name,
        controlType: def.controlType,
        targetDensity: targetDensity || null,
        targetDensityUnitId: targetDensityUnitId || null,
        properties: def.properties,
        created: def.created,
        lastUpdated: def.lastUpdated,
        unitSymbol,
        strainComposition,
      })
    }
  }

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

  function barcodeForContainer(containerId: number): string | undefined {
    return (
      subtypes.micronixById.get(containerId)?.barcode ??
      subtypes.cryovialById.get(containerId)?.barcode ??
      subtypes.paperById.get(containerId)?.barcode ??
      undefined
    )
  }

  // Build enriched data
  const enriched: ContainerExportData[] = []

  for (const container of containers) {
    const spec = specimenMap.get(container.specimenId)
    if (!spec) continue

    const placement = placementMap.get(container.id)!
    const containerType = placement.containerType
    const barcode = barcodeForContainer(container.id)
    const position = placement.collection?.position ?? undefined
    const collectionName =
      placement.collection?.name && placement.collection.name !== 'Unknown'
        ? placement.collection.name
        : undefined
    const locationPath = placement.locationPath

    const subjectId = spec.studySubjectId || undefined
    const controlBatchId = spec.controlBatchId || undefined
    // For control batches, use control batch name as subject_name; otherwise use actual subject name
    const subjectName = subjectId 
      ? subjectMap.get(subjectId) 
      : controlBatchId 
        ? controlBatchMap.get(controlBatchId) 
        : undefined

    // Get control batch details if this is a control batch
    const controlBatchName = controlBatchId ? controlBatchMap.get(controlBatchId) : undefined
    const controlBatchDetails = controlBatchId ? batchToDefinitionMap.get(controlBatchId) : undefined
    const controlDefinitionName = controlBatchDetails?.name
    const controlType = controlBatchDetails?.controlType
    const targetDensity = controlBatchDetails?.targetDensity ?? undefined
    const targetDensityUnit = controlBatchDetails?.unitSymbol
    const strainComposition = controlBatchDetails?.strainComposition

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
