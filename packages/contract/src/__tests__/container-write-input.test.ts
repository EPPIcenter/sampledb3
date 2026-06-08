import { describe, expect, it } from 'bun:test'
import {
  containerWriteInputSchema,
  csvRowToContainerWriteInput,
} from '../write'

describe('containerWriteInputSchema', () => {
  it('accepts paper container with sheet placement and box parent', () => {
    const result = containerWriteInputSchema.safeParse({
      containerType: 'paper',
      sublabel: 'Spot-A',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'box', name: 'PaperBox', locationId: 42 },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts paper container referencing existing sheet by id', () => {
    const result = containerWriteInputSchema.safeParse({
      containerType: 'paper',
      sublabel: 'Spot-B',
      collection: { type: 'sheet', id: 99, name: 'Sheet-Existing' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects barcode on paper container JSON', () => {
    const result = containerWriteInputSchema.safeParse({
      containerType: 'paper',
      barcode: 'legacy',
      collection: {
        type: 'sheet',
        name: 'Sheet-1',
        parent: { type: 'bag', name: 'Bag-A' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts micronix tube with barcode and plate placement', () => {
    const result = containerWriteInputSchema.safeParse({
      containerType: 'micronix_tube',
      barcode: 'MTX-001',
      collection: {
        type: 'micronix_plate',
        name: 'Plate-A',
        position: 'A01',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('csvRowToContainerWriteInput', () => {
  it('maps cryovial CSV row to ContainerWriteInput', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'cryovial_tube',
      box_name: 'Box-A',
      barcode: 'CV-001',
      position: 'B02',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        containerType: 'cryovial_tube',
        barcode: 'CV-001',
        collection: {
          type: 'cryovial_box',
          name: 'Box-A',
          position: 'B02',
        },
      })
    }
  })

  it('maps paper CSV row with box parent to ContainerWriteInput', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'paper',
      box_name: 'PaperBox',
      sheet_name: 'Sheet-1',
      sublabel: 'Spot-A',
      location_id: '42',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        containerType: 'paper',
        sublabel: 'Spot-A',
        collection: {
          type: 'sheet',
          name: 'Sheet-1',
          parent: {
            type: 'box',
            name: 'PaperBox',
            locationId: 42,
          },
        },
      })
    }
  })

  it('maps paper CSV row with bag parent to ContainerWriteInput', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'paper',
      bag_name: 'Bag-A',
      sheet_name: 'Sheet-2',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.collection).toEqual({
        type: 'sheet',
        name: 'Sheet-2',
        parent: { type: 'bag', name: 'Bag-A' },
      })
    }
  })

  it('rejects barcode column on paper CSV rows', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'paper',
      bag_name: 'Bag-A',
      sheet_name: 'Sheet-1',
      barcode: 'legacy-spot',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/sublabel/)
    }
  })

  it('rejects paper rows with both box_name and bag_name', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'paper',
      box_name: 'Box-A',
      bag_name: 'Bag-A',
      sheet_name: 'Sheet-1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/either box_name or bag_name/)
    }
  })

  it('requires sheet_name for derivation child paper rows', () => {
    const result = csvRowToContainerWriteInput(
      { container_type: 'paper', bag_name: 'Bag-A' },
      { requireSheetName: true },
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/sheet_name/)
    }
  })

  it('maps static_well CSV row to ContainerWriteInput', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'static_well',
      plate_name: 'Plate-B',
      position: 'C03',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        containerType: 'static_well',
        collection: {
          type: 'micronix_plate',
          name: 'Plate-B',
          position: 'C03',
        },
      })
    }
  })

  it('maps micronix CSV row using collection_barcode only', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'micronix_tube',
      collection_barcode: 'PL-BAR',
      barcode: 'MTX-002',
      position: 'D04',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.collection).toEqual({
        type: 'micronix_plate',
        barcode: 'PL-BAR',
        position: 'D04',
      })
    }
  })

  it('maps micronix CSV row to ContainerWriteInput', () => {
    const result = csvRowToContainerWriteInput({
      container_type: 'micronix_tube',
      plate_name: 'Plate-A',
      barcode: 'MTX-001',
      position: 'A01',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        containerType: 'micronix_tube',
        barcode: 'MTX-001',
        collection: {
          type: 'micronix_plate',
          name: 'Plate-A',
          position: 'A01',
        },
      })
    }
  })
})
