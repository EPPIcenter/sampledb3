import {
  runBulkCsvServerValidation,
  runBulkCsvImport,
  type BulkCsvWorkflowContext,
} from '../lib/bulk-csv-workflow'

export type { BulkCsvWorkflowContext, BulkCsvValidationError, BulkCsvSubjectsImportResult } from '../lib/bulk-csv-workflow'

/** Shared bulk CSV workflow hook — parse/validate/import orchestration for import pages. */
export function useBulkCsvWorkflow(ctx: BulkCsvWorkflowContext) {
  return {
    runServerValidation: (data: Record<string, unknown>[]) => runBulkCsvServerValidation(data, ctx),
    runImport: (data: Record<string, unknown>[], options?: { skipServerValidate?: boolean }) =>
      runBulkCsvImport(data, ctx, options),
  }
}

export { runBulkCsvServerValidation, runBulkCsvImport }
