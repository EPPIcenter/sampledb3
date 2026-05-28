import { useCallback, useState } from 'react'
import { derivationsApi } from '../lib/api/derivations'
import type { BulkDerivationSettings, ValidationResult } from '../lib/api/derivations'
import { getQueryErrorMessage } from '../ui'

/** Derivations bulk CSV workflow — validate/import orchestration (review step stays in page). */
export function useDerivationsBulkCsvWorkflow(settings: BulkDerivationSettings) {
  const [validating, setValidating] = useState(false)
  const [importing, setImporting] = useState(false)

  const validateCsv = useCallback(
    async (csvContent: string): Promise<ValidationResult | null> => {
      setValidating(true)
      try {
        return await derivationsApi.validateCsv(csvContent, settings)
      } catch (error: unknown) {
        throw new Error(getQueryErrorMessage(error, 'Failed to validate CSV'))
      } finally {
        setValidating(false)
      }
    },
    [settings]
  )

  const importCsv = useCallback(
    async (csvContent: string) => {
      setImporting(true)
      try {
        return await derivationsApi.importCsv(csvContent, { dryRun: false, settings })
      } catch (error: unknown) {
        throw new Error(getQueryErrorMessage(error, 'Failed to import derivations'))
      } finally {
        setImporting(false)
      }
    },
    [settings]
  )

  return {
    validateCsv,
    importCsv,
    validating,
    importing,
    workflowLoading: validating || importing,
  }
}
