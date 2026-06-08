import { describe, it, expect } from 'vitest'
import { flatControlBatchContainerToWriteInput } from '../control-batch-payload'

describe('control-batch-payload', () => {
  it('maps micronix flat fields to nested collection write shape', () => {
    const write = flatControlBatchContainerToWriteInput({
      type: 'micronix_tube',
      collectionName: 'Plate-A',
      collectionLocationId: 42,
      barcode: 'BC-1',
      position: 'A01',
      quantity: 2,
      unitSymbol: 'uL',
    })
    expect(write).toEqual({
      containerType: 'micronix_tube',
      barcode: 'BC-1',
      collection: {
        type: 'micronix_plate',
        name: 'Plate-A',
        locationId: 42,
        position: 'A01',
      },
      quantity: 2,
      unitSymbol: 'uL',
    })
  })

  it('maps paper flat fields to sheet parent placement', () => {
    const write = flatControlBatchContainerToWriteInput({
      type: 'paper',
      collectionName: 'PaperBox',
      collectionLocationId: 7,
      collectionType: 'box',
      sheetName: 'Sheet-1',
      sublabel: 'Spot-A',
    })
    expect(write).toEqual({
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'PaperBox', locationId: 7 },
      },
    })
    expect(write).not.toHaveProperty('collectionName')
    expect(write).not.toHaveProperty('sheetName')
  })
})
