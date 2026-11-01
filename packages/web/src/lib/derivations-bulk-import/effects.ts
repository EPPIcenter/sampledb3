import { newCollectionName } from '@sampledb/contract'
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

export async function createOneMissingCollection(
  gateway: DerivationsBulkGateway,
  coll: MissingDerivationCollection,
): Promise<{ name: string } | { error: string }> {
  if (!coll.locationId) {
    return { error: 'Location is required' }
  }
  // Named as bulk import and Specimen registration name it: after its barcode when it has no name.
  const name = newCollectionName(coll)
  if (!name) {
    return { error: 'A new collection needs a name or a barcode' }
  }
  try {
    const input = { name, locationId: coll.locationId, barcode: coll.barcode }
    if (coll.containerType === 'micronix_tube') {
      await gateway.createMicronixPlate(input)
    } else {
      await gateway.createCryovialBox(input)
    }
    return { name }
  } catch (error: unknown) {
    const errObj = error as { response?: { data?: { error?: string } }; message?: string }
    return { error: errObj.response?.data?.error || errObj.message || 'Failed to create collection' }
  }
}

/**
 * Create missing tube collections sequentially, emitting a progress event per
 * status change so the UI can render creating/success/error states live.
 */
export async function createMissingCollections(
  missing: MissingDerivationCollection[],
  gateway: DerivationsBulkGateway,
  emit: (event: DerivationsBulkEvent) => void,
): Promise<{ allSuccess: boolean }> {
  if (missing.length === 0) return { allSuccess: true }

  let allSuccess = true
  for (let i = 0; i < missing.length; i++) {
    const coll = missing[i]
    if (coll.status === 'success') continue
    emit({ type: 'COLLECTION_PATCHED', index: i, patch: { status: 'creating' } })
    const result = await createOneMissingCollection(gateway, coll)
    if ('name' in result) {
      emit({ type: 'COLLECTION_PATCHED', index: i, patch: { status: 'success', name: result.name } })
    } else {
      allSuccess = false
      emit({
        type: 'COLLECTION_PATCHED',
        index: i,
        patch: { status: 'error', error: result.error },
      })
    }
  }
  if (allSuccess) {
    emit({ type: 'ERROR_CLEARED' })
    emit({ type: 'STEP_SET', step: 'review' })
  }
  return { allSuccess }
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
