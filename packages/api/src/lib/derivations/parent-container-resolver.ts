import { and, eq, sql } from 'drizzle-orm'
import {
  controlBatch,
  cryovialBox,
  cryovialTube,
  paper,
  specimen,
  specimenType,
  storageContainer,
  study,
  studySubject,
} from '../../db/schema'
import type { DatabaseOrTransaction } from '../db-types'
import { resolveContainerByBarcode } from '../identifier-resolution'
import type { DerivationCsvRow } from '../derivations-csv'

function parseNumber(value?: string): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

/**
 * Resolve the parent container for a derivation CSV row to a storage-container id.
 *
 * Parents may be identified four ways, tried in order:
 * 1. explicit `parent_container_id`
 * 2. `parent_container_barcode` (any container subtype)
 * 3. control-batch provenance (`parent_control_batch_name` / `_id` + specimen type)
 * 4. study-subject provenance (`parent_study_short_code` + `parent_subject_name` + specimen type)
 *
 * Throws a user-facing error when a parent cannot be resolved.
 */
export async function resolveParentContainerId(
  database: DatabaseOrTransaction,
  row: DerivationCsvRow,
): Promise<number> {
  // 1. Explicit ID
  const explicitId = parseNumber(row.parent_container_id)
  if (explicitId) {
    const existing = await database
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .where(eq(storageContainer.id, explicitId))
      .get()
    if (!existing) {
      throw new Error(`Parent container id '${explicitId}' not found`)
    }
    return explicitId
  }

  // 2. Barcode across known subtypes
  if (row.parent_container_barcode) {
    const barcode = row.parent_container_barcode.trim()
    const containerId = await resolveContainerByBarcode(database, barcode)
    if (containerId != null) return containerId
    throw new Error(`Parent container barcode '${barcode}' not found`)
  }

  // 3. Control batch identification
  if (row.parent_control_batch_name || row.parent_control_batch_id) {
    if (!row.parent_specimen_type_name) {
      throw new Error('Control batch parents require parent_specimen_type_name')
    }

    // Resolve control batch
    let batchId: number | undefined
    if (row.parent_control_batch_id) {
      const batchIdNum = parseNumber(row.parent_control_batch_id)
      if (batchIdNum) {
        const batch = await database
          .select({ id: controlBatch.id })
          .from(controlBatch)
          .where(eq(controlBatch.id, batchIdNum))
          .get()
        if (!batch) {
          throw new Error(`Control batch id '${batchIdNum}' not found`)
        }
        batchId = batch.id
      }
    } else if (row.parent_control_batch_name) {
      const batch = await database
        .select({ id: controlBatch.id })
        .from(controlBatch)
        .where(eq(controlBatch.name, row.parent_control_batch_name.trim()))
        .get()
      if (!batch) {
        throw new Error(`Control batch '${row.parent_control_batch_name}' not found`)
      }
      batchId = batch.id
    }

    if (!batchId) {
      throw new Error('Unable to resolve control batch')
    }

    // Find specimen type
    const typeRec = await database
      .select({ id: specimenType.id })
      .from(specimenType)
      .where(eq(specimenType.name, row.parent_specimen_type_name.trim()))
      .get()
    if (!typeRec) {
      throw new Error(`Specimen type '${row.parent_specimen_type_name}' not found`)
    }

    // Find specimen in batch
    const where = and(
      eq(specimen.controlBatchId, batchId),
      eq(specimen.specimenTypeId, typeRec.id),
      sql`${specimen.studySubjectId} IS NULL`,
    ) as any

    const candidates = await database
      .select({ id: specimen.id })
      .from(specimen)
      .where(row.parent_collection_date
        ? and(where, eq(specimen.collectionDate, row.parent_collection_date.trim())) as any
        : where,
      )

    if (candidates.length === 0) {
      throw new Error(`No ${row.parent_specimen_type_name} specimen found in control batch '${row.parent_control_batch_name || row.parent_control_batch_id}'`)
    }
    if (candidates.length > 1 && !row.parent_collection_date) {
      throw new Error(`Multiple ${row.parent_specimen_type_name} specimens found in batch; add parent_collection_date to disambiguate`)
    }

    const specId = candidates[0].id

    // Determine container type from row or infer
    const containerType = row.parent_container_type || 'paper'

    if (containerType === 'paper') {
      const parentContainer = await database
        .select({ id: storageContainer.id })
        .from(storageContainer)
        .innerJoin(paper, eq(paper.id, storageContainer.id))
        .where(eq(storageContainer.specimenId, specId))
        .get()

      if (!parentContainer) {
        throw new Error(`No paper container found for ${row.parent_specimen_type_name} specimen in control batch`)
      }

      return parentContainer.id
    }

    if (containerType === 'cryovial_tube') {
      if (!row.parent_box_barcode || !row.parent_position) {
        throw new Error('Cryovial control parents require parent_box_barcode and parent_position')
      }
      const box = await database
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.barcode, row.parent_box_barcode.trim()))
        .get()
      if (!box) {
        throw new Error(`Cryovial box barcode '${row.parent_box_barcode}' not found`)
      }
      const tube = await database
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(and(
          eq(cryovialTube.collectionId, box.id),
          eq(cryovialTube.position, row.parent_position.trim()),
        ) as any)
        .get()
      if (!tube) {
        throw new Error(`Cryovial tube not found at position '${row.parent_position}' in box '${row.parent_box_barcode}'`)
      }
      // Verify tube belongs to the specimen
      const container = await database
        .select({ specimenId: storageContainer.specimenId })
        .from(storageContainer)
        .where(eq(storageContainer.id, tube.id))
        .get()
      if (!container || container.specimenId !== specId) {
        throw new Error(`Cryovial tube at position '${row.parent_position}' does not belong to the specified control batch specimen`)
      }
      return tube.id
    }
  }

  const type = row.parent_container_type

  if (type === 'micronix_tube') {
    throw new Error('Micronix parent containers require parent_container_barcode or parent_container_id')
  }

  if (type === 'cryovial_tube') {
    if (!row.parent_box_barcode || !row.parent_position) {
      throw new Error('Cryovial parents require parent_box_barcode and parent_position')
    }
    const box = await database
      .select({ id: cryovialBox.id })
      .from(cryovialBox)
      .where(eq(cryovialBox.barcode, row.parent_box_barcode.trim()))
      .get()
    if (!box) {
      throw new Error(`Cryovial box barcode '${row.parent_box_barcode}' not found`)
    }
    const tube = await database
      .select({ id: cryovialTube.id })
      .from(cryovialTube)
      .where(and(
        eq(cryovialTube.collectionId, box.id),
        eq(cryovialTube.position, row.parent_position.trim()),
      ) as any)
      .get()
    if (!tube) {
      throw new Error(`Cryovial tube not found at position '${row.parent_position}' in box '${row.parent_box_barcode}'`)
    }
    return tube.id
  }

  if (type === 'paper') {
    // Check if it's a control batch or study subject
    if (row.parent_control_batch_name || row.parent_control_batch_id) {
      // Already handled above
      throw new Error('Control batch paper parents should be resolved via control batch logic')
    }

    if (!row.parent_study_short_code || !row.parent_subject_name || !row.parent_specimen_type_name) {
      throw new Error('Paper parents require either control batch identification (parent_control_batch_name + parent_specimen_type_name) or study subject identification (parent_study_short_code + parent_subject_name + parent_specimen_type_name)')
    }

    const studyRec = await database
      .select({ id: study.id })
      .from(study)
      .where(eq(study.shortCode, row.parent_study_short_code.trim()))
      .get()
    if (!studyRec) {
      throw new Error(`Study short code '${row.parent_study_short_code}' not found`)
    }

    const subjectRec = await database
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(and(
        eq(studySubject.studyId, studyRec.id),
        eq(studySubject.name, row.parent_subject_name.trim()),
      ) as any)
      .get()
    if (!subjectRec) {
      throw new Error(`Subject '${row.parent_subject_name}' not found in study '${row.parent_study_short_code}'`)
    }

    const typeRec = await database
      .select({ id: specimenType.id })
      .from(specimenType)
      .where(eq(specimenType.name, row.parent_specimen_type_name.trim()))
      .get()
    if (!typeRec) {
      throw new Error(`Specimen type '${row.parent_specimen_type_name}' not found`)
    }

    const where = and(
      eq(specimen.studySubjectId, subjectRec.id),
      eq(specimen.specimenTypeId, typeRec.id),
    ) as any

    const candidates = await database
      .select({ id: specimen.id })
      .from(specimen)
      .where(row.parent_collection_date
        ? and(where, eq(specimen.collectionDate, row.parent_collection_date.trim())) as any
        : where,
      )

    if (candidates.length === 0) {
      throw new Error('No matching parent specimen/paper container found for subject/specimen criteria')
    }
    if (candidates.length > 1) {
      throw new Error('Multiple candidate parent specimens found; add parent_collection_date or use a more specific identifier')
    }

    const specId = candidates[0].id

    const parentContainer = await database
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .innerJoin(paper, eq(paper.id, storageContainer.id))
      .where(eq(storageContainer.specimenId, specId))
      .get()

    if (!parentContainer) {
      throw new Error('No paper container found for resolved parent specimen')
    }

    return parentContainer.id
  }

  throw new Error('Unable to resolve parent container; provide parent_container_id, parent_container_barcode, or type-specific parent columns')
}
