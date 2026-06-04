import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import {
  mapPaperInboundFromLegacyRow,
  refinePaperContainerInboundWrite,
  validatePaperDerivationCsvFields,
} from '../paper-container-inbound'

const schema = z
  .object({
    containerType: z.enum(['paper', 'micronix_tube']),
    barcode: z.string().optional(),
    containerBarcode: z.string().optional(),
    position: z.string().optional(),
    sublabel: z.string().optional(),
  })
  .superRefine(refinePaperContainerInboundWrite)

describe('refinePaperContainerInboundWrite', () => {
  it('allows sublabel on paper containers', () => {
    expect(schema.safeParse({ containerType: 'paper', sublabel: 'Spot-A' }).success).toBe(true)
  })

  it('rejects barcode on paper containers', () => {
    expect(schema.safeParse({ containerType: 'paper', barcode: 'legacy' }).success).toBe(false)
  })

  it('rejects containerBarcode and position on paper containers', () => {
    expect(schema.safeParse({ containerType: 'paper', containerBarcode: 'x' }).success).toBe(false)
    expect(schema.safeParse({ containerType: 'paper', position: 'A01' }).success).toBe(false)
  })

  it('allows tube fields on micronix containers', () => {
    expect(
      schema.safeParse({
        containerType: 'micronix_tube',
        barcode: 'MT-1',
        position: 'A01',
      }).success,
    ).toBe(true)
  })
})

describe('mapPaperInboundFromLegacyRow', () => {
  it('prefers explicit sublabel over legacy barcode column', () => {
    expect(
      mapPaperInboundFromLegacyRow({ barcode: 'legacy', sublabel: 'Spot-A', sheet_name: 'S1' }),
    ).toEqual({ sublabel: 'Spot-A', sheetName: 'S1' })
  })

  it('maps legacy barcode when sublabel is absent', () => {
    expect(mapPaperInboundFromLegacyRow({ barcode: 'Spot-B' })).toEqual({ sublabel: 'Spot-B' })
  })
})

describe('validatePaperDerivationCsvFields', () => {
  it('flags tube columns on paper derivation rows', () => {
    expect(validatePaperDerivationCsvFields({ container_barcode: 'X' })).toMatch(/container_barcode/)
    expect(validatePaperDerivationCsvFields({ position: 'A01' })).toMatch(/position/)
    expect(validatePaperDerivationCsvFields({})).toBeUndefined()
  })
})
