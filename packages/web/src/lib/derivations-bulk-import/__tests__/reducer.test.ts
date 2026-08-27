import { describe, it, expect } from 'vitest'
import {
  derivationsBulkReducer,
  initialDerivationsBulkState,
  selectMissingCollections,
  nextStepAfterValidate,
} from '../index'
import type { ValidationResult } from '../../api/derivations'

const validation = (collections: ValidationResult['collections']): ValidationResult => ({
  rows: [],
  collections,
  summary: { total: 0, valid: 0, invalid: 0, warnings: 0 },
})

describe('derivationsBulkReducer', () => {
  it('loads a file onto the upload step and clears prior results', () => {
    const loaded = derivationsBulkReducer(initialDerivationsBulkState(), {
      type: 'FILE_LOADED',
      csvContent: 'a,b\n1,2',
    })
    expect(loaded.csvContent).toBe('a,b\n1,2')
    expect(loaded.step).toBe('upload')
    expect(loaded.validationResult).toBeNull()
  })

  it('guards steps without CSV back to upload', () => {
    const stepped = derivationsBulkReducer(initialDerivationsBulkState(), {
      type: 'STEP_SET',
      step: 'review',
    })
    expect(stepped.step).toBe('upload')
  })

  it('after validate, missing tube collections start pending', () => {
    const result = validation([
      { name: 'P1', status: 'will_be_created', containerType: 'micronix_tube' },
    ])
    const state = derivationsBulkReducer(initialDerivationsBulkState(), {
      type: 'FILE_LOADED',
      csvContent: 'a,b\n1,2',
    })
    const validated = derivationsBulkReducer(state, {
      type: 'VALIDATED',
      result,
      headers: ['a', 'b'],
      rows: [{ a: '1', b: '2' }],
    })
    expect(nextStepAfterValidate(result)).toBe('collections')
    expect(selectMissingCollections(validated)).toEqual([
      { name: 'P1', barcode: undefined, containerType: 'micronix_tube', locationId: null, status: 'pending' },
    ])
  })

  it('patches collection location without losing the base row', () => {
    const result = validation([
      { name: 'P1', status: 'will_be_created', containerType: 'micronix_tube' },
    ])
    let state = derivationsBulkReducer(initialDerivationsBulkState(), {
      type: 'FILE_LOADED',
      csvContent: 'a,b\n1,2',
    })
    state = derivationsBulkReducer(state, {
      type: 'VALIDATED',
      result,
      headers: ['a'],
      rows: [{ a: '1' }],
    })
    state = derivationsBulkReducer(state, {
      type: 'COLLECTION_PATCHED',
      index: 0,
      patch: { locationId: 42 },
    })
    expect(selectMissingCollections(state)[0].locationId).toBe(42)
    expect(selectMissingCollections(state)[0].name).toBe('P1')
  })
})
