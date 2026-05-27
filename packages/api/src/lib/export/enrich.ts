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
  micronixTube,
  cryovialTube,
  paper,
} from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { resolveContainerPlacements } from '../container-placement'
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

  // Resolve placement (type, collection, position, location) via shared enrichment
  const placementMap = await resolveContainerPlacements(database, containerIds)

  // Barcodes are not part of placement info — fetch only when needed for export columns
  const shouldQueryType = (type: string) => {
    if (!containerTypeFilter || containerTypeFilter.length === 0) return true
    return containerTypeFilter.includes(type)
  }

  const [micronixTubes, cryovialTubes, papers] = await Promise.all([
    shouldQueryType('micronix_tube')
      ? database.select({ id: micronixTube.id, barcode: micronixTube.barcode }).from(micronixTube).where(inArray(micronixTube.id, containerIds))
      : [],
    shouldQueryType('cryovial_tube')
      ? database.select({ id: cryovialTube.id, barcode: cryovialTube.barcode }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds))
      : [],
    shouldQueryType('paper')
      ? database.select({ id: paper.id, barcode: paper.barcode }).from(paper).where(inArray(paper.id, containerIds))
      : [],
  ])

  const barcodeMap = new Map<number, string>()
  for (const tube of micronixTubes) {
    if (tube.barcode) barcodeMap.set(tube.id, tube.barcode)
  }
  for (const tube of cryovialTubes) {
    if (tube.barcode) barcodeMap.set(tube.id, tube.barcode)
  }
  for (const p of papers) {
    if (p.barcode) barcodeMap.set(p.id, p.barcode)
  }

  // Build enriched data
  const enriched: ContainerExportData[] = []

  for (const container of containers) {
    const spec = specimenMap.get(container.specimenId)
    if (!spec) continue

    const placement = placementMap.get(container.id)!
    const containerType = placement.containerType
    const barcode = barcodeMap.get(container.id)
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
      // For control batches, use a placeholder study object
      containerStudy = { 
        id: 0, 
        shortCode: 'CONTROL', 
        title: 'Control Batch', 
        description: null,
        leadPerson: '', 
        isLongitudinal: false, 
        created: '', 
        lastUpdated: '' 
      } as StudyRecord
    }

    enriched.push({
      container_id: container.id,
      container_type: containerType,
      barcode,
      position,
      collection_name: collectionName,
      state: '',
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
      study_id: containerStudy.id,
      study_title: containerStudy.title,
      study_code: containerStudy.shortCode,
      study_lead_person: containerStudy.leadPerson,
      location_path: locationPath,
      location_id: placement.location?.id,
      location_name: placement.location?.name,
      created: container.created,
      last_updated: container.lastUpdated,
    })
  }

  return enriched
}
