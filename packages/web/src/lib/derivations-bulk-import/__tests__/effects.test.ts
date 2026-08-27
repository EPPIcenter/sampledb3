import { describe, it, expect } from 'vitest'
import {
  createMissingCollections,
  importDerivationsCsv,
  validateDerivationsCsv,
} from '../effects'
import type { DerivationsBulkEvent, MissingDerivationCollection } from '../types'
import { stubGateway } from './helpers'
import type { BulkDerivationSettings, ValidationResult } from '../../api/derivations'

const settings: BulkDerivationSettings = {
  derivationType: '',
  specimenTypeName: '',
  containerType: '',
  protocol: '',
  derivationDate: '',
}

const emptyValidation = (collections: ValidationResult['collections'] = []): ValidationResult => ({
  rows: [],
  collections,
  summary: { total: 0, valid: 0, invalid: 0, warnings: 0 },
})

function missing(
  overrides: Partial<MissingDerivationCollection> = {},
): MissingDerivationCollection {
  return {
    name: 'P1',
    containerType: 'micronix_tube',
    locationId: 7,
    status: 'pending',
    ...overrides,
  }
}

describe('validateDerivationsCsv', () => {
  it('returns an error event when the CSV is empty', async () => {
    expect(await validateDerivationsCsv(stubGateway(), '  ', settings)).toEqual([
      { type: 'ERROR', message: 'Please upload a CSV file' },
    ])
  })

  it('returns VALIDATED then STEP_SET review when no tube collections are missing', async () => {
    const gateway = stubGateway({
      validateCsv: () => Promise.resolve(emptyValidation()),
    })
    const events = await validateDerivationsCsv(gateway, 'a,b\n1,2', settings)
    expect(events).toEqual([
      {
        type: 'VALIDATED',
        result: emptyValidation(),
        headers: ['a', 'b'],
        rows: [{ a: '1', b: '2' }],
      },
      { type: 'STEP_SET', step: 'review' },
    ])
  })

  it('routes to collections when a tube collection will be created', async () => {
    const result = emptyValidation([
      { name: 'P1', status: 'will_be_created', containerType: 'micronix_tube' },
    ])
    const gateway = stubGateway({
      validateCsv: () => Promise.resolve(result),
    })
    const events = await validateDerivationsCsv(gateway, 'a,b\n1,2', settings)
    expect(events[1]).toEqual({ type: 'STEP_SET', step: 'collections' })
  })

  it('surfaces gateway failures as ERROR events', async () => {
    const gateway = stubGateway({
      validateCsv: () => Promise.reject(new Error('Invalid CSV')),
    })
    expect(await validateDerivationsCsv(gateway, 'a,b\n1,2', settings)).toEqual([
      { type: 'ERROR', message: 'Invalid CSV' },
    ])
  })
})

describe('createMissingCollections', () => {
  it('creates each pending collection, emitting creating then success, then review', async () => {
    const created: Array<{ name: string; locationId: number; barcode?: string }> = []
    const events: DerivationsBulkEvent[] = []
    const gateway = stubGateway({
      createMicronixPlate: (input) => {
        created.push(input)
        return Promise.resolve()
      },
      createCryovialBox: (input) => {
        created.push(input)
        return Promise.resolve()
      },
    })

    const result = await createMissingCollections(
      [
        missing({ locationId: 7, barcode: 'BC-1' }),
        missing({ name: 'B1', containerType: 'cryovial_tube', locationId: 8 }),
      ],
      gateway,
      (e) => events.push(e),
    )

    expect(result.allSuccess).toBe(true)
    expect(created).toEqual([
      { name: 'P1', locationId: 7, barcode: 'BC-1' },
      { name: 'B1', locationId: 8, barcode: undefined },
    ])
    expect(events).toEqual([
      { type: 'COLLECTION_PATCHED', index: 0, patch: { status: 'creating' } },
      { type: 'COLLECTION_PATCHED', index: 0, patch: { status: 'success', name: 'P1' } },
      { type: 'COLLECTION_PATCHED', index: 1, patch: { status: 'creating' } },
      { type: 'COLLECTION_PATCHED', index: 1, patch: { status: 'success', name: 'B1' } },
      { type: 'ERROR_CLEARED' },
      { type: 'STEP_SET', step: 'review' },
    ])
  })

  it('skips already-created entries', async () => {
    const created: string[] = []
    const gateway = stubGateway({
      createMicronixPlate: (input) => {
        created.push(input.name)
        return Promise.resolve()
      },
    })

    const result = await createMissingCollections(
      [missing({ status: 'success', locationId: 7 }), missing({ name: 'P3', locationId: 9 })],
      gateway,
      () => {},
    )

    expect(result.allSuccess).toBe(true)
    expect(created).toEqual(['P3'])
  })

  it('marks rows without a location as errors and does not advance', async () => {
    const created: string[] = []
    const events: DerivationsBulkEvent[] = []
    const gateway = stubGateway({
      createMicronixPlate: (input) => {
        created.push(input.name)
        return Promise.resolve()
      },
    })

    const result = await createMissingCollections(
      [
        missing({ name: 'P2', locationId: null }),
        missing({ name: 'P3', locationId: 9 }),
      ],
      gateway,
      (e) => events.push(e),
    )

    expect(result.allSuccess).toBe(false)
    expect(created).toEqual(['P3'])
    expect(events).toContainEqual({
      type: 'COLLECTION_PATCHED',
      index: 0,
      patch: { status: 'error', error: 'Location is required' },
    })
    expect(events).toContainEqual({
      type: 'COLLECTION_PATCHED',
      index: 1,
      patch: { status: 'success', name: 'P3' },
    })
    expect(events.some((e) => e.type === 'STEP_SET')).toBe(false)
  })

  it('marks a failed create with the server error and keeps creating the rest', async () => {
    const events: DerivationsBulkEvent[] = []
    const gateway = stubGateway({
      createMicronixPlate: (input) =>
        input.name === 'P1'
          ? Promise.reject({ response: { data: { error: 'Name already taken' } } })
          : Promise.resolve(),
    })

    const result = await createMissingCollections(
      [missing({ locationId: 7 }), missing({ name: 'P2', locationId: 8 })],
      gateway,
      (e) => events.push(e),
    )

    expect(result.allSuccess).toBe(false)
    expect(events).toContainEqual({
      type: 'COLLECTION_PATCHED',
      index: 0,
      patch: { status: 'error', error: 'Name already taken' },
    })
    expect(events).toContainEqual({
      type: 'COLLECTION_PATCHED',
      index: 1,
      patch: { status: 'success', name: 'P2' },
    })
    expect(events.some((e) => e.type === 'STEP_SET')).toBe(false)
  })

  it('does nothing when the missing list is empty', async () => {
    const events: DerivationsBulkEvent[] = []
    const result = await createMissingCollections([], stubGateway(), (e) => events.push(e))
    expect(result.allSuccess).toBe(true)
    expect(events).toEqual([])
  })
})

describe('importDerivationsCsv', () => {
  it('returns IMPORTED then STEP_SET import on success', async () => {
    const rows = [{ index: 2, success: true }]
    const gateway = stubGateway({
      importCsv: () => Promise.resolve({ rows }),
    })
    expect(await importDerivationsCsv(gateway, 'a,b\n1,2', settings)).toEqual([
      { type: 'IMPORTED', rows },
      { type: 'STEP_SET', step: 'import' },
    ])
  })

  it('surfaces gateway failures as ERROR without advancing', async () => {
    const gateway = stubGateway({
      importCsv: () => Promise.reject(new Error('Failed to import derivations')),
    })
    expect(await importDerivationsCsv(gateway, 'a,b\n1,2', settings)).toEqual([
      { type: 'ERROR', message: 'Failed to import derivations' },
    ])
  })
})
