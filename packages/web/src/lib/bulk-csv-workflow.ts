/**
 * Shared bulk CSV workflow: server validate and import orchestration.
 * Builds bulk combined and specimen payloads through @sampledb/contract's template mapper.
 */
import {
  mapBulkImportTemplateCsv,
  type BulkCombinedValidateRequest,
  type BulkImportCollectionOverride,
} from '@sampledb/contract'
import { subjectsApi } from './api/subjects'
import { specimensApi } from './api/specimens'
import { importsApi } from './api/imports'
import type { BulkCombinedAtomicMode } from './api/imports'
import type { ContainerType } from './container-types'
import {
  getBulkImportCollectionType,
  parseSubjectsBulkImportCsv,
  templateErrorsToValidationErrors,
  type BulkImportCollectionType,
  type BulkImportValidationError,
  type ImportType,
} from './bulk-import-validation'
import { getQueryErrorMessage } from '../ui'

export type BulkCsvValidationError = BulkImportValidationError

export interface MissingCollectionForPayload {
  name: string
  collectionType?: BulkImportCollectionType
  barcode?: string
  locationId: number | null
  collectionBarcode?: string
}

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
}

function toCollectionOverrides(ctx: BulkCsvWorkflowContext): BulkImportCollectionOverride[] {
  const fallbackType = getBulkImportCollectionType(ctx.containerType)
  return ctx.missingCollections.flatMap((coll) => {
    const type = coll.collectionType ?? fallbackType
    if (!type) return []
    const barcode = coll.collectionBarcode?.trim() || coll.barcode?.trim() || undefined
    return [
      {
        type,
        ...(coll.name ? { name: coll.name } : {}),
        ...(barcode ? { barcode } : {}),
        locationId: coll.locationId,
      },
    ]
  })
}

function mapTemplate(csvText: string, ctx: BulkCsvWorkflowContext) {
  return mapBulkImportTemplateCsv(csvText, {
    containerType: ctx.containerType || 'none',
    defaultStudyShortCode: ctx.fixedStudyShortCode,
    atomicMode: ctx.atomicMode,
    collections: toCollectionOverrides(ctx),
  })
}

/** Flatten a grouped BulkCombinedValidateRequest back to file-ordered rows for POST /specimens/bulk. */
function validateRequestToSpecimensBulk(request: BulkCombinedValidateRequest) {
  const items = request.subjects.flatMap((subject) =>
    subject.specimens.map((spec) => ({
      rowIndex: spec.rowIndex ?? 0,
      specimen: {
        sourceType: 'subject' as const,
        studyShortCode: subject.studyShortCode ?? request.studyShortCode,
        subjectName: subject.subjectName,
        specimenTypeName: spec.specimenTypeName,
        ...(spec.collectionDate ? { collectionDate: spec.collectionDate } : {}),
        ...(spec.container ? { container: spec.container } : {}),
      },
    })),
  )
  items.sort((a, b) => a.rowIndex - b.rowIndex)
  return items.map((item) => item.specimen)
}

/** The spreadsheet row of data item `index`. */
function fileRowOf(fileRows: number[], index: number): number {
  return fileRows[index] ?? index + 2
}

/** Spreadsheet rows of a subject's specimens: the payload groups rows by subject, so they need not be adjacent. */
function subjectFileRows(payload: BulkCombinedValidateRequest, subjectIndex: number): number[] {
  return (payload.subjects[subjectIndex]?.specimens ?? []).flatMap((s) => (s.rowIndex == null ? [] : [s.rowIndex]))
}

/** A combined-import error the API reports per subject, and per specimen when it knows which. */
type CombinedSubjectError = { subjectIndex: number; specimenIndex?: number; rowIndex?: number; message: string }

function combinedErrorFileRows(payload: BulkCombinedValidateRequest, e: CombinedSubjectError): number[] {
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

function resolvePayloadAndFileRows(
  csvText: string,
  ctx: BulkCsvWorkflowContext,
): { payload: BulkCombinedValidateRequest | null; fileRows: number[] } {
  if (!csvText) return { payload: null, fileRows: [] }
  if (ctx.importType === 'subjects') {
    const parsed = parseSubjectsBulkImportCsv(csvText, ctx.fixedStudyShortCode)
    return { payload: null, fileRows: parsed.fileRows }
  }
  const mapped = mapTemplate(csvText, ctx)
  return {
    payload: ctx.importType === 'combined' && mapped.ok ? mapped.validateRequest : null,
    fileRows: mapped.fileRows,
  }
}

/**
 * Map the API's per-item import errors to spreadsheet rows. `index` names a data item, except in
 * a combined import, where it names a subject and so every row of that subject.
 */
export function bulkCsvImportErrorsToFileRows(
  errors: unknown[],
  csvText: string,
  ctx: BulkCsvWorkflowContext,
): BulkCsvValidationError[] {
  const { payload, fileRows } = resolvePayloadAndFileRows(csvText, ctx)
  return errors.flatMap((e): BulkCsvValidationError[] => {
    if (payload && isCombinedSubjectError(e)) {
      return [{ fileRows: combinedErrorFileRows(payload, e), error: e.message }]
    }
    if (isIndexedError(e)) {
      const rows = payload ? subjectFileRows(payload, e.index) : [fileRowOf(fileRows, e.index)]
      return [{ fileRows: rows, error: e.error }]
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
  csvText: string,
  ctx: BulkCsvWorkflowContext,
  fallback: string,
): BulkCsvValidationError[] {
  const errData =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { error?: string; errors?: unknown; details?: unknown } } }).response?.data
      : undefined

  if (Array.isArray(errData?.errors) && errData.errors.length > 0) {
    const mapped = bulkCsvImportErrorsToFileRows(errData.errors, csvText, ctx)
    if (mapped.length > 0) return mapped
  }

  if (Array.isArray(errData?.details)) {
    const issues = errData.details.filter(isZodIssueLike)
    if (issues.length > 0) {
      const { payload, fileRows } = resolvePayloadAndFileRows(csvText, ctx)
      return issues.map((issue) => {
        const path = Array.isArray(issue.path) ? issue.path : []
        const message = issue.message!
        if (ctx.importType === 'specimens' && path[0] === 'specimens' && typeof path[1] === 'number') {
          const field = path.slice(2).join('.')
          return { fileRows: [fileRowOf(fileRows, path[1])], error: field ? `${field}: ${message}` : message }
        }
        if (ctx.importType === 'subjects' && path[0] === 'subjects' && typeof path[1] === 'number') {
          const field = path.slice(2).join('.')
          return { fileRows: [fileRowOf(fileRows, path[1])], error: field ? `${field}: ${message}` : message }
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
  csvText: string,
  ctx: BulkCsvWorkflowContext,
): Promise<BulkCsvValidationError[]> {
  if (ctx.importType === 'subjects') {
    const parsed = parseSubjectsBulkImportCsv(csvText, ctx.fixedStudyShortCode)
    if (!parsed.ok) return parsed.errors
    const validateRes = await subjectsApi.validateBulk({ subjects: parsed.subjects })
    if (validateRes.valid || validateRes.errors.length === 0) return []
    return validateRes.errors.map((e) => ({ fileRows: [fileRowOf(parsed.fileRows, e.index)], error: e.message }))
  }

  const mapped = mapTemplate(csvText, ctx)
  if (!mapped.ok) return templateErrorsToValidationErrors(mapped.errors)

  if (ctx.importType === 'specimens') {
    type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
    const specimens = validateRequestToSpecimensBulk(mapped.validateRequest)
    const validateRes = await specimensApi.validateBulk({
      specimens: specimens as SpecimenBulkItem[],
    })
    if (validateRes.valid) return []
    return validateRes.errors.map((e) => ({ fileRows: [fileRowOf(mapped.fileRows, e.index)], error: e.message }))
  }

  const validateRes = await importsApi.bulkCombinedValidate(mapped.validateRequest)
  if (validateRes.valid || validateRes.errors.length === 0) return []
  return validateRes.errors.map((e) => ({ fileRows: combinedErrorFileRows(mapped.validateRequest, e), error: e.message }))
}

export async function runBulkCsvImport(
  csvText: string,
  ctx: BulkCsvWorkflowContext,
  options?: { skipServerValidate?: boolean },
): Promise<BulkCsvSubjectsImportResult> {
  if (!options?.skipServerValidate) {
    const errors = await runBulkCsvServerValidation(csvText, ctx)
    if (errors.length > 0) {
      return { success: false, errors }
    }
  }

  if (ctx.importType === 'subjects') {
    const parsed = parseSubjectsBulkImportCsv(csvText, ctx.fixedStudyShortCode)
    if (!parsed.ok) return { success: false, errors: parsed.errors }
    const response = await subjectsApi.createBulk({ subjects: parsed.subjects })
    return {
      success: true,
      created: response.created,
      errors: response.errors && bulkCsvImportErrorsToFileRows(response.errors, csvText, ctx),
    }
  }

  const mapped = mapTemplate(csvText, ctx)
  if (!mapped.ok) {
    return { success: false, errors: templateErrorsToValidationErrors(mapped.errors) }
  }

  if (ctx.importType === 'specimens') {
    type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
    const specimens = validateRequestToSpecimensBulk(mapped.validateRequest)
    const response = await specimensApi.createBulk({
      specimens: specimens as SpecimenBulkItem[],
    })
    return {
      success: true,
      created: response.created,
      containersCreated: response.containersCreated,
      errors: response.errors && bulkCsvImportErrorsToFileRows(response.errors, csvText, ctx),
    }
  }

  const response = await importsApi.bulkCombined(mapped.importRequest)
  return {
    success: !response.errors?.length,
    combinedSummary: response.summary,
    errors: response.errors && bulkCsvImportErrorsToFileRows(response.errors, csvText, ctx),
  }
}
