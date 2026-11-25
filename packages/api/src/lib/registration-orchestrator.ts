/**
 * POST /specimens/bulk and its validate route. Each row's Source is resolved here; Specimens and
 * Containers go through Specimen registration (ADR 0010), and validation is the same
 * registration, rolled back.
 */
import type { Database } from '../db/client'
import type { specimen } from '../db/schema'
import { ConflictError } from './error-handler'
import { validateSpecimenData } from './validation'
import { withRolledBackTransaction, withWriteTransaction } from '../db/write-transaction'
import {
  RefusedWithErrors,
  registerSpecimens,
  SpecimenRegistrationError,
  type RegistrationContainer,
  type RegistrationEntry,
  type RegistrationError,
  type RegistrationResult,
} from './specimen-registration'

export type BulkSpecimenContainerInput = Omit<RegistrationContainer, 'containerType'> & {
  containerType?: RegistrationContainer['containerType']
}

export type BulkSpecimenValidateRow = {
  sourceType: 'subject' | 'control'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeName: string
  collectionDate?: string
  container?: BulkSpecimenContainerInput
}

export type BulkSpecimenValidateError = {
  index: number
  message: string
}

export type BulkSpecimenValidateResult = {
  valid: boolean
  errors: BulkSpecimenValidateError[]
}

export type BulkSpecimenCreateResult = {
  specimens: Array<typeof specimen.$inferSelect>
  created: number
  containersCreated: number
}

/** A row's container, if it names a container type; rows without one register only the Specimen. */
function rowContainers(row: BulkSpecimenValidateRow): RegistrationContainer[] {
  const container = row.container
  if (!container?.containerType) return []
  return [container as RegistrationContainer]
}

/** Resolve each row's Source and specimen type into a registration entry, or a row error. */
async function toRegistrationEntries(
  database: Database,
  rows: BulkSpecimenValidateRow[],
): Promise<{ entries: RegistrationEntry[]; rowOfEntry: number[]; errors: BulkSpecimenValidateError[] }> {
  const entries: RegistrationEntry[] = []
  const rowOfEntry: number[] = []
  const errors: BulkSpecimenValidateError[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const validation = await validateSpecimenData(
      {
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        studyShortCode: row.studyShortCode,
        subjectName: row.subjectName,
        specimenTypeName: row.specimenTypeName,
        collectionDate: row.collectionDate,
      },
      database,
    )
    const resolved = validation.resolved
    if (!validation.valid || !resolved) {
      errors.push({ index, message: validation.error ?? 'Invalid specimen data' })
      continue
    }
    const source =
      resolved.studySubjectId != null
        ? { subjectId: resolved.studySubjectId }
        : resolved.controlBatchId != null
          ? { controlBatchId: resolved.controlBatchId }
          : null
    if (!source) {
      errors.push({ index, message: 'Invalid specimen data' })
      continue
    }
    entries.push({
      source,
      specimenTypeId: resolved.specimenTypeId,
      collectionDate: resolved.collectionDate,
      containers: rowContainers(row),
    })
    rowOfEntry.push(index)
  }

  return { entries, rowOfEntry, errors }
}

function rowErrors(errors: RegistrationError[], rowOfEntry: number[]): BulkSpecimenValidateError[] {
  return errors.map((error) => ({ index: rowOfEntry[error.entryIndex], message: error.message }))
}

/** The rows could not all be registered; errors are keyed to the rows. */
class BulkSpecimensRejected extends RefusedWithErrors<BulkSpecimenValidateError> {}

/**
 * Resolve every row, then register the rows that resolved. Runs inside the caller's transaction,
 * so the Source and specimen type reads see what the registration sees, and throws
 * BulkSpecimensRejected with every row's problems: the ones found resolving the rows and the
 * ones registration finds in the rest. The caller's transaction then rolls back.
 */
async function registerBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[],
  userId: number | undefined,
): Promise<RegistrationResult> {
  const { entries, rowOfEntry, errors } = await toRegistrationEntries(database, rows)

  let registration: RegistrationResult | null = null
  try {
    registration = await registerSpecimens(database, entries, { userId })
  } catch (error) {
    if (!(error instanceof SpecimenRegistrationError)) throw error
    const mapped = rowErrors(error.errors, rowOfEntry)
    // A constraint hit is a conflict only when it is all that is wrong; rows that did not
    // resolve make the input invalid, and the constraint is listed with them.
    if (error.status === 409 && errors.length === 0) throw new BulkSpecimensRejected(409, mapped)
    errors.push(...mapped)
  }
  if (errors.length > 0 || !registration) {
    errors.sort((a, b) => a.index - b.index)
    throw new BulkSpecimensRejected(400, errors)
  }
  return registration
}

/**
 * Validate bulk specimen rows without creating records: the registration POST /specimens/bulk
 * would run, rolled back. Used by POST /specimens/bulk/validate.
 */
export async function validateBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[],
): Promise<BulkSpecimenValidateResult> {
  const errors = await withRolledBackTransaction(database, async (tx) => {
    try {
      await registerBulkSpecimenRows(tx, rows, undefined)
      return []
    } catch (error) {
      if (error instanceof BulkSpecimensRejected) return error.errors
      throw error
    }
  })
  return { valid: errors.length === 0, errors }
}

/**
 * Register bulk specimen rows, all or nothing. Used by POST /specimens/bulk.
 * Reports the errors validateBulkSpecimenRows reports for the same rows.
 * Throws ConflictError when a write hits a database constraint.
 */
export async function createBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[],
  userId?: number,
): Promise<
  | { success: true; result: BulkSpecimenCreateResult }
  | { success: false; errors: BulkSpecimenValidateError[] }
> {
  try {
    const result = await withWriteTransaction(database, (tx) => registerBulkSpecimenRows(tx, rows, userId))
    return {
      success: true,
      result: {
        specimens: result.entries.map((entry) => entry.specimen),
        created: result.entries.filter((entry) => !entry.reused).length,
        containersCreated: result.entries.reduce((sum, entry) => sum + entry.containerIds.length, 0),
      },
    }
  } catch (error) {
    if (!(error instanceof BulkSpecimensRejected)) throw error
    if (error.status === 409) throw new ConflictError(error.message, { errors: error.errors })
    return { success: false, errors: error.errors }
  }
}
