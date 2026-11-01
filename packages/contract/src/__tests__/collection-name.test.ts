import { describe, expect, it } from 'bun:test'
import { newCollectionName } from '../collection-name'

describe('newCollectionName', () => {
  it('keeps a given name', () => {
    expect(newCollectionName({ name: 'PLATE-001', barcode: 'BC1' })).toBe('PLATE-001')
  })

  it('names a Collection given only a barcode after the barcode', () => {
    expect(newCollectionName({ barcode: 'BC1' })).toBe('BC1')
    expect(newCollectionName({ name: '', barcode: 'BC1' })).toBe('BC1')
    expect(newCollectionName({ name: null, barcode: 'BC1' })).toBe('BC1')
  })

  it('is undefined without a name or a barcode', () => {
    expect(newCollectionName({})).toBeUndefined()
    expect(newCollectionName({ name: '', barcode: '' })).toBeUndefined()
  })
})
