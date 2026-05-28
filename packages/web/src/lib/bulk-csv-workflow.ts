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
  buildCollectionLocationMap,
  buildSpecimensWithLocationIds,
  toBulkCombinedImportRequest,
} from './bulk-import-payload'
import type { MissingCollectionForPayload } from './bulk-import-payload'
import type { ContainerType } from './container-types'
import type { ImportType } from './bulk-import-validation'

export type BulkCsvValidationError = { row: number; error: string }

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
  errors?: Array<{ index: number; error: string }>
}

export type BulkCsvWorkflowContext = {
  importType: ImportType
  containerType: ContainerType | 'none' | ''
  fixedStudyShortCode?: string
  missingCollections: MissingCollectionForPayload[]
  atomicMode: BulkCombinedAtomicMode
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
    return validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message }))
  }

  if (ctx.importType === 'specimens') {
    const map = buildCollectionLocationMap(ctx.missingCollections)
    const specimensWithLocations = buildSpecimensWithLocationIds(data, map)
    type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
    const validateRes = await specimensApi.validateBulk({
      specimens: specimensWithLocations as SpecimenBulkItem[],
    })
    if (validateRes.valid) return []
    return validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message }))
  }

  if (ctx.importType === 'combined') {
    const payload = buildBulkCombinedRequestPayload(data, {
      containerType: ctx.containerType,
      fixedStudyShortCode: ctx.fixedStudyShortCode,
      missingCollections: ctx.missingCollections,
      atomicMode: ctx.atomicMode,
    })
    const validateRes = await importsApi.bulkCombinedValidate(payload)
    if (validateRes.valid || validateRes.errors.length === 0) return []
    return validateRes.errors.map((e) => ({
      row: e.rowIndex ?? e.subjectIndex + 1,
      error: e.message,
    }))
  }

  return []
}

export async function runBulkCsvImport(
  data: Record<string, unknown>[],
  ctx: BulkCsvWorkflowContext,
  options?: { skipServerValidate?: boolean }
): Promise<BulkCsvSubjectsImportResult> {
  if (!options?.skipServerValidate) {
    const errors = await runBulkCsvServerValidation(data, ctx)
    if (errors.length > 0) {
      return { success: false, errors: errors.map((e, i) => ({ index: i, error: e.error })) }
    }
  }

  if (ctx.importType === 'subjects') {
    const response = await subjectsApi.createBulk({
      subjects: data as Array<{ studyShortCode: string; name: string }>,
    })
    return { success: true, created: response.created, errors: response.errors }
  }

  if (ctx.importType === 'specimens') {
    const collectionLocationMap = buildCollectionLocationMap(ctx.missingCollections)
    const specimensWithLocations = buildSpecimensWithLocationIds(data, collectionLocationMap)
    type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
    const response = await specimensApi.createBulk({
      specimens: specimensWithLocations as SpecimenBulkItem[],
    })
    return {
      success: true,
      created: response.created,
      containersCreated: response.containersCreated,
      errors: response.errors,
    }
  }

  const validatePayload = buildBulkCombinedRequestPayload(data, {
    containerType: ctx.containerType,
    fixedStudyShortCode: ctx.fixedStudyShortCode,
    missingCollections: ctx.missingCollections,
    atomicMode: ctx.atomicMode,
  })
  const response = await importsApi.bulkCombined(toBulkCombinedImportRequest(validatePayload))
  return {
    success: !response.errors?.length,
    combinedSummary: response.summary,
    errors: response.errors,
  }
}
