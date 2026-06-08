import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { refinePaperContainerInboundWrite } from '../paper-container-inbound'

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
