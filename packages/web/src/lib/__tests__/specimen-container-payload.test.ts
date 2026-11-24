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

  it('trims identifier strings on micronix tubes and omits blank values', () => {
    const trimmed = flatContainerRegistrationToWriteInput({
      containerType: 'micronix_tube',
      collectionName: '  Plate-A  ',
      collectionBarcode: '   ',
      barcode: '  BC-1  ',
      position: '  A01  ',
    })
    expect(trimmed).toEqual({
      containerType: 'micronix_tube',
      barcode: 'BC-1',
      collection: { type: 'micronix_plate', name: 'Plate-A', position: 'A01' },
    })

    const blank = flatContainerRegistrationToWriteInput({
      containerType: 'micronix_tube',
      collectionName: '   ',
      collectionBarcode: '   ',
      barcode: '   ',
      position: '   ',
    })
    expect(blank).toEqual({ containerType: 'micronix_tube' })
    expect(blank).not.toHaveProperty('barcode')
    expect(blank).not.toHaveProperty('collection')
  })

  it('trims barcode and collection barcode on cryovial tubes and omits blank values', () => {
    const trimmed = flatContainerRegistrationToWriteInput({
      containerType: 'cryovial_tube',
      collectionBarcode: '  BOX-BC  ',
      barcode: '  CV-1  ',
      position: ' B02 ',
    })
    expect(trimmed).toEqual({
      containerType: 'cryovial_tube',
      barcode: 'CV-1',
      collection: { type: 'cryovial_box', barcode: 'BOX-BC', position: 'B02' },
    })

    const blankBarcode = flatContainerRegistrationToWriteInput({
      containerType: 'cryovial_tube',
      collectionName: '  Box-1  ',
      barcode: '   ',
    })
    expect(blankBarcode).toEqual({
      containerType: 'cryovial_tube',
      collection: { type: 'cryovial_box', name: 'Box-1' },
    })
    expect(blankBarcode).not.toHaveProperty('barcode')
  })

  it('trims paper sublabel, sheet name, and parent name, omitting blank values', () => {
    const trimmed = flatContainerRegistrationToWriteInput({
      containerType: 'paper',
      collectionName: '  PaperBox  ',
      sheetName: '  Sheet-1  ',
      sublabel: '  Spot-A  ',
    })
    expect(trimmed).toEqual({
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'PaperBox' },
      },
    })

    const blankSublabel = flatContainerRegistrationToWriteInput({
      containerType: 'paper',
      collectionName: '  PaperBox  ',
      sheetName: '  Sheet-1  ',
      sublabel: '   ',
    })
    expect(blankSublabel).not.toHaveProperty('sublabel')
  })
})
