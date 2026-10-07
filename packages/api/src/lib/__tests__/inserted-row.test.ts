import { describe, it, expect } from 'vitest'
import { insertedRow } from '../inserted-row'

describe('insertedRow', () => {
  it('returns the first returned row', () => {
    expect(insertedRow([{ id: 1 }, { id: 2 }], 'plate')).toEqual({ id: 1 })
  })

  it('throws, naming the table, when the insert returned nothing', () => {
    expect(() => insertedRow([], 'plate')).toThrow('Insert did not return plate row')
  })
})
