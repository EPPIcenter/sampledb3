/**
 * Bulk combined import (subjects + specimens + containers) with configurable atomicity.
 * Used by POST /imports/bulk-combined (and its validate route) and POST /subjects/with-specimens.
 * Subjects are found or created here; Specimens and Containers go through Specimen registration.
 * Validation is the import itself, rolled back (ADR 0010).
 */
import type { Database } from '../db/client'
import { studySubject, type specimen } from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { validateStudyShortCode, validateSubjectName } from './validation'
import { utcNow } from './datetime'
import { resolveSpecimenTypeByName } from './identifier-resolution'
import { ConflictError, ValidationError } from './error-handler'
import { withRolledBackTransaction, withWriteTransaction } from '../db/write-transaction'
import {
  RefusedWithErrors,
  registerSpecimens,
  SpecimenRegistrationError,
  type RegistrationContainer,
  type RegistrationEntry,
  type RegistrationResult,
} from './specimen-registration'

export { normalizePosition } from './normalize-position'

export interface BulkCombinedSpecimenInput {
  specimenTypeName: string
  collectionDate?: string
  container?: RegistrationContainer
  /** CSV row, echoed back on errors. */
  rowIndex?: number
}

export interface BulkCombinedSubjectInput {
  /** Overrides the payload-level study. */
  studyShortCode?: string
  subjectName: string
  specimens: BulkCombinedSpecimenInput[]
}

export interface WithSpecimensPayload {
  studyShortCode: string
  subjectName: string
  specimens: BulkCombinedSpecimenInput[]
}

export interface OneSubjectResult {
  subject: typeof studySubject.$inferSelect
  subjectCreated: boolean
  specimens: Array<{
    specimen: typeof specimen.$inferSelect
    containerCreated: boolean
    containerId?: number
    specimenCreated: boolean
  }>
  summary: BulkCombinedSummary
}

interface BulkCombinedSummary {
  subjectsCreated: number
  subjectsUpdated: number
  specimensCreated: number
  containersCreated: number
}

export interface BulkCombinedError {
  subjectIndex: number
  specimenIndex?: number
  rowIndex?: number
  message: string
}

/** The subjects could not all be registered; nothing was written. */
class BulkCombinedRejected extends RefusedWithErrors<BulkCombinedError> {}

/** A subject's own study wins over the payload-level default. */
export function resolveSubjectStudyShortCode(
  payloadStudyShortCode: string | undefined,
  subject: { studyShortCode?: string }
): string | undefined {
  return subject.studyShortCode ?? payloadStudyShortCode
}

/**
 * Find or create each subject, then register all their specimens in one call. Runs inside the
 * caller's transaction and throws BulkCombinedRejected with every problem found.
 */
async function registerSubjects(
  database: Database,
  payloadStudyShortCode: string | undefined,
  subjects: BulkCombinedSubjectInput[],
  userId: number | undefined,
  inputName?: string,
): Promise<OneSubjectResult[]> {
  const now = utcNow()
  const errors: BulkCombinedError[] = []
  const entries: RegistrationEntry[] = []
  const entryRefs: Array<{ subjectIndex: number; specimenIndex: number; rowIndex?: number }> = []
  const registered: Array<{ subject: typeof studySubject.$inferSelect; created: boolean } | null> = []
  const studyIds = new Map<string, Awaited<ReturnType<typeof validateStudyShortCode>>>()
  const specimenTypeIds = new Map<string, number | null>()

  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex++) {
    const subj = subjects[subjectIndex]
    const subjectError = (message: string) =>
      errors.push({ subjectIndex, specimenIndex: 0, rowIndex: subj.specimens[0]?.rowIndex, message })

    const code = resolveSubjectStudyShortCode(payloadStudyShortCode, subj)
    if (!code) {
      subjectError('Study short code is required')
      registered.push(null)
      continue
    }
    let study = studyIds.get(code)
    if (!study) {
      study = await validateStudyShortCode(database, code)
      studyIds.set(code, study)
    }
    if (!study.valid || !study.studyId) {
      subjectError(study.error ?? 'Invalid study')
      registered.push(null)
      continue
    }
    const studyId = study.studyId

    // Names are unique per study: a subject named again (in the database or earlier in this
    // file) is reused.
    const name = subj.subjectName.trim()
    const existing = database
      .select()
      .from(studySubject)
      .where(and(eq(studySubject.studyId, studyId), eq(studySubject.name, name)))
      .get()
    let subject = existing
    if (!subject) {
      const nameValidation = await validateSubjectName(database, studyId, name)
      if (!nameValidation.valid) {
        subjectError(nameValidation.error ?? 'Invalid subject name')
        registered.push(null)
        continue
      }
      subject = database
        .insert(studySubject)
        .values({ studyId, name, created: now, lastUpdated: now, createdBy: userId, updatedBy: userId })
        .returning()
        .get()
    }
    registered.push({ subject, created: !existing })

    for (let specimenIndex = 0; specimenIndex < subj.specimens.length; specimenIndex++) {
      const spec = subj.specimens[specimenIndex]
      let specimenTypeId = specimenTypeIds.get(spec.specimenTypeName)
      if (specimenTypeId === undefined) {
        specimenTypeId = await resolveSpecimenTypeByName(database, spec.specimenTypeName)
        specimenTypeIds.set(spec.specimenTypeName, specimenTypeId)
      }
      if (!specimenTypeId) {
        errors.push({
          subjectIndex,
          specimenIndex,
          rowIndex: spec.rowIndex,
          message: `Specimen type '${spec.specimenTypeName}' not found`,
        })
        continue
      }
      entries.push({
        source: { subjectId: subject.id },
        specimenTypeId,
        collectionDate: spec.collectionDate,
        containers: spec.container ? [spec.container] : [],
      })
      entryRefs.push({ subjectIndex, specimenIndex, rowIndex: spec.rowIndex })
    }
  }

  let registration: RegistrationResult | null = null
  try {
    registration = await registerSpecimens(database, entries, { userId, inputName })
  } catch (error) {
    if (!(error instanceof SpecimenRegistrationError)) throw error
    const mapped = error.errors.map((e) => ({ ...entryRefs[e.entryIndex], message: e.message }))
    if (error.status === 409) throw new BulkCombinedRejected(409, [...errors, ...mapped])
    errors.push(...mapped)
  }
  if (errors.length > 0 || !registration) {
    errors.sort((a, b) => a.subjectIndex - b.subjectIndex || (a.specimenIndex ?? 0) - (b.specimenIndex ?? 0))
    throw new BulkCombinedRejected(400, errors)
  }

  const results: OneSubjectResult[] = registered.map((r) => {
    if (!r) throw new Error('Subject missing after a registration without errors')
    return {
      subject: r.subject,
      subjectCreated: r.created,
      specimens: [],
      summary: { subjectsCreated: r.created ? 1 : 0, subjectsUpdated: r.created ? 0 : 1, specimensCreated: 0, containersCreated: 0 },
    }
  })
  registration.entries.forEach((entry, i) => {
    const result = results[entryRefs[i].subjectIndex]
    const containerId = entry.containerIds.at(0)
    result.specimens.push({
      specimen: entry.specimen,
      specimenCreated: !entry.reused,
      containerCreated: containerId !== undefined,
      containerId,
    })
    if (!entry.reused) result.summary.specimensCreated += 1
    if (containerId !== undefined) result.summary.containersCreated += 1
  })
  return results
}

function sumSummaries(results: OneSubjectResult[]): BulkCombinedSummary {
  return results.reduce(
    (acc, r) => ({
      subjectsCreated: acc.subjectsCreated + r.summary.subjectsCreated,
      subjectsUpdated: acc.subjectsUpdated + r.summary.subjectsUpdated,
      specimensCreated: acc.specimensCreated + r.summary.specimensCreated,
      containersCreated: acc.containersCreated + r.summary.containersCreated,
    }),
    { subjectsCreated: 0, subjectsUpdated: 0, specimensCreated: 0, containersCreated: 0 }
  )
}

export async function runOneSubjectWithSpecimens(
  database: Database,
  payload: WithSpecimensPayload,
  userId: number | undefined
): Promise<OneSubjectResult> {
  try {
    const [result] = await withWriteTransaction(database, (tx) =>
      registerSubjects(tx, payload.studyShortCode, [{ subjectName: payload.subjectName, specimens: payload.specimens }], userId)
    )
    return result
  } catch (error) {
    if (!(error instanceof BulkCombinedRejected)) throw error
    const details = { specimenIndex: error.errors[0]?.specimenIndex, errors: error.errors }
    if (error.status === 409) throw new ConflictError(error.message, details)
    throw new ValidationError(error.message, details)
  }
}

/** The bulk combined routes take a CSV import, so a value repeated in it is "used more than once in your file". */
const CSV_INPUT_NAME = 'your file'

export interface BulkCombinedPayload {
  /** Default study for subjects that do not set their own studyShortCode. */
  studyShortCode?: string
  atomicMode: 'full_file' | 'per_subject'
  subjects: BulkCombinedSubjectInput[]
}

export interface BulkCombinedResult {
  summary: BulkCombinedSummary
  results: OneSubjectResult[]
  errors?: Array<{ index: number; error: string }>
}

export async function runBulkCombinedImport(
  database: Database,
  payload: BulkCombinedPayload,
  userId: number | undefined
): Promise<BulkCombinedResult> {
  const { studyShortCode, atomicMode, subjects } = payload

  if (atomicMode === 'per_subject') {
    const results: OneSubjectResult[] = []
    const errors: Array<{ index: number; error: string }> = []
    for (let i = 0; i < subjects.length; i++) {
      try {
        const [one] = await withWriteTransaction(database, (tx) => registerSubjects(tx, studyShortCode, [subjects[i]], userId, CSV_INPUT_NAME))
        results.push(one)
      } catch (error) {
        if (!(error instanceof BulkCombinedRejected)) throw error
        errors.push({ index: i, error: `Subject '${subjects[i].subjectName}': ${error.errors.map((e) => e.message).join('; ')}` })
      }
    }
    return { summary: sumSummaries(results), results, errors: errors.length > 0 ? errors : undefined }
  }

  try {
    const results = await withWriteTransaction(database, (tx) => registerSubjects(tx, studyShortCode, subjects, userId, CSV_INPUT_NAME))
    return { summary: sumSummaries(results), results }
  } catch (error) {
    if (!(error instanceof BulkCombinedRejected)) throw error
    const first = error.errors.at(0)
    const where = first ? `Subject '${subjects[first.subjectIndex].subjectName.trim()}' (index ${first.subjectIndex + 1}) failed: ` : ''
    if (error.status === 409) throw new ConflictError(`${where}${error.message}`, { errors: error.errors })
    throw new ValidationError(`${where}${error.message}`, { errors: error.errors })
  }
}

/**
 * Check a bulk combined import by running it and rolling it back, in the payload's atomicMode,
 * and report every problem. Validate passes exactly when the import would succeed.
 *
 * per_subject runs each subject in its own savepoint, as the import does: a failed subject's
 * writes are rolled back before the next subject runs, so a subject that relies on a collection
 * a failed subject would have created is flagged too.
 */
export async function validateBulkCombinedPayload(
  database: Database,
  payload: BulkCombinedPayload
): Promise<{ valid: boolean; errors: BulkCombinedError[] }> {
  const { studyShortCode, atomicMode, subjects } = payload
  return withRolledBackTransaction(database, async (tx) => {
    const errors: BulkCombinedError[] = []
    const batches = atomicMode === 'per_subject' ? subjects.map((subject, i) => ({ first: i, subjects: [subject] })) : [{ first: 0, subjects }]
    for (const batch of batches) {
      try {
        await withWriteTransaction(tx, (savepoint) => registerSubjects(savepoint, studyShortCode, batch.subjects, undefined, CSV_INPUT_NAME))
      } catch (error) {
        if (!(error instanceof BulkCombinedRejected)) throw error
        errors.push(...error.errors.map((e) => ({ ...e, subjectIndex: batch.first + e.subjectIndex })))
      }
    }
    return { valid: errors.length === 0, errors }
  })
}

/** HTTP response shape for POST /subjects/with-specimens */
export function formatOneSubjectWithSpecimensResponse(result: OneSubjectResult) {
  return {
    subject: result.subject,
    subjectCreated: result.subjectCreated,
    specimens: result.specimens.map((s) => ({
      ...s.specimen,
      containerCreated: s.containerCreated,
      containerId: s.containerId,
    })),
    summary: result.summary,
  }
}
