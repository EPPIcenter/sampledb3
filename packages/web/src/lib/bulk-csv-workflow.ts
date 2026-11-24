/**
 * Shared bulk CSV workflow: server validate and import orchestration.
 * Used by BulkImportFlow and derivations bulk import.
 */
import { subjectsApi } from './api/subjects'
import { specimensApi } from './api/specimens'
import { importsApi } from './api/imports'
import type { BulkCombinedAtomicMode } from './api/imports'
import {
  buildBulkCombinedRequestPayload,
  buildCollectionBarcodeMap,
  buildCollectionLocationMap,
  buildSpecimensWithLocationIds,
  toBulkCombinedImportRequest,
} from './bulk-import-payload'
import type { MissingCollectionForPayload } from './bulk-import-payload'
import type { ContainerType } from './container-types'
import type { BulkImportValidationError, ImportType } from './bulk-import-validation'
import { getQueryErrorMessage } from '../ui'

export type BulkCsvValidationError = BulkImportValidationError

export type BulkCsvSubjectsImportResult = {
  success: boolean
  created?: number
  containersCreated?: number
  combinedSummary?: {
    subjectsCreated: number
    subjectsUpdated: number
    specimensCreated: number
    containersCreated: number
  }
  errors?: BulkCsvValidationError[]
}

export type BulkCsvWorkflowContext = {
  importType: ImportType
  containerType: ContainerType | 'none' | ''
  fixedStudyShortCode?: string
  missingCollections: MissingCollectionForPayload[]
  atomicMode: BulkCombinedAtomicMode
  /** Spreadsheet row of each data item, counting the header as row 1. */
  fileRows: number[]
}

type CombinedPayload = ReturnType<typeof buildBulkCombinedRequestPayload>

function combinedPayload(data: Record<string, unknown>[], ctx: BulkCsvWorkflowContext): CombinedPayload {
  return buildBulkCombinedRequestPayload(data, {
    containerType: ctx.containerType,
    fixedStudyShortCode: ctx.fixedStudyShortCode,
    missingCollections: ctx.missingCollections,
    atomicMode: ctx.atomicMode,
    fileRows: ctx.fileRows,
  })
}

/** The spreadsheet row of data item `index`. */
function fileRowOf(ctx: BulkCsvWorkflowContext, index: number): number {
  return ctx.fileRows[index] ?? index + 2
}

/** Spreadsheet rows of a subject's specimens: the payload groups rows by subject, so they need not be adjacent. */
function subjectFileRows(payload: CombinedPayload, subjectIndex: number): number[] {
  return (payload.subjects[subjectIndex]?.specimens ?? []).flatMap((s) => (s.rowIndex == null ? [] : [s.rowIndex]))
}

/** A combined-import error the API reports per subject, and per specimen when it knows which. */
type CombinedSubjectError = { subjectIndex: number; specimenIndex?: number; rowIndex?: number; message: string }

function combinedErrorFileRows(payload: CombinedPayload, e: CombinedSubjectError): number[] {
  if (e.rowIndex != null) return [e.rowIndex]
  const rows = subjectFileRows(payload, e.subjectIndex)
  const specimenRow = e.specimenIndex == null ? undefined : rows[e.specimenIndex]
  if (specimenRow != null) return [specimenRow]
  return rows.slice(0, 1)
}

function isCombinedSubjectError(e: unknown): e is CombinedSubjectError {
  return typeof e === 'object' && e != null && typeof (e as CombinedSubjectError).subjectIndex === 'number'
}

function isIndexedError(e: unknown): e is { index: number; error: string } {
  return typeof e === 'object' && e != null && typeof (e as { index?: unknown }).index === 'number'
}

/**
 * Map the API's per-item import errors to spreadsheet rows. `index` names a data item, except in
 * a combined import, where it names a subject and so every row of that subject.
 */
export function bulkCsvImportErrorsToFileRows(
  errors: unknown[],
  data: Record<string, unknown>[],
  ctx: BulkCsvWorkflowContext,
): BulkCsvValidationError[] {
  const payload = ctx.importType === 'combined' ? combinedPayload(data, ctx) : null
  return errors.flatMap((e): BulkCsvValidationError[] => {
    if (payload && isCombinedSubjectError(e)) {
      return [{ fileRows: combinedErrorFileRows(payload, e), error: e.message }]
    }
    if (isIndexedError(e)) {
      const fileRows = payload ? subjectFileRows(payload, e.index) : [fileRowOf(ctx, e.index)]
      return [{ fileRows, error: e.error }]
    }
    return []
  })
}

type ZodIssueLike = { path?: Array<string | number>; message?: string }

function isZodIssueLike(value: unknown): value is ZodIssueLike {
  return typeof value === 'object' && value != null && typeof (value as ZodIssueLike).message === 'string'
}

/**
 * Convert a rejected validate/import request error into row-numbered errors when the response
 * carries Zod `details` or per-row `errors`, falling back to the response or Error message.
 */
export function formatBulkCsvRequestError(
  error: unknown,
  data: Record<string, unknown>[],
  ctx: BulkCsvWorkflowContext,
  fallback: string,
): BulkCsvValidationError[] {
  const errData =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { error?: string; errors?: unknown; details?: unknown } } }).response?.data
      : undefined

  if (Array.isArray(errData?.errors) && errData.errors.length > 0) {
    const mapped = bulkCsvImportErrorsToFileRows(errData.errors, data, ctx)
    if (mapped.length > 0) return mapped
  }

  if (Array.isArray(errData?.details)) {
    const issues = errData.details.filter(isZodIssueLike)
    if (issues.length > 0) {
      const payload = ctx.importType === 'combined' && data.length > 0 ? combinedPayload(data, ctx) : null
      return issues.map((issue) => {
        const path = Array.isArray(issue.path) ? issue.path : []
        const message = issue.message!
        if (ctx.importType === 'specimens' && path[0] === 'specimens' && typeof path[1] === 'number') {
          const field = path.slice(2).join('.')
          return { fileRows: [fileRowOf(ctx, path[1])], error: field ? `${field}: ${message}` : message }
        }
        if (ctx.importType === 'subjects' && path[0] === 'subjects' && typeof path[1] === 'number') {
          const field = path.slice(2).join('.')
          return { fileRows: [fileRowOf(ctx, path[1])], error: field ? `${field}: ${message}` : message }
        }
        if (payload && path[0] === 'subjects' && typeof path[1] === 'number') {
          if (path[2] === 'specimens' && typeof path[3] === 'number') {
            const field = path.slice(4).join('.')
            return {
              fileRows: combinedErrorFileRows(payload, { subjectIndex: path[1], specimenIndex: path[3], message }),
              error: field ? `${field}: ${message}` : message,
            }
          }
          const field = path.slice(2).join('.')
          return {
            fileRows: subjectFileRows(payload, path[1]).slice(0, 1),
            error: field ? `${field}: ${message}` : message,
          }
        }
        const field = path.join('.')
        return { fileRows: [], error: field ? `${field}: ${message}` : message }
      })
    }
  }

  return [{ fileRows: [], error: getQueryErrorMessage(error, fallback) }]
}

export async function runBulkCsvServerValidation(
  data: Record<string, unknown>[],
  ctx: BulkCsvWorkflowContext
): Promise<BulkCsvValidationError[]> {
  if (ctx.importType === 'subjects') {
    const validateRes = await subjectsApi.validateBulk({
      subjects: data as Array<{ studyShortCode: string; name: string }>,
    })
    if (validateRes.valid || validateRes.errors.length === 0) return []
    return validateRes.errors.map((e) => ({ fileRows: [fileRowOf(ctx, e.index)], error: e.message }))
  }

  if (ctx.importType === 'specimens') {
    const map = buildCollectionLocationMap(ctx.missingCollections)
    const barcodeMap = buildCollectionBarcodeMap(ctx.missingCollections)
    const specimensWithLocations = buildSpecimensWithLocationIds(data, map, barcodeMap)
    type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
    const validateRes = await specimensApi.validateBulk({
      specimens: specimensWithLocations as SpecimenBulkItem[],
    })
    if (validateRes.valid) return []
    return validateRes.errors.map((e) => ({ fileRows: [fileRowOf(ctx, e.index)], error: e.message }))
  }

  const payload = combinedPayload(data, ctx)
  const validateRes = await importsApi.bulkCombinedValidate(payload)
  if (validateRes.valid || validateRes.errors.length === 0) return []
  return validateRes.errors.map((e) => ({ fileRows: combinedErrorFileRows(payload, e), error: e.message }))
}

export async function runBulkCsvImport(
  data: Record<string, unknown>[],
  ctx: BulkCsvWorkflowContext,
  options?: { skipServerValidate?: boolean }
): Promise<BulkCsvSubjectsImportResult> {
  if (!options?.skipServerValidate) {
    const errors = await runBulkCsvServerValidation(data, ctx)
    if (errors.length > 0) {
      return { success: false, errors }
    }
  }

  if (ctx.importType === 'subjects') {
    const response = await subjectsApi.createBulk({
      subjects: data as Array<{ studyShortCode: string; name: string }>,
    })
    return {
      success: true,
      created: response.created,
      errors: response.errors && bulkCsvImportErrorsToFileRows(response.errors, data, ctx),
    }
  }

  if (ctx.importType === 'specimens') {
    const collectionLocationMap = buildCollectionLocationMap(ctx.missingCollections)
    const collectionBarcodeMap = buildCollectionBarcodeMap(ctx.missingCollections)
    const specimensWithLocations = buildSpecimensWithLocationIds(data, collectionLocationMap, collectionBarcodeMap)
    type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
    const response = await specimensApi.createBulk({
      specimens: specimensWithLocations as SpecimenBulkItem[],
    })
    return {
      success: true,
      created: response.created,
      containersCreated: response.containersCreated,
      errors: response.errors && bulkCsvImportErrorsToFileRows(response.errors, data, ctx),
    }
  }

  const response = await importsApi.bulkCombined(toBulkCombinedImportRequest(combinedPayload(data, ctx)))
  return {
    success: !response.errors?.length,
    combinedSummary: response.summary,
    errors: response.errors && bulkCsvImportErrorsToFileRows(response.errors, data, ctx),
  }
}
