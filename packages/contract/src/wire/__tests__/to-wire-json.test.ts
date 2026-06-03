import { describe, expect, it } from 'bun:test'
import { toWireJson } from '../to-wire-json'

describe('toWireJson', () => {
  it('omits null and undefined keys at the top level', () => {
    expect(toWireJson({ a: 1, b: null, c: undefined, d: 'x' })).toEqual({ a: 1, d: 'x' })
  })

  it('recursively omits null and undefined in nested objects', () => {
    expect(
      toWireJson({
        container: {
          id: 1,
          collection: { type: 'sheet', id: 2, name: 'S1', position: null, barcode: null },
        },
        specimen: null,
      }),
    ).toEqual({
      container: {
        id: 1,
        collection: { type: 'sheet', id: 2, name: 'S1' },
      },
    })
  })

  it('preserves arrays and omits null elements only when nested in objects', () => {
    expect(toWireJson({ tags: [{ id: 1, name: 'Hold' }] })).toEqual({
      tags: [{ id: 1, name: 'Hold' }],
    })
  })

  it('preserves false and zero', () => {
    expect(toWireJson({ active: false, count: 0, missing: null })).toEqual({
      active: false,
      count: 0,
    })
  })
})
