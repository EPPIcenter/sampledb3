import { describe, it, expect } from 'vitest'
import { flatContainerRegistrationToWriteInput } from '../specimen-container-payload'

describe('flatContainerRegistrationToWriteInput', () => {
  it('nests micronix collection from flat form fields', () => {
    const write = flatContainerRegistrationToWriteInput({
      containerType: 'micronix_tube',
      collectionName: 'Plate-A',
      barcode: 'BC-1',
      position: 'A01',
    })
    expect(write).toMatchObject({
      containerType: 'micronix_tube',
      barcode: 'BC-1',
      collection: { type: 'micronix_plate', name: 'Plate-A', position: 'A01' },
    })
    expect(write).not.toHaveProperty('collectionName')
  })

  it('nests paper sheet and box parent by default', () => {
    const write = flatContainerRegistrationToWriteInput({
      containerType: 'paper',
      collectionName: 'PaperBox',
      sheetName: 'Sheet-1',
      sublabel: 'Spot-A',
    })
    expect(write).toMatchObject({
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'PaperBox' },
      },
    })
  })

  it('nests paper sheet and bag parent', () => {
    const write = flatContainerRegistrationToWriteInput({
      containerType: 'paper',
      parentCollectionType: 'bag',
      collectionName: 'PaperBag',
      sheetName: 'Sheet-1',
      sublabel: 'Spot-A',
    })
    expect(write).toMatchObject({
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'bag', name: 'PaperBag' },
      },
    })
  })
})
