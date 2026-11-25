import type { BulkDerivationSettings } from '../api/derivations'
import { nextStepAfterValidate } from './collections'
import { parseFullCsv } from './csv'
import type {
  DerivationsBulkEvent,
  DerivationsBulkGateway,
  MissingDerivationCollection,
} from './types'

export function fileLoadedEvent(csvContent: string): DerivationsBulkEvent {
  return { type: 'FILE_LOADED', csvContent }
}

export function fileReadErrorEvent(): DerivationsBulkEvent {
  return { type: 'ERROR', message: 'Failed to read file' }
}

export async function validateDerivationsCsv(
  gateway: DerivationsBulkGateway,
  csvContent: string,
  settings: BulkDerivationSettings,
): Promise<DerivationsBulkEvent[]> {
  if (!csvContent.trim()) {
    return [{ type: 'ERROR', message: 'Please upload a CSV file' }]
  }
  try {
    const result = await gateway.validateCsv(csvContent, settings)
    const { headers, rows, fileRows } = parseFullCsv(csvContent)
    return [
      { type: 'VALIDATED', result, headers, rows: rows.map((row) => ({ ...row })), fileRows },
      { type: 'STEP_SET', step: nextStepAfterValidate(result) },
    ]
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to validate CSV'
    return [{ type: 'ERROR', message }]
  }
}

/**
 * Advance from the Collections step to Review without creating any Collections yet.
 * Missing Collections are created atomically inside POST /imports/derivations-csv when
 * the user runs the import.
 */
export function continueFromCollections(
  missing: MissingDerivationCollection[],
): DerivationsBulkEvent[] {
  if (missing.some((c) => c.locationId == null)) {
    return [{ type: 'ERROR', message: 'Location is required for every new collection' }]
  }
  return [{ type: 'ERROR_CLEARED' }, { type: 'STEP_SET', step: 'review' }]
}

export async function importDerivationsCsv(
  gateway: DerivationsBulkGateway,
  csvContent: string,
  settings: BulkDerivationSettings,
): Promise<DerivationsBulkEvent[]> {
  if (!csvContent.trim()) {
    return [{ type: 'ERROR', message: 'Please upload a CSV file' }]
  }
  try {
    const response = await gateway.importCsv(csvContent, settings)
    return [
      { type: 'IMPORTED', rows: response.rows },
      { type: 'STEP_SET', step: 'import' },
    ]
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import derivations'
    return [{ type: 'ERROR', message }]
  }
}
