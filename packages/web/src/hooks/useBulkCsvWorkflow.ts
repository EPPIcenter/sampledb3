import { useQueryClient } from '@tanstack/react-query'
import { invalidateAfterBulkWrite } from '../lib/query-client'
import {
  bulkCsvImportErrorsToFileRows,
  runBulkCsvServerValidation,
  runBulkCsvImport,
  type BulkCsvWorkflowContext,
} from '../lib/bulk-csv-workflow'

export type { BulkCsvWorkflowContext, BulkCsvValidationError, BulkCsvSubjectsImportResult } from '../lib/bulk-csv-workflow'

/**
 * Shared bulk CSV workflow hook — parse/validate/import orchestration for import pages.
 * Each call takes the data with its file rows, since both come from the CSV parsed in the same handler.
 */
export function useBulkCsvWorkflow(ctx: Omit<BulkCsvWorkflowContext, 'fileRows'>) {
  const queryClient = useQueryClient()
  return {
    runServerValidation: (data: Record<string, unknown>[], fileRows: number[]) =>
      runBulkCsvServerValidation(data, { ...ctx, fileRows }),
    // Per-subject imports can write partially even when they report errors, so refresh either way.
    runImport: (data: Record<string, unknown>[], fileRows: number[], options?: { skipServerValidate?: boolean }) =>
      runBulkCsvImport(data, { ...ctx, fileRows }, options).finally(() => void invalidateAfterBulkWrite(queryClient)),
    importErrorsToFileRows: (errors: unknown[], data: Record<string, unknown>[], fileRows: number[]) =>
      bulkCsvImportErrorsToFileRows(errors, data, { ...ctx, fileRows }),
  }
}

export { runBulkCsvServerValidation, runBulkCsvImport }
