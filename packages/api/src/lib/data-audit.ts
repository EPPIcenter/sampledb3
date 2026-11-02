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
  specimenType,
  specimenTypeContainerType,
} from '../db/schema'
import { and, asc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import { isIsoCalendarDate } from './date-filters'
import { foldNameCase, localToday, subjectNameKey } from './validation'
import { isStoredGridPosition, type GridCollectionType } from '@sampledb/contract'

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

/** Tubes whose barcodes are equal ignoring case and surrounding whitespace. */
export interface DuplicateBarcodeItem {
  /** The barcode as most of the group spells it. */
  barcode: string
  /** Every stored spelling in the group; more than one means case or whitespace variants. */
  variants: string[]
  containerTypes: Array<'micronix_tube' | 'cryovial_tube'>
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

export interface SpecimenWithNonIsoCollectionDateItem {
  id: number
  collectionDate: string
}

export interface ContainerWithInvalidGridPositionItem {
  id: number
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well'
  collectionId: number
  /** The stored position, as stored. */
  position: string
}

/**
 * Subject Specimens that share a Subject, Specimen type and collection date (CONTEXT.md,
 * Specimen identity). Existing groups stay until someone merges them by hand.
 */
export interface DuplicateSpecimenIdentityItem {
  studyId: number
  studyShortCode: string
  subjectId: number
  subjectName: string
  specimenTypeId: number
  specimenTypeName: string
  /** Absent for undated Specimens. */
  collectionDate?: string
  specimenIds: number[]
}

/** Subjects in one Study whose names differ only by case (CONTEXT.md, Subject). */
export interface CaseVariantSubjectNameItem {
  studyId: number
  studyShortCode: string
  subjects: Array<{ id: number; name: string }>
}

/**
 * Collections of one type whose names differ only by case or surrounding spaces. Sheets are
 * compared within their box or bag.
 */
export interface CaseVariantCollectionNameItem {
  type: CollectionType | 'sheet'
  /** The box or bag holding the sheets; absent for other Collection types. */
  parent?: { type: 'box' | 'bag'; id: number }
  collections: Array<{ id: number; name: string }>
}

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

/** Containers whose Container type is not one their Specimen type allows. */
export interface ContainerInDisallowedContainerTypeItem {
  id: number
  containerType: ContainerType
  specimenId: number
  specimenTypeId: number
  specimenTypeName: string
}

/** Containers commented "exhausted" whose remaining quantity is above 0, so they show as In Use. */
export interface ExhaustedContainerWithRemainingQuantityItem {
  id: number
  comment: string
  remainingQuantity: number
}

export interface SpecimenCollectionDateItem {
  id: number
  collectionDate: string
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
  specimensWithNonIsoCollectionDate: SpecimenWithNonIsoCollectionDateItem[]
  containersWithInvalidGridPosition: ContainerWithInvalidGridPositionItem[]
  duplicateSpecimenIdentities: DuplicateSpecimenIdentityItem[]
  caseVariantSubjectNames: CaseVariantSubjectNameItem[]
  caseVariantCollectionNames: CaseVariantCollectionNameItem[]
  containersInDisallowedContainerType: ContainerInDisallowedContainerTypeItem[]
  exhaustedContainersWithRemainingQuantity: ExhaustedContainerWithRemainingQuantityItem[]
  specimensWithPlaceholderCollectionDate: SpecimenCollectionDateItem[]
  specimensWithFutureCollectionDate: SpecimenCollectionDateItem[]
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

/**
 * Tube barcodes on more than one tube, across micronix and cryovial tubes, comparing trimmed
 * and case-folded values so `CK3-3FR4` and `ck3-3fr4 ` count as one barcode. Barcode lookups
 * refuse to choose between such tubes, and new or changed tube barcodes can't add to them.
 */
export async function listDuplicateBarcodes(db: Database): Promise<DuplicateBarcodeItem[]> {
  const rows = [
    ...(await db.select({ id: micronixTube.id, barcode: micronixTube.barcode }).from(micronixTube)).map((row) => ({
      ...row,
      containerType: 'micronix_tube' as const,
    })),
    ...(await db
      .select({ id: cryovialTube.id, barcode: cryovialTube.barcode })
      .from(cryovialTube)
      .where(sql`${cryovialTube.barcode} IS NOT NULL AND trim(${cryovialTube.barcode}) != ''`)).map((row) => ({
      id: row.id,
      barcode: row.barcode ?? '',
      containerType: 'cryovial_tube' as const,
    })),
  ]
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.barcode.trim().toLowerCase()
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  const results: DuplicateBarcodeItem[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const spellings = new Map<string, number>()
    for (const row of group) spellings.set(row.barcode, (spellings.get(row.barcode) ?? 0) + 1)
    const variants = [...spellings.keys()].sort()
    const barcode = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    results.push({
      barcode,
      variants,
      containerTypes: [...new Set(group.map((row) => row.containerType))].sort(),
      ids: group.map((row) => row.id).sort((a, b) => a - b),
    })
  }
  return results.sort((a, b) => a.barcode.localeCompare(b.barcode))
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

/**
 * Specimens whose collection date is not a real YYYY-MM-DD date (issue #104). Dates are compared
 * as strings, so such a Specimen falls outside date filters, selections and summaries.
 */
export async function listSpecimensWithNonIsoCollectionDate(db: Database): Promise<SpecimenWithNonIsoCollectionDateItem[]> {
  const rows = await db
    .select({ id: specimen.id, collectionDate: specimen.collectionDate })
    .from(specimen)
    .where(sql`${specimen.collectionDate} IS NOT NULL AND date(${specimen.collectionDate}) IS NOT ${specimen.collectionDate}`)
    .orderBy(specimen.id)
  return rows
    .map((row) => ({ id: row.id, collectionDate: String(row.collectionDate) }))
    .filter((row) => !isIsoCalendarDate(row.collectionDate))
}

/**
 * Tube or well Containers whose stored position fails the Grid position rule for their
 * Collection, or is not in the stored form the rule produces (`A1` instead of `A01`).
 * Occupancy compares stored strings, so such a Container is unplaced and its cell can be
 * double-booked.
 */
export async function listContainersWithInvalidGridPosition(db: Database): Promise<ContainerWithInvalidGridPositionItem[]> {
  const sources = [
    { containerType: 'micronix_tube', gridType: 'micronix_plate', table: micronixTube },
    { containerType: 'cryovial_tube', gridType: 'cryovial_box', table: cryovialTube },
    { containerType: 'static_well', gridType: 'micronix_plate', table: staticWell },
  ] as const satisfies ReadonlyArray<{ containerType: ContainerWithInvalidGridPositionItem['containerType']; gridType: GridCollectionType; table: unknown }>
  const results: ContainerWithInvalidGridPositionItem[] = []
  for (const { containerType, gridType, table } of sources) {
    const rows = await db
      .select({ id: table.id, collectionId: table.collectionId, position: table.position })
      .from(table)
      .where(isNotNull(table.position))
    for (const row of rows) {
      if (row.position != null && !isStoredGridPosition(row.position, gridType)) {
        results.push({ id: row.id, containerType, collectionId: row.collectionId, position: row.position })
      }
    }
  }
  return results
}

/** Group `items` by `key`, keeping only groups with more than one item, in first-seen order. */
function groupsOfMany<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return [...groups.values()].filter((group) => group.length > 1)
}

/**
 * Subject Specimens that share a Subject, Specimen type and collection date, including undated
 * ones (CONTEXT.md, Specimen identity). Production has no unique index on this combination.
 */
export async function listDuplicateSpecimenIdentities(db: Database): Promise<DuplicateSpecimenIdentityItem[]> {
  const groups = await db
    .select({
      subjectId: specimen.studySubjectId,
      specimenTypeId: specimen.specimenTypeId,
      collectionDate: specimen.collectionDate,
      ids: sql<string>`group_concat(${specimen.id})`,
    })
    .from(specimen)
    .where(isNotNull(specimen.studySubjectId))
    .groupBy(specimen.studySubjectId, specimen.specimenTypeId, specimen.collectionDate)
    .having(sql`COUNT(*) > 1`)
    .orderBy(asc(specimen.studySubjectId), asc(specimen.specimenTypeId), asc(specimen.collectionDate))
  if (groups.length === 0) return []
  const subjectIds = [...new Set(groups.map((g) => g.subjectId!))]
  const subjects = new Map(
    (
      await db
        .select({ id: studySubject.id, name: studySubject.name, studyId: studySubject.studyId, shortCode: study.shortCode })
        .from(studySubject)
        .leftJoin(study, eq(study.id, studySubject.studyId))
        .where(inArray(studySubject.id, subjectIds))
    ).map((row) => [row.id, row]),
  )
  const typeNames = new Map((await db.select({ id: specimenType.id, name: specimenType.name }).from(specimenType)).map((row) => [row.id, row.name]))
  return groups.map((group) => {
    const subject = subjects.get(group.subjectId!)
    return {
      studyId: subject?.studyId ?? 0,
      studyShortCode: subject?.shortCode ?? '',
      subjectId: group.subjectId!,
      subjectName: subject?.name ?? '',
      specimenTypeId: group.specimenTypeId,
      specimenTypeName: typeNames.get(group.specimenTypeId) ?? '',
      ...(group.collectionDate == null ? {} : { collectionDate: String(group.collectionDate) }),
      specimenIds: group.ids.split(',').map(Number).sort((a, b) => a - b),
    }
  })
}

/** Subjects in one Study whose names differ only by case, which the Subject name rule forbids. */
export async function listCaseVariantSubjectNames(db: Database): Promise<CaseVariantSubjectNameItem[]> {
  const subjects = await db
    .select({ id: studySubject.id, name: studySubject.name, studyId: studySubject.studyId, shortCode: study.shortCode })
    .from(studySubject)
    .leftJoin(study, eq(study.id, studySubject.studyId))
    .orderBy(asc(studySubject.studyId), asc(studySubject.id))
  return groupsOfMany(subjects, (s) => subjectNameKey(s.studyId, s.name)).map((group) => ({
    studyId: group[0]!.studyId,
    studyShortCode: group[0]!.shortCode ?? '',
    subjects: group.map((s) => ({ id: s.id, name: s.name })),
  }))
}

/**
 * Collections of one type (sheets: within one box or bag) whose names differ only by case or
 * surrounding spaces. Names spelled exactly alike are not listed: plate, box and bag names are
 * unique, and a bag may hold two sheets of the same name.
 */
export async function listCaseVariantCollectionNames(db: Database): Promise<CaseVariantCollectionNameItem[]> {
  const topLevel: Array<{ type: CollectionType; rows: Array<{ id: number; name: string }> }> = [
    { type: 'micronix_plate', rows: await db.select({ id: micronixPlate.id, name: micronixPlate.name }).from(micronixPlate).orderBy(micronixPlate.id) },
    { type: 'cryovial_box', rows: await db.select({ id: cryovialBox.id, name: cryovialBox.name }).from(cryovialBox).orderBy(cryovialBox.id) },
    { type: 'box', rows: await db.select({ id: box.id, name: box.name }).from(box).orderBy(box.id) },
    { type: 'bag', rows: await db.select({ id: bag.id, name: bag.name }).from(bag).orderBy(bag.id) },
  ]
  const results: CaseVariantCollectionNameItem[] = []
  const hasVariants = (group: Array<{ name: string }>) => new Set(group.map((c) => c.name)).size > 1
  for (const { type, rows } of topLevel) {
    for (const group of groupsOfMany(rows, (c) => foldNameCase(c.name)).filter(hasVariants)) {
      results.push({ type, collections: group.map((c) => ({ id: c.id, name: c.name })) })
    }
  }
  const sheets = await db.select({ id: sheet.id, name: sheet.name, boxId: sheet.boxId, bagId: sheet.bagId }).from(sheet).orderBy(sheet.id)
  for (const group of groupsOfMany(sheets, (s) => `${s.boxId ?? ''}:${s.bagId ?? ''}:${foldNameCase(s.name)}`).filter(hasVariants)) {
    const first = group[0]!
    const parent = first.boxId != null ? { type: 'box' as const, id: first.boxId } : first.bagId != null ? { type: 'bag' as const, id: first.bagId } : undefined
    results.push({
      type: 'sheet',
      ...(parent ? { parent } : {}),
      collections: group.map((s) => ({ id: s.id, name: s.name })),
    })
  }
  return results
}

/** Containers whose Container type their Specimen type does not allow (specimen_type_container_type). */
export async function listContainersInDisallowedContainerType(db: Database): Promise<ContainerInDisallowedContainerTypeItem[]> {
  const sources = [
    { containerType: 'micronix_tube', table: micronixTube },
    { containerType: 'cryovial_tube', table: cryovialTube },
    { containerType: 'paper', table: paper },
    { containerType: 'static_well', table: staticWell },
  ] as const
  const results: ContainerInDisallowedContainerTypeItem[] = []
  for (const { containerType, table } of sources) {
    const rows = await db
      .select({
        id: storageContainer.id,
        specimenId: specimen.id,
        specimenTypeId: specimenType.id,
        specimenTypeName: specimenType.name,
      })
      .from(table)
      .innerJoin(storageContainer, eq(storageContainer.id, table.id))
      .innerJoin(specimen, eq(specimen.id, storageContainer.specimenId))
      .innerJoin(specimenType, eq(specimenType.id, specimen.specimenTypeId))
      .where(
        sql`NOT EXISTS (SELECT 1 FROM ${specimenTypeContainerType} WHERE ${specimenTypeContainerType.specimenTypeId} = ${specimen.specimenTypeId} AND ${specimenTypeContainerType.containerType} = ${containerType})`,
      )
    for (const row of rows) results.push({ ...row, containerType })
  }
  return results.sort((a, b) => a.id - b.id)
}

/** Containers commented "exhausted" (any case) whose remaining quantity is above 0. */
export async function listExhaustedContainersWithRemainingQuantity(db: Database): Promise<ExhaustedContainerWithRemainingQuantityItem[]> {
  const rows = await db
    .select({ id: storageContainer.id, comment: storageContainer.comment, remainingQuantity: storageContainer.remainingQuantity })
    .from(storageContainer)
    .where(and(sql`${storageContainer.comment} LIKE '%exhausted%'`, gt(storageContainer.remainingQuantity, 0)))
    .orderBy(storageContainer.id)
  return rows.map((row) => ({ id: row.id, comment: row.comment ?? '', remainingQuantity: row.remainingQuantity ?? 0 }))
}

/**
 * Dates commonly stored for an unknown collection date: the Unix epoch, the spreadsheet zero
 * date, and two fill-in values legacy tools used. A real collection is rarely on one of them.
 */
export const PLACEHOLDER_COLLECTION_DATES = ['1970-01-01', '1999-09-09', '1899-12-30', '1111-01-01'] as const

/** Specimens dated with a known placeholder collection date. */
export async function listSpecimensWithPlaceholderCollectionDate(db: Database): Promise<SpecimenCollectionDateItem[]> {
  const rows = await db
    .select({ id: specimen.id, collectionDate: specimen.collectionDate })
    .from(specimen)
    .where(inArray(specimen.collectionDate, [...PLACEHOLDER_COLLECTION_DATES]))
    .orderBy(specimen.id)
  return rows.map((row) => ({ id: row.id, collectionDate: String(row.collectionDate) }))
}

/**
 * Specimens with a YYYY-MM-DD collection date after today on the server. New dates in the future
 * are refused on write; ones stored earlier are corrected by hand.
 */
export async function listSpecimensWithFutureCollectionDate(db: Database): Promise<SpecimenCollectionDateItem[]> {
  const rows = await db
    .select({ id: specimen.id, collectionDate: specimen.collectionDate })
    .from(specimen)
    .where(and(sql`date(${specimen.collectionDate}) IS ${specimen.collectionDate}`, gt(specimen.collectionDate, localToday())))
    .orderBy(specimen.id)
  return rows.map((row) => ({ id: row.id, collectionDate: String(row.collectionDate) }))
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
    specimensWithNonIsoCollectionDate,
    containersWithInvalidGridPosition,
    duplicateSpecimenIdentities,
    caseVariantSubjectNames,
    caseVariantCollectionNames,
    containersInDisallowedContainerType,
    exhaustedContainersWithRemainingQuantity,
    specimensWithPlaceholderCollectionDate,
    specimensWithFutureCollectionDate,
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
    listSpecimensWithNonIsoCollectionDate(db),
    listContainersWithInvalidGridPosition(db),
    listDuplicateSpecimenIdentities(db),
    listCaseVariantSubjectNames(db),
    listCaseVariantCollectionNames(db),
    listContainersInDisallowedContainerType(db),
    listExhaustedContainersWithRemainingQuantity(db),
    listSpecimensWithPlaceholderCollectionDate(db),
    listSpecimensWithFutureCollectionDate(db),
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
    specimensWithNonIsoCollectionDate,
    containersWithInvalidGridPosition,
    duplicateSpecimenIdentities,
    caseVariantSubjectNames,
    caseVariantCollectionNames,
    containersInDisallowedContainerType,
    exhaustedContainersWithRemainingQuantity,
    specimensWithPlaceholderCollectionDate,
    specimensWithFutureCollectionDate,
  }
}
