import type { PendingDestination, ScanMoveEvent, ScanMoveGateway } from './types'

/** Pending destinations that still need a location before creation can run. */
export function pendingDestinationsMissingLocation(pending: PendingDestination[]): boolean {
  return pending.some((p) => p.status !== 'success' && p.locationId == null)
}

export function markMissingLocations(pending: PendingDestination[]): PendingDestination[] {
  return pending.map((p) =>
    p.status === 'success' || p.locationId != null
      ? p
      : { ...p, error: 'Storage location is required' },
  )
}

/**
 * Create destinations sequentially, emitting a progress event per status
 * change so the UI can render creating/success/error states live.
 */
export async function createScanMoveDestinations(
  pending: PendingDestination[],
  gateway: ScanMoveGateway,
  emit: (event: ScanMoveEvent) => void,
): Promise<{ allSuccess: boolean }> {
  let allSuccess = true
  const updated = [...pending]

  for (let i = 0; i < updated.length; i++) {
    if (updated[i].status === 'success') continue
    updated[i] = { ...updated[i], status: 'creating', error: undefined }
    emit({ type: 'PENDING_DESTINATIONS_SET', pending: [...updated] })

    try {
      await gateway.createDestination({
        name: updated[i].name,
        locationId: updated[i].locationId!,
        barcode: updated[i].barcode.trim() || undefined,
      })
      updated[i] = { ...updated[i], status: 'success' }
    } catch (err) {
      allSuccess = false
      const message =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ??
            'Failed to create destination')
          : err instanceof Error
            ? err.message
            : 'Failed to create destination'
      updated[i] = { ...updated[i], status: 'error', error: message }
    }
    emit({ type: 'PENDING_DESTINATIONS_SET', pending: [...updated] })
  }

  return { allSuccess }
}
