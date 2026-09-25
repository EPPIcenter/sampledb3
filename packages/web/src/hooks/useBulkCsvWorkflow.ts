import { useQueryClient } from '@tanstack/react-query'
import { invalidateAfterBulkWrite } from '../lib/query-client'
import {
  runBulkCsvServerValidation,
  runBulkCsvImport,
  type BulkCsvWorkflowContext,
} from '../lib/bulk-csv-workflow'

export type { BulkCsvWorkflowContext, BulkCsvValidationError, BulkCsvSubjectsImportResult } from '../lib/bulk-csv-workflow'

/** Shared bulk CSV workflow hook — parse/validate/import orchestration for import pages. */
export function useBulkCsvWorkflow(ctx: BulkCsvWorkflowContext) {
  const queryClient = useQueryClient()
  return {
    runServerValidation: (data: Record<string, unknown>[]) => runBulkCsvServerValidation(data, ctx),
    // Per-subject imports can write partially even when they report errors, so refresh either way.
    runImport: (data: Record<string, unknown>[], options?: { skipServerValidate?: boolean }) =>
      runBulkCsvImport(data, ctx, options).finally(() => void invalidateAfterBulkWrite(queryClient)),
  }
}

export { runBulkCsvServerValidation, runBulkCsvImport }
