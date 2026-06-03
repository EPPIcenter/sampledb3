import { describe, expect, it } from 'bun:test'
import { enrichedContainerWireSchema } from '../container-wire'

describe('enrichedContainerWireSchema', () => {
  it('accepts paper container with omit-on-wire optional fields', () => {
    const result = enrichedContainerWireSchema.safeParse({
      id: 94079,
      specimenId: 1,
      containerType: 'paper',
      collection: { type: 'sheet', id: 143, name: '2058121' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts paper container with sublabel at root', () => {
    const result = enrichedContainerWireSchema.safeParse({
      id: 1,
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: { type: 'sheet', id: 2, name: 'Sheet1' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sublabel).toBe('Spot-A')
    }
  })

  it('rejects explicit null on optional collection placement fields', () => {
    const result = enrichedContainerWireSchema.safeParse({
      id: 94079,
      containerType: 'paper',
      collection: { type: 'sheet', id: 143, name: '2058121', position: null },
    })
    expect(result.success).toBe(false)
  })

  it('accepts micronix tube with barcode at root and position on collection', () => {
    const result = enrichedContainerWireSchema.safeParse({
      id: 9,
      containerType: 'micronix_tube',
      barcode: 'MTX-001',
      collection: { type: 'micronix_plate', id: 2, name: 'Plate1', position: 'A01' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects position on sheet placement', () => {
    const result = enrichedContainerWireSchema.safeParse({
      id: 1,
      containerType: 'paper',
      collection: { type: 'sheet', id: 2, name: 'S1', position: 'A01' },
    })
    expect(result.success).toBe(false)
  })
})
