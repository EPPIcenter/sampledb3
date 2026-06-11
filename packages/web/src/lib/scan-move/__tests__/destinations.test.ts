import { describe, it, expect } from 'vitest'
import {
  createScanMoveDestinations,
  markMissingLocations,
  pendingDestinationsMissingLocation,
} from '../destinations'
import type { PendingDestination, ScanMoveEvent } from '../types'
import { stubGateway } from './helpers'

function pending(overrides: Partial<PendingDestination> = {}): PendingDestination {
  return { name: 'NEW-1', locationId: null, barcode: '', status: 'pending', ...overrides }
}

describe('pendingDestinationsMissingLocation / markMissingLocations', () => {
  it('flags only non-created entries without a location', () => {
    expect(pendingDestinationsMissingLocation([pending({ locationId: 5 })])).toBe(false)
    expect(pendingDestinationsMissingLocation([pending()])).toBe(true)
    expect(pendingDestinationsMissingLocation([pending({ status: 'success' })])).toBe(false)
  })

  it('marks missing locations with an error and leaves the rest unchanged', () => {
    const marked = markMissingLocations([
      pending(),
      pending({ name: 'NEW-2', locationId: 5 }),
      pending({ name: 'NEW-3', status: 'success' }),
    ])
    expect(marked[0].error).toBe('Storage location is required')
    expect(marked[1].error).toBeUndefined()
    expect(marked[2].error).toBeUndefined()
  })
})

describe('createScanMoveDestinations', () => {
  it('creates each pending destination, emitting creating then success states', async () => {
    const created: Array<{ name: string; locationId: number; barcode?: string }> = []
    const events: ScanMoveEvent[] = []
    const gateway = stubGateway({
      createDestination: (input) => {
        created.push(input)
        return Promise.resolve()
      },
    })

    const result = await createScanMoveDestinations(
      [pending({ locationId: 7, barcode: ' BC-1 ' }), pending({ name: 'NEW-2', locationId: 8 })],
      gateway,
      (e) => events.push(e),
    )

    expect(result.allSuccess).toBe(true)
    expect(created).toEqual([
      { name: 'NEW-1', locationId: 7, barcode: 'BC-1' },
      { name: 'NEW-2', locationId: 8, barcode: undefined },
    ])
    const last = events[events.length - 1]
    expect(last.type).toBe('PENDING_DESTINATIONS_SET')
    if (last.type === 'PENDING_DESTINATIONS_SET') {
      expect(last.pending.map((p: PendingDestination) => p.status)).toEqual(['success', 'success'])
    }
  })

  it('skips already-created entries', async () => {
    const created: string[] = []
    const gateway = stubGateway({
      createDestination: (input) => {
        created.push(input.name)
        return Promise.resolve()
      },
    })

    const result = await createScanMoveDestinations(
      [pending({ status: 'success' }), pending({ name: 'NEW-2', locationId: 8 })],
      gateway,
      () => {},
    )

    expect(result.allSuccess).toBe(true)
    expect(created).toEqual(['NEW-2'])
  })

  it('marks a failed create with the server error and keeps creating the rest', async () => {
    const events: ScanMoveEvent[] = []
    const gateway = stubGateway({
      createDestination: (input) =>
        input.name === 'NEW-1'
          ? Promise.reject({ response: { data: { error: 'Name already taken' } } })
          : Promise.resolve(),
    })

    const result = await createScanMoveDestinations(
      [pending({ locationId: 7 }), pending({ name: 'NEW-2', locationId: 8 })],
      gateway,
      (e) => events.push(e),
    )

    expect(result.allSuccess).toBe(false)
    const last = events[events.length - 1]
    if (last.type === 'PENDING_DESTINATIONS_SET') {
      expect(last.pending[0]).toMatchObject({ status: 'error', error: 'Name already taken' })
      expect(last.pending[1].status).toBe('success')
    }
  })
})
