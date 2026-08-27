import type { Database } from '../db/client'
import {
  micronixPlate,
  micronixTube,
  staticWell,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  sheet,
  location,
  storageContainer,
  specimen,
  studySubject,
  study,
  controlBatch,
  containerDerivation,
  storageContainerTag,
  paper,
  tag,
} from '../db/schema'
import { eq, inArray, sql } from 'drizzle-orm'

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

export interface EmptyCollectionItem {
  type: CollectionType
  id: number
  name: string
  locationId?: number
  locationPath?: string | null
}

/**
 * List all collections (plates, cryovial boxes, boxes, bags) that have zero items.
 */
export async function listEmptyCollections(db: Database): Promise<EmptyCollectionItem[]> {
  const results: EmptyCollectionItem[] = []

  // Micronix plates: items = micronixTube + staticWell
  const allPlates = await db
    .select({
      id: micronixPlate.id,
      name: micronixPlate.name,
      locationId: micronixPlate.locationId,
      path: location.path,
    })
    .from(micronixPlate)
    .leftJoin(location, eq(micronixPlate.locationId, location.id))

  const plateIds = allPlates.map((p) => p.id)
  const [tubeCounts, wellCounts] =
    plateIds.length > 0
      ? await Promise.all([
          db
            .select({
              collectionId: micronixTube.collectionId,
              count: sql<number>`COUNT(*)`.as('count'),
            })
            .from(micronixTube)
            .where(inArray(micronixTube.collectionId, plateIds))
            .groupBy(micronixTube.collectionId),
          db
            .select({
              collectionId: staticWell.collectionId,
              count: sql<number>`COUNT(*)`.as('count'),
            })
            .from(staticWell)
            .where(inArray(staticWell.collectionId, plateIds))
            .groupBy(staticWell.collectionId),
        ])
      : [[], []]

  const tubeMap = new Map((tubeCounts as { collectionId: number; count: number }[]).map((t) => [t.collectionId, t.count]))
  const wellMap = new Map((wellCounts as { collectionId: number; count: number }[]).map((w) => [w.collectionId, w.count]))

  for (const p of allPlates) {
    const items = (tubeMap.get(p.id) ?? 0) + (wellMap.get(p.id) ?? 0)
    if (items === 0) {
      results.push({
        type: 'micronix_plate',
        id: p.id,
        name: p.name,
        locationId: p.locationId,
        locationPath: p.path,
      })
    }
  }

  // Cryovial boxes: items = cryovialTube
  const allCryovialBoxes = await db
    .select({
      id: cryovialBox.id,
      name: cryovialBox.name,
      locationId: cryovialBox.locationId,
      path: location.path,
    })
    .from(cryovialBox)
    .leftJoin(location, eq(cryovialBox.locationId, location.id))

  const cryovialBoxIds = allCryovialBoxes.map((b) => b.id)
  const cryoTubeCounts =
    cryovialBoxIds.length > 0
      ? await db
          .select({
            collectionId: cryovialTube.collectionId,
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(cryovialTube)
          .where(inArray(cryovialTube.collectionId, cryovialBoxIds))
          .groupBy(cryovialTube.collectionId)
      : []

  const cryoMap = new Map(cryoTubeCounts.map((t) => [t.collectionId, t.count]))

  for (const b of allCryovialBoxes) {
    if ((cryoMap.get(b.id) ?? 0) === 0) {
      results.push({
        type: 'cryovial_box',
        id: b.id,
        name: b.name,
        locationId: b.locationId,
        locationPath: b.path,
      })
    }
  }

  // Boxes: items = sheet where boxId = box.id
  const allBoxes = await db
    .select({
      id: box.id,
      name: box.name,
      locationId: box.locationId,
      path: location.path,
    })
    .from(box)
    .leftJoin(location, eq(box.locationId, location.id))

  const boxIds = allBoxes.map((b) => b.id)
  const boxSheetCounts =
    boxIds.length > 0
      ? await db
          .select({
            boxId: sheet.boxId,
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(sheet)
          .where(inArray(sheet.boxId, boxIds))
          .groupBy(sheet.boxId)
      : []

  const boxSheetMap = new Map(boxSheetCounts.map((s) => [s.boxId!, s.count]))

  for (const b of allBoxes) {
    if ((boxSheetMap.get(b.id) ?? 0) === 0) {
      results.push({
        type: 'box',
        id: b.id,
        name: b.name,
        locationId: b.locationId,
        locationPath: b.path,
      })
    }
  }

  // Bags: items = sheet where bagId = bag.id
  const allBags = await db
    .select({
      id: bag.id,
      name: bag.name,
      locationId: bag.locationId,
      path: location.path,
    })
    .from(bag)
    .leftJoin(location, eq(bag.locationId, location.id))

  const bagIds = allBags.map((b) => b.id)
  const bagSheetCounts =
    bagIds.length > 0
      ? await db
          .select({
            bagId: sheet.bagId,
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(sheet)
          .where(inArray(sheet.bagId, bagIds))
          .groupBy(sheet.bagId)
      : []

  const bagSheetMap = new Map(bagSheetCounts.map((s) => [s.bagId!, s.count]))

  for (const b of allBags) {
    if ((bagSheetMap.get(b.id) ?? 0) === 0) {
      results.push({
        type: 'bag',
        id: b.id,
        name: b.name,
        locationId: b.locationId,
        locationPath: b.path,
      })
    }
  }

  return results
}

export interface DeleteEmptyCollectionsRequest {
  ids: {
    micronix_plate?: number[]
    cryovial_box?: number[]
    box?: number[]
    bag?: number[]
  }
}

export interface DeleteEmptyCollectionsResult {
  deleted: number
  errors: string[]
}

/**
 * Delete only collections that are currently empty. Re-checks each id; non-empty or missing ids are reported in errors.
 */
export async function deleteEmptyCollections(
  db: Database,
  request: DeleteEmptyCollectionsRequest
): Promise<DeleteEmptyCollectionsResult> {
  const errors: string[] = []
  let deleted = 0

  const emptyList = await listEmptyCollections(db)
  const emptySet = new Set(emptyList.map((c) => `${c.type}:${c.id}`))

  const toDelete = request.ids.micronix_plate ?? []
  for (const id of toDelete) {
    if (!emptySet.has(`micronix_plate:${id}`)) {
      errors.push(`micronix_plate:${id} is not empty or does not exist`)
      continue
    }
    await db.delete(micronixPlate).where(eq(micronixPlate.id, id))
    deleted++
  }

  const cryoIds = request.ids.cryovial_box ?? []
  for (const id of cryoIds) {
    if (!emptySet.has(`cryovial_box:${id}`)) {
      errors.push(`cryovial_box:${id} is not empty or does not exist`)
      continue
    }
    await db.delete(cryovialBox).where(eq(cryovialBox.id, id))
    deleted++
  }

  const boxIds = request.ids.box ?? []
  for (const id of boxIds) {
    if (!emptySet.has(`box:${id}`)) {
      errors.push(`box:${id} is not empty or does not exist`)
      continue
    }
    await db.delete(box).where(eq(box.id, id))
    deleted++
  }

  const bagIds = request.ids.bag ?? []
  for (const id of bagIds) {
    if (!emptySet.has(`bag:${id}`)) {
      errors.push(`bag:${id} is not empty or does not exist`)
      continue
    }
    await db.delete(bag).where(eq(bag.id, id))
    deleted++
  }

  return { deleted, errors }
}

// --- Integrity report types and checks ---

export interface CollectionWithMissingLocationItem {
  type: CollectionType
  id: number
  name: string
  locationId: number
}

export interface ContainerWithMissingSpecimenItem {
  id: number
  specimenId: number
}

export interface SubtypeOrphanItem {
  id: number
}

export interface SheetWithMissingBoxOrBagItem {
  id: number
  name: string
  boxId: number | null
  bagId: number | null
}

export interface SpecimenWithMissingSubjectOrBatchItem {
  id: number
  studySubjectId: number | null
  controlBatchId: number | null
}

export interface StudySubjectWithMissingStudyItem {
  id: number
  studyId: number
  name: string
}

export interface DerivationBrokenRefItem {
  id: number
  parentContainerId: number
  childContainerId: number
}

export interface StorageContainerTagOrphanItem {
  storageContainerId: number
  tagId: number
}

export interface DuplicateBarcodeItem {
  barcode: string
  containerType: 'micronix_tube'
  ids: number[]
}

export interface LocationPathInconsistencyItem {
  id: number
  name: string
  storedPath: string | null
  expectedPath: string
}

export interface ContainerWithNoGridPositionItem {
  id: number
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well'
  collectionId: number
}

export interface IntegrityReport {
  emptyCollections: EmptyCollectionItem[]
  collectionsWithMissingLocation: CollectionWithMissingLocationItem[]
  containersWithMissingSpecimen: ContainerWithMissingSpecimenItem[]
  subtypeOrphans: SubtypeOrphanItem[]
  sheetsWithMissingBoxOrBag: SheetWithMissingBoxOrBagItem[]
  specimensWithMissingSubjectOrBatch: SpecimenWithMissingSubjectOrBatchItem[]
  studySubjectsWithMissingStudy: StudySubjectWithMissingStudyItem[]
  derivationBrokenRefs: DerivationBrokenRefItem[]
  storageContainerTagOrphans: StorageContainerTagOrphanItem[]
  duplicateBarcodes: DuplicateBarcodeItem[]
  locationPathInconsistencies: LocationPathInconsistencyItem[]
  containersWithNoGridPosition: ContainerWithNoGridPositionItem[]
}

/** Collections (plates, boxes, bags) whose locationId does not exist in location. */
export async function listCollectionsWithMissingLocation(db: Database): Promise<CollectionWithMissingLocationItem[]> {
  const results: CollectionWithMissingLocationItem[] = []
  const locationIds = await db.select({ id: location.id }).from(location)
  const validLocIds = new Set(locationIds.map((r) => r.id))

  const allPlates = await db.select({ id: micronixPlate.id, name: micronixPlate.name, locationId: micronixPlate.locationId }).from(micronixPlate)
  for (const p of allPlates) {
    if (!validLocIds.has(p.locationId)) {
      results.push({ type: 'micronix_plate', id: p.id, name: p.name, locationId: p.locationId })
    }
  }

  const allCryo = await db.select({ id: cryovialBox.id, name: cryovialBox.name, locationId: cryovialBox.locationId }).from(cryovialBox)
  for (const b of allCryo) {
    if (!validLocIds.has(b.locationId)) {
      results.push({ type: 'cryovial_box', id: b.id, name: b.name, locationId: b.locationId })
    }
  }

  const allBoxes = await db.select({ id: box.id, name: box.name, locationId: box.locationId }).from(box)
  for (const b of allBoxes) {
    if (!validLocIds.has(b.locationId)) {
      results.push({ type: 'box', id: b.id, name: b.name, locationId: b.locationId })
    }
  }

  const allBags = await db.select({ id: bag.id, name: bag.name, locationId: bag.locationId }).from(bag)
  for (const b of allBags) {
    if (!validLocIds.has(b.locationId)) {
      results.push({ type: 'bag', id: b.id, name: b.name, locationId: b.locationId })
    }
  }

  return results
}

/** storage_container rows whose specimenId is not in specimen. */
export async function listContainersWithMissingSpecimen(db: Database): Promise<ContainerWithMissingSpecimenItem[]> {
  const specimenIds = await db.select({ id: specimen.id }).from(specimen)
  const validSpec = new Set(specimenIds.map((r) => r.id))
  const containers = await db.select({ id: storageContainer.id, specimenId: storageContainer.specimenId }).from(storageContainer)
  return containers.filter((c) => !validSpec.has(c.specimenId)).map((c) => ({ id: c.id, specimenId: c.specimenId }))
}

/** storage_container rows with no row in micronix_tube, cryovial_tube, paper, or static_well. */
export async function listSubtypeOrphans(db: Database): Promise<SubtypeOrphanItem[]> {
  const withMicronix = await db.select({ id: micronixTube.id }).from(micronixTube)
  const withCryo = await db.select({ id: cryovialTube.id }).from(cryovialTube)
  const withPaper = await db.select({ id: paper.id }).from(paper)
  const withWell = await db.select({ id: staticWell.id }).from(staticWell)
  const hasSubtype = new Set([...withMicronix, ...withCryo, ...withPaper, ...withWell].map((r) => r.id))
  const allContainers = await db.select({ id: storageContainer.id }).from(storageContainer)
  return allContainers.filter((c) => !hasSubtype.has(c.id)).map((c) => ({ id: c.id }))
}

/** sheet rows with non-null boxId or bagId pointing to non-existent box/bag. */
export async function listSheetsWithMissingBoxOrBag(db: Database): Promise<SheetWithMissingBoxOrBagItem[]> {
  const boxIds = new Set((await db.select({ id: box.id }).from(box)).map((r) => r.id))
  const bagIds = new Set((await db.select({ id: bag.id }).from(bag)).map((r) => r.id))
  const sheets = await db.select({ id: sheet.id, name: sheet.name, boxId: sheet.boxId, bagId: sheet.bagId }).from(sheet)
  return sheets.filter((s) => (s.boxId != null && !boxIds.has(s.boxId)) || (s.bagId != null && !bagIds.has(s.bagId))).map((s) => ({ id: s.id, name: s.name, boxId: s.boxId ?? null, bagId: s.bagId ?? null }))
}

/** specimen rows whose studySubjectId or controlBatchId points to non-existent entity. */
export async function listSpecimensWithMissingSubjectOrBatch(db: Database): Promise<SpecimenWithMissingSubjectOrBatchItem[]> {
  const subjectIds = new Set((await db.select({ id: studySubject.id }).from(studySubject)).map((r) => r.id))
  const batchIds = new Set((await db.select({ id: controlBatch.id }).from(controlBatch)).map((r) => r.id))
  const specimens = await db.select({ id: specimen.id, studySubjectId: specimen.studySubjectId, controlBatchId: specimen.controlBatchId }).from(specimen)
  return specimens
    .filter((s) => (s.studySubjectId != null && !subjectIds.has(s.studySubjectId)) || (s.controlBatchId != null && !batchIds.has(s.controlBatchId!)))
    .map((s) => ({ id: s.id, studySubjectId: s.studySubjectId ?? null, controlBatchId: s.controlBatchId ?? null }))
}

/** study_subject rows whose studyId is not in study. */
export async function listStudySubjectsWithMissingStudy(db: Database): Promise<StudySubjectWithMissingStudyItem[]> {
  const studyIds = new Set((await db.select({ id: study.id }).from(study)).map((r) => r.id))
  const subjects = await db.select({ id: studySubject.id, studyId: studySubject.studyId, name: studySubject.name }).from(studySubject)
  return subjects.filter((s) => !studyIds.has(s.studyId)).map((s) => ({ id: s.id, studyId: s.studyId, name: s.name }))
}

/** container_derivation rows with missing parent or child in storage_container. */
export async function listDerivationBrokenRefs(db: Database): Promise<DerivationBrokenRefItem[]> {
  const containerIds = new Set((await db.select({ id: storageContainer.id }).from(storageContainer)).map((r) => r.id))
  const derivations = await db.select({ id: containerDerivation.id, parentContainerId: containerDerivation.parentContainerId, childContainerId: containerDerivation.childContainerId }).from(containerDerivation)
  return derivations
    .filter((d) => !containerIds.has(d.parentContainerId) || !containerIds.has(d.childContainerId))
    .map((d) => ({ id: d.id, parentContainerId: d.parentContainerId, childContainerId: d.childContainerId }))
}

/** storage_container_tag rows with missing storage_container or tag. */
export async function listStorageContainerTagOrphans(db: Database): Promise<StorageContainerTagOrphanItem[]> {
  const containerIds = new Set((await db.select({ id: storageContainer.id }).from(storageContainer)).map((r) => r.id))
  const tagIds = new Set((await db.select({ id: tag.id }).from(tag)).map((r) => r.id))
  const links = await db.select({ storageContainerId: storageContainerTag.storageContainerId, tagId: storageContainerTag.tagId }).from(storageContainerTag)
  return links
    .filter((l) => !containerIds.has(l.storageContainerId) || !tagIds.has(l.tagId))
    .map((l) => ({ storageContainerId: l.storageContainerId, tagId: l.tagId }))
}

/** Barcodes that appear more than once in micronix_tube (unique in schema; duplicate = integrity issue). Cryovial barcodes are not unique and are not treated as an integrity issue. */
export async function listDuplicateBarcodes(db: Database): Promise<DuplicateBarcodeItem[]> {
  const results: DuplicateBarcodeItem[] = []
  const micronixRows = await db.select({ id: micronixTube.id, barcode: micronixTube.barcode }).from(micronixTube)
  const micronixByBarcode = new Map<string, number[]>()
  for (const row of micronixRows) {
    const list = micronixByBarcode.get(row.barcode) ?? []
    list.push(row.id)
    micronixByBarcode.set(row.barcode, list)
  }
  for (const [barcode, ids] of micronixByBarcode) {
    if (ids.length > 1) results.push({ barcode, containerType: 'micronix_tube', ids })
  }
  return results
}

/** Locations whose stored path does not match the path computed from parent chain. */
export async function listLocationPathInconsistencies(db: Database): Promise<LocationPathInconsistencyItem[]> {
  const all = await db.select({ id: location.id, parentId: location.parentId, name: location.name, path: location.path }).from(location)
  const byId = new Map(all.map((r) => [r.id, r]))
  const results: LocationPathInconsistencyItem[] = []
  for (const loc of all) {
    const chain: string[] = []
    let current: (typeof all)[0] | undefined = loc
    let depth = 0
    while (current && depth < 100) {
      chain.unshift(current.name)
      if (current.parentId == null) break
      current = byId.get(current.parentId)
      depth++
    }
    const expectedPath = chain.join(' → ')
    const storedPath = loc.path ?? null
    if (storedPath !== expectedPath) {
      results.push({ id: loc.id, name: loc.name, storedPath, expectedPath })
    }
  }
  return results
}

/** Tube or well Containers in a Collection with no grid position. Informational — not a constraint violation. */
export async function listContainersWithNoGridPosition(db: Database): Promise<ContainerWithNoGridPositionItem[]> {
  const results: ContainerWithNoGridPositionItem[] = []
  const micronix = await db.select({ id: micronixTube.id, collectionId: micronixTube.collectionId, position: micronixTube.position }).from(micronixTube)
  for (const row of micronix) {
    if (row.position == null || row.position.trim() === '') {
      results.push({ id: row.id, containerType: 'micronix_tube', collectionId: row.collectionId })
    }
  }
  const cryovial = await db.select({ id: cryovialTube.id, collectionId: cryovialTube.collectionId, position: cryovialTube.position }).from(cryovialTube)
  for (const row of cryovial) {
    if (row.position == null || row.position.trim() === '') {
      results.push({ id: row.id, containerType: 'cryovial_tube', collectionId: row.collectionId })
    }
  }
  const wells = await db.select({ id: staticWell.id, collectionId: staticWell.collectionId, position: staticWell.position }).from(staticWell)
  for (const row of wells) {
    if (row.position == null || row.position.trim() === '') {
      results.push({ id: row.id, containerType: 'static_well', collectionId: row.collectionId })
    }
  }
  return results
}

/** Build full integrity report (all checks). */
export async function getIntegrityReport(db: Database): Promise<IntegrityReport> {
  const [
    emptyCollections,
    collectionsWithMissingLocation,
    containersWithMissingSpecimen,
    subtypeOrphans,
    sheetsWithMissingBoxOrBag,
    specimensWithMissingSubjectOrBatch,
    studySubjectsWithMissingStudy,
    derivationBrokenRefs,
    storageContainerTagOrphans,
    duplicateBarcodes,
    locationPathInconsistencies,
    containersWithNoGridPosition,
  ] = await Promise.all([
    listEmptyCollections(db),
    listCollectionsWithMissingLocation(db),
    listContainersWithMissingSpecimen(db),
    listSubtypeOrphans(db),
    listSheetsWithMissingBoxOrBag(db),
    listSpecimensWithMissingSubjectOrBatch(db),
    listStudySubjectsWithMissingStudy(db),
    listDerivationBrokenRefs(db),
    listStorageContainerTagOrphans(db),
    listDuplicateBarcodes(db),
    listLocationPathInconsistencies(db),
    listContainersWithNoGridPosition(db),
  ])
  return {
    emptyCollections,
    collectionsWithMissingLocation,
    containersWithMissingSpecimen,
    subtypeOrphans,
    sheetsWithMissingBoxOrBag,
    specimensWithMissingSubjectOrBatch,
    studySubjectsWithMissingStudy,
    derivationBrokenRefs,
    storageContainerTagOrphans,
    duplicateBarcodes,
    locationPathInconsistencies,
    containersWithNoGridPosition,
  }
}
