import { useQueryClient } from '@tanstack/react-query'
import { invalidateAfterBulkWrite } from '../lib/query-client'
import {
  bulkCsvImportErrorsToFileRows,
  formatBulkCsvRequestError,
  runBulkCsvServerValidation,
  runBulkCsvImport,
  type BulkCsvWorkflowContext,
} from '../lib/bulk-csv-workflow'

export type { BulkCsvWorkflowContext, BulkCsvValidationError, BulkCsvSubjectsImportResult } from '../lib/bulk-csv-workflow'

/**
 * Shared bulk CSV workflow hook — parse/validate/import orchestration for import pages.
 */
export function useBulkCsvWorkflow(ctx: BulkCsvWorkflowContext) {
  const queryClient = useQueryClient()
  return {
    runServerValidation: (csvText: string) => runBulkCsvServerValidation(csvText, ctx),
    // Per-subject imports can write partially even when they report errors, so refresh either way.
    runImport: (csvText: string, options?: { skipServerValidate?: boolean }) =>
      runBulkCsvImport(csvText, ctx, options).finally(() => void invalidateAfterBulkWrite(queryClient)),
    importErrorsToFileRows: (errors: unknown[], csvText: string) =>
      bulkCsvImportErrorsToFileRows(errors, csvText, ctx),
    formatRequestError: (error: unknown, csvText: string, fallback: string) =>
      formatBulkCsvRequestError(error, csvText, ctx, fallback),
  }
}

export { runBulkCsvServerValidation, runBulkCsvImport }
