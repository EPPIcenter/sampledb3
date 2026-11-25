import type { Database } from '../db/client'
import type { CollectionDeletePreflight } from '@sampledb/contract'
import {
  micronixPlate,
  micronixTube,
  staticWell,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  paper,
  sheet,
  storageContainer,
  storageContainerTag,
  containerDerivation,
  specimen,
  studySubject,
  qpcrExperiment,
  qpcrExperimentWell,
} from '../db/schema'
import { and, eq, inArray, or, sql, isNotNull } from 'drizzle-orm'
import { NotFoundError, CollectionDeleteBlockedError, type CollectionDeleteBlocker } from './error-handler'
import { withWriteTransaction } from '../db/write-transaction'

const SQLITE_BATCH = 500

function runBatch<T>(ids: T[], fn: (batch: T[]) => void): void {
  for (let i = 0; i < ids.length; i += SQLITE_BATCH) {
    fn(ids.slice(i, i + SQLITE_BATCH) as T[])
  }
}

export type CollectionEntityType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

const DELETE_SUMMARY =
  'This collection cannot be deleted while some containers or specimens are still used elsewhere. Fix the items below, then try again.'

export interface DeleteCollectionWithContentsRequest {
  type: CollectionEntityType
  id: number
  removeEmptySubjects: boolean
}

export interface DeleteCollectionWithContentsResult {
  containersDeleted: number
  specimensDeleted: number
  sheetsDeleted: number
  collectionDeleted: true
  subjectsDeleted: number
}

/** Per-kind table access. A Record, so adding a CollectionEntityType fails to compile until it has an entry. */
interface CollectionKind {
  label: string
  /** All storage_container ids in the collection (tubes, wells, papers). */
  containerIds(database: Database, id: number): number[]
  exists(database: Database, id: number): boolean
  /** Deletes the collection row (and a box's or bag's sheets); returns the number of sheets deleted. */
  deleteRow(database: Database, id: number): number
}

function paperIdsOnSheets(database: Database, sheetColumn: typeof sheet.boxId | typeof sheet.bagId, id: number): number[] {
  return database
    .select({ id: paper.id })
    .from(paper)
    .innerJoin(sheet, eq(paper.sheetId, sheet.id))
    .where(eq(sheetColumn, id))
    .all()
    .map((x) => x.id)
}

function deleteSheets(database: Database, sheetColumn: typeof sheet.boxId | typeof sheet.bagId, id: number): number {
  return database.delete(sheet).where(eq(sheetColumn, id)).returning({ id: sheet.id }).all().length
}

const COLLECTION_KINDS: Record<CollectionEntityType, CollectionKind> = {
  micronix_plate: {
    label: 'Micronix plate',
    containerIds: (database, id) => [
      ...database.select({ id: micronixTube.id }).from(micronixTube).where(eq(micronixTube.collectionId, id)).all(),
      ...database.select({ id: staticWell.id }).from(staticWell).where(eq(staticWell.collectionId, id)).all(),
    ].map((x) => x.id),
    exists: (database, id) =>
      database.select({ id: micronixPlate.id }).from(micronixPlate).where(eq(micronixPlate.id, id)).get() != null,
    deleteRow: (database, id) => {
      requireDeleted(database.delete(micronixPlate).where(eq(micronixPlate.id, id)).returning().all(), 'Micronix plate', id)
      return 0
    },
  },
  cryovial_box: {
    label: 'Cryovial box',
    containerIds: (database, id) =>
      database
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(eq(cryovialTube.collectionId, id))
        .all()
        .map((x) => x.id),
    exists: (database, id) =>
      database.select({ id: cryovialBox.id }).from(cryovialBox).where(eq(cryovialBox.id, id)).get() != null,
    deleteRow: (database, id) => {
      requireDeleted(database.delete(cryovialBox).where(eq(cryovialBox.id, id)).returning().all(), 'Cryovial box', id)
      return 0
    },
  },
  box: {
    label: 'Box',
    containerIds: (database, id) => paperIdsOnSheets(database, sheet.boxId, id),
    exists: (database, id) => database.select({ id: box.id }).from(box).where(eq(box.id, id)).get() != null,
    deleteRow: (database, id) => {
      const sheetsDeleted = deleteSheets(database, sheet.boxId, id)
      requireDeleted(database.delete(box).where(eq(box.id, id)).returning().all(), 'Box', id)
      return sheetsDeleted
    },
  },
  bag: {
    label: 'Bag',
    containerIds: (database, id) => paperIdsOnSheets(database, sheet.bagId, id),
    exists: (database, id) => database.select({ id: bag.id }).from(bag).where(eq(bag.id, id)).get() != null,
    deleteRow: (database, id) => {
      const sheetsDeleted = deleteSheets(database, sheet.bagId, id)
      requireDeleted(database.delete(bag).where(eq(bag.id, id)).returning().all(), 'Bag', id)
      return sheetsDeleted
    },
  },
}

function requireDeleted(rows: unknown[], label: string, id: number): void {
  if (rows.length === 0) throw new NotFoundError(label, id)
}

/** Collect all storage_container ids in this collection (tubes, wells, papers, etc.) */
export async function collectContainerIdsInCollection(
  database: Database,
  type: CollectionEntityType,
  id: number
): Promise<number[]> {
  return COLLECTION_KINDS[type].containerIds(database, id)
}

function ensureCollectionRowExists(database: Database, type: CollectionEntityType, id: number): void {
  const kind = COLLECTION_KINDS[type]
  if (!kind.exists(database, id)) throw new NotFoundError(kind.label, id)
}

/**
 * For each distinct specimen on this batch, specimen is "fully removed" if every
 * `storage_container` for that specimen is in `containerIdSet`.
 */
export async function computeSpecimensFullyRemovedByContainerBatch(
  database: Database,
  containerIdSet: ReadonlySet<number>
): Promise<number[]> {
  if (containerIdSet.size === 0) return []
  const ids = [...containerIdSet]
  const inBatch = await database
    .select({ specimenId: storageContainer.specimenId, id: storageContainer.id })
    .from(storageContainer)
    .where(inArray(storageContainer.id, ids))
    .all()
  const distinctSpecimenIds = [...new Set(inBatch.map((r) => r.specimenId))]
  const toRemove: number[] = []
  for (const sid of distinctSpecimenIds) {
    const total = await database
      .select({ c: sql<number>`COUNT(*)`.as('c') })
      .from(storageContainer)
      .where(eq(storageContainer.specimenId, sid))
      .get()
    const totalC = total?.c ?? 0
    if (totalC === 0) continue
    const inCount = inBatch.filter((r) => r.specimenId === sid).length
    if (inCount === totalC) toRemove.push(sid)
  }
  return toRemove
}

function buildQpcrContainerBlockers(
  links: { wellId: number; experimentId: number; experimentName: string | null; wellPosition: string; storageId: number }[]
): CollectionDeleteBlocker {
  const n = links.length
  const exLabel = (row: (typeof links)[0]) => {
    const name = row.experimentName?.trim() ? `"${row.experimentName}"` : `#${row.experimentId}`
    return `qPCR experiment ${name}, well ${row.wellPosition}`
  }
  const first = exLabel(links[0]!)
  const more = n > 1 ? ` and ${n - 1} other well${n - 1 === 1 ? '' : 's'}` : ''
  return {
    code: 'qpcr_wells_link_storage_containers',
    message: `At least one physical container in this collection is still assigned in qPCR. Remove those assignments in the qPCR feature first. Example: ${first}${more}.`,
    qpcrExperimentId: links[0]!.experimentId,
    qpcrWellId: links[0]!.wellId,
    wellPosition: links[0]!.wellPosition,
    storageContainerId: links[0]!.storageId,
  }
}

function buildQpcrSpecimenBlockers(
  links: { wellId: number; experimentId: number; experimentName: string | null; wellPosition: string; specimenId: number }[]
): CollectionDeleteBlocker {
  const n = links.length
  const row = links[0]!
  const name = row.experimentName?.trim() ? `"${row.experimentName}"` : `#${row.experimentId}`
  const more = n > 1 ? ` and ${n - 1} other well${n - 1 === 1 ? '' : 's'}` : ''
  return {
    code: 'qpcr_wells_link_specimens',
    message: `At least one specimen you are removing is still linked from qPCR wells. Unassign the specimen in qPCR (or the whole well) and try again. Example: qPCR ${name}, well ${row.wellPosition}${more}.`,
    qpcrExperimentId: row.experimentId,
    qpcrWellId: row.wellId,
    wellPosition: row.wellPosition,
    specimenId: row.specimenId,
  }
}

async function runPreflight(
  database: Database,
  containerIdSet: ReadonlySet<number>,
  specimensFullyRemoved: number[]
): Promise<CollectionDeleteBlocker[]> {
  const blockers: CollectionDeleteBlocker[] = []
  const containerIdList = [...containerIdSet]
  if (containerIdList.length > 0) {
    const q1 = await database
      .select({
        wellId: qpcrExperimentWell.id,
        experimentId: qpcrExperiment.id,
        experimentName: qpcrExperiment.name,
        wellPosition: qpcrExperimentWell.wellPosition,
        storageId: qpcrExperimentWell.storageContainerId,
      })
      .from(qpcrExperimentWell)
      .innerJoin(qpcrExperiment, eq(qpcrExperimentWell.qpcrExperimentId, qpcrExperiment.id))
      .where(
        and(
          isNotNull(qpcrExperimentWell.storageContainerId),
          inArray(qpcrExperimentWell.storageContainerId, containerIdList)
        )
      )
      .all()
    if (q1.length > 0) {
      blockers.push(
        buildQpcrContainerBlockers(
          q1.map((r) => ({
            wellId: r.wellId,
            experimentId: r.experimentId,
            experimentName: r.experimentName,
            wellPosition: r.wellPosition,
            storageId: r.storageId!,
          }))
        )
      )
    }
  }

  const specList = [...new Set(specimensFullyRemoved)]
  if (specList.length > 0) {
    const q2 = await database
      .select({
        wellId: qpcrExperimentWell.id,
        experimentId: qpcrExperiment.id,
        experimentName: qpcrExperiment.name,
        wellPosition: qpcrExperimentWell.wellPosition,
        specimenId: qpcrExperimentWell.specimenId,
      })
      .from(qpcrExperimentWell)
      .innerJoin(qpcrExperiment, eq(qpcrExperimentWell.qpcrExperimentId, qpcrExperiment.id))
      .where(and(isNotNull(qpcrExperimentWell.specimenId), inArray(qpcrExperimentWell.specimenId, specList)))
      .all()
    if (q2.length > 0) {
      blockers.push(
        buildQpcrSpecimenBlockers(
          q2.map((r) => ({
            wellId: r.wellId,
            experimentId: r.experimentId,
            experimentName: r.experimentName,
            wellPosition: r.wellPosition,
            specimenId: r.specimenId!,
          }))
        )
      )
    }
  }

  if (containerIdList.length > 0) {
    const touches = await database
      .select()
      .from(containerDerivation)
      .where(
        or(
          inArray(containerDerivation.parentContainerId, containerIdList),
          inArray(containerDerivation.childContainerId, containerIdList)
        )
      )
      .all()
    for (const d of touches) {
      const pIn = containerIdSet.has(d.parentContainerId)
      const cIn = containerIdSet.has(d.childContainerId)
      if (pIn === cIn) continue
      // Allow deleting only the *child* side: removing derived containers does not break the
      // upstream parent chain. Block when we would remove a *parent* while a derived *child* exists
      // outside this collection.
      if (pIn && !cIn) {
        blockers.push({
          code: 'container_derivation_spans_outside_collection',
          message: `A container in this collection is the parent in a parent–child (derivation) relationship, but the derived child (container id ${d.childContainerId}) is stored elsewhere. Remove or move the child, or break the derivation, before deleting this collection (parent in this collection is id ${d.parentContainerId}).`,
          containerDerivationId: d.id,
          inCollectionContainerId: d.parentContainerId,
          outsideContainerId: d.childContainerId,
          outsideRole: 'child',
        })
      }
    }
  }

  return blockers
}

export async function preflightCollectionDelete(
  database: Database,
  request: Pick<DeleteCollectionWithContentsRequest, 'type' | 'id'>
): Promise<CollectionDeletePreflight> {
  ensureCollectionRowExists(database, request.type, request.id)

  const containerIdList = await collectContainerIdsInCollection(database, request.type, request.id)
  const containerIdSet = new Set(containerIdList)
  const fullyRemovedSpecimenIds = await computeSpecimensFullyRemovedByContainerBatch(database, containerIdSet)
  const blockers = await runPreflight(database, containerIdSet, fullyRemovedSpecimenIds)

  return {
    canDelete: blockers.length === 0,
    blockers: blockers.map(({ code, message }) => ({ code, message })),
    summary: {
      containerCount: containerIdList.length,
      specimenCount: fullyRemovedSpecimenIds.length,
    },
  }
}

/**
 * Deletes a collection, all of its child containers, specimens with no remaining containers, and optionally
 * empty study subjects. Throws `NotFoundError` or `CollectionDeleteBlockedError`.
 */
export async function deleteCollectionWithContents(
  database: Database,
  request: DeleteCollectionWithContentsRequest
): Promise<DeleteCollectionWithContentsResult> {
  const { type, id, removeEmptySubjects } = request

  ensureCollectionRowExists(database, type, id)

  const containerIdList = await collectContainerIdsInCollection(database, type, id)
  const containerIdSet = new Set(containerIdList)
  const fullyRemovedSpecimenIds = await computeSpecimensFullyRemovedByContainerBatch(database, containerIdSet)
  const blockers = await runPreflight(database, containerIdSet, fullyRemovedSpecimenIds)
  if (blockers.length > 0) {
    throw new CollectionDeleteBlockedError(DELETE_SUMMARY, blockers)
  }

  const specimensToDelete = new Set(fullyRemovedSpecimenIds)
  const specimenRows =
    specimensToDelete.size > 0
      ? await database
          .select({ id: specimen.id, studySubjectId: specimen.studySubjectId })
          .from(specimen)
          .where(inArray(specimen.id, [...specimensToDelete]))
          .all()
      : []
  const subjectCandidates = [
    ...new Set(
      specimenRows.map((s) => s.studySubjectId).filter((x): x is number => x != null && !Number.isNaN(x))
    ),
  ]

  let sheetsDeleted = 0
  let subjectsDeleted = 0

  await withWriteTransaction(database, async (tx) => {
    const cids = [...containerIdSet]
    if (cids.length > 0) {
      runBatch(cids, (batch) => {
        tx.delete(storageContainerTag).where(inArray(storageContainerTag.storageContainerId, batch)).run()
      })
      runBatch(cids, (batch) => {
        tx
          .delete(containerDerivation)
          .where(
            or(
              inArray(containerDerivation.parentContainerId, batch),
              inArray(containerDerivation.childContainerId, batch)
            )
          )
          .run()
      })
      runBatch(cids, (batch) => {
        tx.delete(paper).where(inArray(paper.id, batch)).run()
        tx.delete(micronixTube).where(inArray(micronixTube.id, batch)).run()
        tx.delete(cryovialTube).where(inArray(cryovialTube.id, batch)).run()
        tx.delete(staticWell).where(inArray(staticWell.id, batch)).run()
      })
      runBatch(cids, (batch) => {
        tx.delete(storageContainer).where(inArray(storageContainer.id, batch)).run()
      })
    }
    if (fullyRemovedSpecimenIds.length > 0) {
      const spIds = fullyRemovedSpecimenIds
      runBatch(spIds, (batch) => {
        tx.delete(specimen).where(inArray(specimen.id, batch)).run()
      })
    }

    if (removeEmptySubjects && subjectCandidates.length > 0) {
      for (const subId of subjectCandidates) {
        const r = await tx
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(specimen)
          .where(eq(specimen.studySubjectId, subId))
          .get()
        const n = r?.n ?? 0
        if (n === 0) {
          tx.delete(studySubject).where(eq(studySubject.id, subId)).run()
          subjectsDeleted++
        }
      }
    }

    sheetsDeleted = COLLECTION_KINDS[type].deleteRow(tx, id)
  })

  return {
    containersDeleted: containerIdList.length,
    specimensDeleted: fullyRemovedSpecimenIds.length,
    sheetsDeleted,
    collectionDeleted: true,
    subjectsDeleted,
  }
}
