import { describe, it, expect } from 'vitest'
import {
  continueFromCollections,
  importDerivationsCsv,
  validateDerivationsCsv,
} from '../effects'
import type { MissingDerivationCollection } from '../types'
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
        fileRows: [2],
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

describe('continueFromCollections', () => {
  it('advances to review without pre-creating any collection once every missing collection has a location', () => {
    expect(
      continueFromCollections([
        missing({ locationId: 7, barcode: 'BC-1' }),
        missing({ name: 'B1', containerType: 'cryovial_tube', locationId: 8 }),
      ]),
    ).toEqual([{ type: 'ERROR_CLEARED' }, { type: 'STEP_SET', step: 'review' }])
  })

  it('refuses to advance when any missing collection has no location', () => {
    expect(
      continueFromCollections([
        missing({ name: 'P2', locationId: null }),
        missing({ name: 'P3', locationId: 9 }),
      ]),
    ).toEqual([{ type: 'ERROR', message: 'Location is required for every new collection' }])
  })

  it('advances cleanly when there are no missing collections', () => {
    expect(continueFromCollections([])).toEqual([
      { type: 'ERROR_CLEARED' },
      { type: 'STEP_SET', step: 'review' },
    ])
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
